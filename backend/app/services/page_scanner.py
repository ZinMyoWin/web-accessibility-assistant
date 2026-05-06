from __future__ import annotations

import base64
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from fnmatch import fnmatch
from html import escape
from html.parser import HTMLParser
import re
from time import sleep
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urldefrag, urljoin, urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

from app.schemas.scan import ScanIssue, ScanPageResponse, ScanSummary
from app.utils.url_utils import validate_public_http_url


VAGUE_LINK_TEXT = {"click here", "read more", "here", "more", "link"}
VOID_ELEMENTS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}
PATH_NOISE_TAGS = {"meta", "link", "script", "style", "br"}
SKIPPED_CRAWL_EXTENSIONS = {
    ".7z",
    ".avi",
    ".css",
    ".csv",
    ".doc",
    ".docx",
    ".gif",
    ".gz",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".json",
    ".mov",
    ".mp3",
    ".mp4",
    ".pdf",
    ".png",
    ".svg",
    ".webp",
    ".xls",
    ".xlsx",
    ".zip",
}


class ScanError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class SourcePosition:
    line: int
    column: int


@dataclass
class ParsedPageData:
    html_lang: str | None = None
    html_position: SourcePosition | None = None
    html_source_hint: str | None = None
    title: str = ""
    images: list[dict[str, str]] = field(default_factory=list)
    links: list[dict[str, str]] = field(default_factory=list)
    heading_levels: list[dict[str, str]] = field(default_factory=list)
    ids: list[dict[str, str]] = field(default_factory=list)


@dataclass(frozen=True)
class ScanOptions:
    mode: str = "single"
    page_limit: int = 5
    crawl_depth: int = 3
    request_delay_ms: int = 250
    page_timeout_ms: int = 15000
    ignored_url_patterns: tuple[str, ...] = ()
    stay_within_domain: bool = True
    respect_robots_txt: bool = True
    skip_previously_scanned_pages: bool = True
    previously_scanned_urls: frozenset[str] = frozenset()
    run_browser_analysis_for_multi: bool = False


@dataclass(frozen=True)
class CrawlQueueState:
    current_page_url: str | None
    queued_page_urls: list[str]
    scanned_page_urls: list[str]
    skipped_page_urls: list[str]


@dataclass(frozen=True)
class CrawlQueueControl:
    publish: Callable[[CrawlQueueState], None] | None = None
    refresh: Callable[[], tuple[list[str], set[str]]] | None = None


@dataclass
class PageScanResult:
    final_url: str
    page_data: ParsedPageData
    issues: list[ScanIssue]


class AccessibilityHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.data = ParsedPageData()
        self._in_title = False
        self._title_parts: list[str] = []
        self._active_link: dict[str, str] | None = None
        self._active_heading: dict[str, str] | None = None
        self._tag_stack: list[str] = []
        self._child_counts_stack: list[Counter[str]] = [Counter()]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = {key: value or "" for key, value in attrs}
        line, column = self.getpos()
        position = SourcePosition(line=line, column=column + 1)
        source_hint = _build_source_hint(tag, attrs_map)
        current_counter = self._child_counts_stack[-1]
        current_counter[tag] += 1
        current_descriptor = _build_tag_descriptor(tag, attrs_map, current_counter[tag])
        dom_path = _build_dom_path(self._tag_stack, current_descriptor)

        if tag == "html":
            self.data.html_lang = attrs_map.get("lang", "").strip() or None
            self.data.html_position = position
            self.data.html_source_hint = source_hint

        if tag == "title":
            self._in_title = True

        if tag == "img":
            self.data.images.append(
                {
                    **attrs_map,
                    "__line": str(position.line),
                    "__column": str(position.column),
                    "__source_hint": source_hint or "<img>",
                    "__dom_path": dom_path,
                }
            )

        if tag == "a":
            self._active_link = {
                "href": attrs_map.get("href", ""),
                "text": "",
                "__line": str(position.line),
                "__column": str(position.column),
                "__source_hint": source_hint or "<a>",
                "__dom_path": dom_path,
            }

        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self._active_heading = {
                "tag": tag,
                "level": str(int(tag[1])),
                "text": "",
                "line": str(position.line),
                "column": str(position.column),
                "source_hint": source_hint or f"<{tag}>",
                "dom_path": dom_path,
            }

        element_id = attrs_map.get("id", "").strip()
        if element_id:
            self.data.ids.append(
                {
                    "value": element_id,
                    "line": str(position.line),
                    "column": str(position.column),
                    "source_hint": source_hint or f"<{tag}>",
                    "dom_path": dom_path,
                }
            )

        if tag not in VOID_ELEMENTS:
            self._tag_stack.append(current_descriptor)
            self._child_counts_stack.append(Counter())

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

        if tag == "a" and self._active_link is not None:
            self._active_link["text"] = self._active_link["text"].strip()
            self.data.links.append(self._active_link)
            self._active_link = None

        if self._active_heading is not None and tag == self._active_heading["tag"]:
            self._active_heading["text"] = " ".join(self._active_heading["text"].split())
            self.data.heading_levels.append(self._active_heading)
            self._active_heading = None

        if tag not in VOID_ELEMENTS and self._tag_stack:
            self._tag_stack.pop()
            if len(self._child_counts_stack) > 1:
                self._child_counts_stack.pop()

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_parts.append(data)

        if self._active_link is not None:
            self._active_link["text"] += data

        if self._active_heading is not None:
            self._active_heading["text"] += data

    def finalize(self) -> ParsedPageData:
        self.data.title = "".join(self._title_parts).strip()
        return self.data


def scan_page(
    url: str,
    options: ScanOptions | None = None,
    queue_control: CrawlQueueControl | None = None,
) -> ScanPageResponse:
    validate_public_http_url(url)
    resolved_options = options or ScanOptions(mode="single", page_limit=1, crawl_depth=1)

    if resolved_options.mode == "multi":
        return _scan_multiple_pages(url, resolved_options, queue_control)
    return _scan_single_page(url, resolved_options)


def _scan_single_page(url: str, options: ScanOptions) -> ScanPageResponse:
    page_result = _scan_one_page(
        url,
        options,
        run_browser_analysis=True,
        capture_screenshots=True,
    )
    summary = _build_summary(page_result.issues)

    return ScanPageResponse(
        url=page_result.final_url,
        scanned_at=datetime.now(UTC).isoformat(),
        mode="single",
        pages_scanned=1,
        pages_skipped=0,
        scanned_page_urls=[page_result.final_url],
        skipped_page_urls=[],
        summary=summary,
        issues=page_result.issues,
    )


def _scan_multiple_pages(
    url: str,
    options: ScanOptions,
    queue_control: CrawlQueueControl | None = None,
) -> ScanPageResponse:
    _publish_queue_state(
        queue_control,
        current_page_url=url,
        queued_pages=[],
        scanned_pages=[],
        skipped_urls=set(),
    )
    root_result = _scan_one_page(
        url,
        options,
        run_browser_analysis=options.run_browser_analysis_for_multi,
        capture_screenshots=False,
    )
    scanned_pages = [root_result]
    queued_pages: list[tuple[str, int]] = []
    visited_urls = {
        _normalize_url(url),
        _normalize_url(root_result.final_url),
    }
    robots_cache: dict[str, RobotFileParser | None] = {}
    root_host = urlparse(root_result.final_url).hostname
    skipped_urls: set[str] = set()

    if options.crawl_depth > 1:
        next_queue, _ = _build_next_page_queue(
            page_data=root_result.page_data,
            base_url=root_result.final_url,
            next_depth=1,
            root_host=root_host,
            visited_urls=visited_urls,
            skipped_urls=skipped_urls,
            options=options,
        )
        queued_pages.extend(next_queue)
        queued_pages = _apply_queue_control(queued_pages, queue_control)
        _publish_queue_state(
            queue_control,
            current_page_url=None,
            queued_pages=queued_pages,
            scanned_pages=scanned_pages,
            skipped_urls=skipped_urls,
        )

    while queued_pages and len(scanned_pages) < options.page_limit:
        queued_pages = _apply_queue_control(queued_pages, queue_control)
        if not queued_pages:
            break

        candidate_url, depth = queued_pages.pop(0)
        normalized_candidate = _normalize_url(candidate_url)
        if normalized_candidate in visited_urls:
            continue

        _publish_queue_state(
            queue_control,
            current_page_url=candidate_url,
            queued_pages=queued_pages,
            scanned_pages=scanned_pages,
            skipped_urls=skipped_urls,
        )

        if options.request_delay_ms > 0:
            sleep(options.request_delay_ms / 1000)

        if options.respect_robots_txt and not _is_allowed_by_robots(candidate_url, robots_cache):
            visited_urls.add(normalized_candidate)
            continue

        try:
            page_result = _scan_one_page(
                candidate_url,
                options,
                run_browser_analysis=options.run_browser_analysis_for_multi,
                capture_screenshots=False,
            )
        except ScanError:
            visited_urls.add(normalized_candidate)
            continue

        visited_urls.add(normalized_candidate)
        visited_urls.add(_normalize_url(page_result.final_url))
        scanned_pages.append(page_result)
        _publish_queue_state(
            queue_control,
            current_page_url=None,
            queued_pages=queued_pages,
            scanned_pages=scanned_pages,
            skipped_urls=skipped_urls,
        )

        if depth + 1 >= options.crawl_depth or len(scanned_pages) >= options.page_limit:
            continue

        next_queue, _ = _build_next_page_queue(
            page_data=page_result.page_data,
            base_url=page_result.final_url,
            next_depth=depth + 1,
            root_host=root_host,
            visited_urls=visited_urls,
            skipped_urls=skipped_urls,
            options=options,
        )
        queued_pages.extend(next_queue)
        queued_pages = _apply_queue_control(queued_pages, queue_control)
        _publish_queue_state(
            queue_control,
            current_page_url=None,
            queued_pages=queued_pages,
            scanned_pages=scanned_pages,
            skipped_urls=skipped_urls,
        )

    all_issues = [issue for page in scanned_pages for issue in page.issues]
    summary = _build_summary(all_issues)

    return ScanPageResponse(
        url=root_result.final_url,
        scanned_at=datetime.now(UTC).isoformat(),
        mode="multi",
        pages_scanned=len(scanned_pages),
        pages_skipped=len(skipped_urls),
        scanned_page_urls=[page.final_url for page in scanned_pages],
        skipped_page_urls=sorted(skipped_urls),
        queued_page_urls=[],
        current_page_url=None,
        summary=summary,
        issues=all_issues,
    )


def _publish_queue_state(
    queue_control: CrawlQueueControl | None,
    *,
    current_page_url: str | None,
    queued_pages: list[tuple[str, int]],
    scanned_pages: list[PageScanResult],
    skipped_urls: set[str],
) -> None:
    if queue_control is None or queue_control.publish is None:
        return
    queue_control.publish(
        CrawlQueueState(
            current_page_url=current_page_url,
            queued_page_urls=[url for url, _depth in queued_pages],
            scanned_page_urls=[page.final_url for page in scanned_pages],
            skipped_page_urls=sorted(skipped_urls),
        )
    )


def _apply_queue_control(
    queued_pages: list[tuple[str, int]],
    queue_control: CrawlQueueControl | None,
) -> list[tuple[str, int]]:
    if queue_control is None or queue_control.refresh is None:
        return queued_pages

    requested_order, excluded_urls = queue_control.refresh()
    excluded_normalized = {_normalize_url(url) for url in excluded_urls}
    filtered_pages = [
        (url, depth)
        for url, depth in queued_pages
        if _normalize_url(url) not in excluded_normalized
    ]

    if not requested_order:
        return filtered_pages

    order_index = {_normalize_url(url): index for index, url in enumerate(requested_order)}
    return sorted(
        filtered_pages,
        key=lambda item: order_index.get(_normalize_url(item[0]), len(order_index)),
    )


def _scan_one_page(
    url: str,
    options: ScanOptions,
    *,
    run_browser_analysis: bool,
    capture_screenshots: bool,
) -> PageScanResult:
    if run_browser_analysis:
        rendered_result = _scan_rendered_page(
            url,
            options,
            capture_screenshots=capture_screenshots,
        )
        if rendered_result is not None:
            return rendered_result

    try:
        html, final_url = _fetch_page_html(url, timeout_seconds=_timeout_seconds(options.page_timeout_ms))
    except HTTPError as exc:
        raise ScanError(
            message=f"Failed to fetch URL. HTTP {exc.code}",
            status_code=exc.code,
        ) from exc
    except URLError as exc:
        raise ScanError(
            message=f"Failed to fetch URL: {exc.reason}",
            status_code=502,
        ) from exc
    except TimeoutError as exc:
        raise ScanError("Request timed out while fetching URL", status_code=504) from exc

    page_data = _parse_page_html(html)
    custom_issues = _build_issues(page_data)
    if run_browser_analysis:
        issues = _run_playwright_analysis(
            final_url,
            html,
            custom_issues,
            page_timeout_ms=options.page_timeout_ms,
            capture_screenshots=capture_screenshots,
        )
    else:
        issues = custom_issues
    _assign_issue_page_url(issues, final_url)
    return PageScanResult(final_url=final_url, page_data=page_data, issues=issues)


def _scan_rendered_page(
    url: str,
    options: ScanOptions,
    *,
    capture_screenshots: bool,
) -> PageScanResult | None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None

    try:
        from app.services.axe_scanner import merge_issues, run_axe_core
    except ImportError:
        merge_issues = None
        run_axe_core = None

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                ],
            )
            context = None
            try:
                context = _new_browser_context(browser)
                page = context.new_page()
                page.set_default_timeout(options.page_timeout_ms)
                response = page.goto(
                    url,
                    wait_until="domcontentloaded",
                    timeout=options.page_timeout_ms,
                )
                if response and response.status >= 400:
                    raise ScanError(
                        message=f"Failed to fetch URL. HTTP {response.status}",
                        status_code=response.status,
                    )

                _wait_for_rendered_content(page, options.page_timeout_ms)
                html = page.content()
                final_url = page.url
                page_data = _parse_page_html(html)
                custom_issues = _build_issues(page_data)

                if run_axe_core is not None and merge_issues is not None:
                    try:
                        axe_issues = run_axe_core(page)
                        issues = merge_issues(custom_issues, axe_issues)
                    except Exception:
                        issues = _mark_custom_issues(custom_issues)
                else:
                    issues = _mark_custom_issues(custom_issues)

                if capture_screenshots:
                    for issue in issues:
                        issue.screenshot_data_url = _capture_issue_screenshot(page, issue)

                _assign_issue_page_url(issues, final_url)
                return PageScanResult(
                    final_url=final_url,
                    page_data=page_data,
                    issues=issues,
                )
            finally:
                if context is not None:
                    context.close()
                browser.close()
    except ScanError:
        raise
    except Exception:
        return None


def _fetch_page_html(url: str, timeout_seconds: float) -> tuple[str, str]:
    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (compatible; WebAccessibilityAssistant/0.1; +https://example.com)"
            )
        },
    )
    with urlopen(request, timeout=timeout_seconds) as response:
        payload = response.read()
        content_type = response.headers.get("Content-Type", "")
        charset = "utf-8"
        if "charset=" in content_type:
            charset = content_type.split("charset=", maxsplit=1)[-1].split(";")[0].strip()
        html = payload.decode(charset or "utf-8", errors="replace")
        return html, response.geturl()


def _parse_page_html(html: str) -> ParsedPageData:
    parser = AccessibilityHTMLParser()
    parser.feed(html)
    return parser.finalize()


def _build_issues(page: ParsedPageData) -> list[ScanIssue]:
    issues: list[ScanIssue] = []

    if not page.title:
        issues.append(
            ScanIssue(
                rule_id="document-title",
                severity="high",
                element="<title>",
                message="Document title is missing or empty.",
                recommendation="Add a clear and descriptive <title> for the page.",
                source_hint="<title> is missing from the fetched HTML.",
            )
        )

    if not page.html_lang:
        issues.append(
            ScanIssue(
                rule_id="html-lang",
                severity="high",
                element="<html>",
                message="The <html> element is missing a lang attribute.",
                recommendation="Set the primary language, for example <html lang='en'>.",
                line=page.html_position.line if page.html_position else None,
                column=page.html_position.column if page.html_position else None,
                source_hint=page.html_source_hint,
                dom_path="html",
            )
        )

    for index, image_attrs in enumerate(page.images, start=1):
        if "alt" not in image_attrs:
            issues.append(
                ScanIssue(
                    rule_id="image-alt",
                    severity="medium",
                    element=f"<img> #{index}",
                    message="Image is missing an alt attribute.",
                    recommendation=(
                        "Add meaningful alt text, or use alt='' for decorative images."
                    ),
                    line=int(image_attrs["__line"]),
                    column=int(image_attrs["__column"]),
                    source_hint=image_attrs["__source_hint"],
                    dom_path=image_attrs["__dom_path"],
                    text_preview=_build_image_preview(image_attrs),
                )
            )

    for link in page.links:
        text = " ".join(link.get("text", "").lower().split())
        if text and text in VAGUE_LINK_TEXT:
            issues.append(
                ScanIssue(
                    rule_id="link-name",
                    severity="low",
                    element=f"<a href='{link.get('href', '')}'>",
                    message=f"Link text '{text}' is too vague.",
                    recommendation=(
                        "Use descriptive link text that communicates destination or action."
                    ),
                    line=int(link["__line"]),
                    column=int(link["__column"]),
                    source_hint=link["__source_hint"],
                    dom_path=link["__dom_path"],
                    text_preview=link.get("text", "").strip() or None,
                )
            )

    id_counts = Counter(item["value"] for item in page.ids)
    duplicate_ids = {value: count for value, count in id_counts.items() if count > 1}
    for duplicate_id, count in duplicate_ids.items():
        occurrences = [item for item in page.ids if item["value"] == duplicate_id]
        first_occurrence = occurrences[0]
        lines = ", ".join(item["line"] for item in occurrences)
        issues.append(
            ScanIssue(
                rule_id="duplicate-id",
                severity="medium",
                element=f"id='{duplicate_id}'",
                message=f"Duplicate id found {count} times.",
                recommendation="Use unique id values for each element on the page.",
                line=int(first_occurrence["line"]),
                column=int(first_occurrence["column"]),
                source_hint=f"Found at lines {lines}. First occurrence: {first_occurrence['source_hint']}",
                dom_path=first_occurrence["dom_path"],
                text_preview=f"Search for {duplicate_id}",
            )
        )

    previous_level: int | None = None
    for heading in page.heading_levels:
        level = int(heading["level"])
        if previous_level is not None and level > previous_level + 1:
            issues.append(
                ScanIssue(
                    rule_id="heading-order",
                    severity="medium",
                    element=f"<h{level}>",
                    message="Heading levels skip hierarchy.",
                    recommendation="Use headings in order without skipping levels.",
                    line=int(heading["line"]),
                    column=int(heading["column"]),
                    source_hint=heading["source_hint"],
                    dom_path=heading["dom_path"],
                    text_preview=heading["text"] or None,
                )
            )
        previous_level = level

    return issues


def _run_playwright_analysis(
    url: str,
    html: str,
    custom_issues: list[ScanIssue],
    *,
    page_timeout_ms: int,
    capture_screenshots: bool,
) -> list[ScanIssue]:
    """Run axe-core analysis and capture screenshots in a single Playwright session."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        for issue in custom_issues:
            issue.source = "custom"
        return custom_issues

    try:
        from app.services.axe_scanner import merge_issues, run_axe_core
    except ImportError:
        for issue in custom_issues:
            issue.source = "custom"
        return custom_issues

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                ],
            )
            context = _new_browser_context(browser)
            page = context.new_page()
            page.set_default_timeout(page_timeout_ms)
            page.set_content(
                _prepare_html_for_screenshot(html, url),
                wait_until="domcontentloaded",
            )
            page.wait_for_timeout(1200)

            # Run axe-core analysis and merge with custom issues
            try:
                axe_issues = run_axe_core(page)
                all_issues = merge_issues(custom_issues, axe_issues)
            except Exception:
                all_issues = custom_issues
                for issue in all_issues:
                    issue.source = issue.source or "custom"

            if capture_screenshots:
                for issue in all_issues:
                    issue.screenshot_data_url = _capture_issue_screenshot(page, issue)

            context.close()
            browser.close()
            return all_issues
    except Exception:
        return _mark_custom_issues(custom_issues)


def _new_browser_context(browser):
    return browser.new_context(
        viewport={"width": 1440, "height": 960},
        locale="en-US",
        color_scheme="light",
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/133.0.0.0 Safari/537.36"
        ),
    )


def _wait_for_rendered_content(page, page_timeout_ms: int) -> None:
    try:
        page.wait_for_load_state(
            "networkidle",
            timeout=min(max(page_timeout_ms // 3, 1000), 5000),
        )
    except Exception:
        pass
    page.wait_for_timeout(min(max(page_timeout_ms // 20, 500), 1500))


def _mark_custom_issues(custom_issues: list[ScanIssue]) -> list[ScanIssue]:
    for issue in custom_issues:
        issue.source = issue.source or "custom"
    return custom_issues


def _capture_issue_screenshot(page, issue: ScanIssue) -> str | None:
    selector = _build_issue_selector(issue)

    if selector:
        try:
            locator = page.locator(selector).first
            if locator.count() > 0:
                locator.scroll_into_view_if_needed(timeout=5000)
                box = locator.bounding_box()
                if box:
                    image_bytes = page.screenshot(
                        type="jpeg",
                        quality=65,
                        clip=_build_context_clip(page, box),
                    )
                    return _to_data_url(image_bytes, "image/jpeg")
        except Exception:
            pass

    try:
        viewport = page.viewport_size or {"width": 1280, "height": 720}
        image_bytes = page.screenshot(
            type="jpeg",
            quality=65,
            clip={
                "x": 0,
                "y": 0,
                "width": float(min(viewport["width"], 1280)),
                "height": float(min(viewport["height"], 720)),
            },
        )
        return _to_data_url(image_bytes, "image/jpeg")
    except Exception:
        return None


def _build_issue_selector(issue: ScanIssue) -> str | None:
    if issue.dom_path == "html":
        return "html"

    if issue.dom_path:
        return issue.dom_path

    if issue.element.startswith("id='") and issue.element.endswith("'"):
        return f"[{issue.element}]"

    return None


def _build_context_clip(page, box: dict[str, float]) -> dict[str, float]:
    viewport = page.viewport_size or {"width": 1280, "height": 720}

    padding_x = 140.0
    padding_y = 120.0
    min_width = 760.0
    min_height = 420.0

    clip_x = max(box["x"] - padding_x, 0.0)
    clip_y = max(box["y"] - padding_y, 0.0)
    clip_width = max(box["width"] + (padding_x * 2), min_width)
    clip_height = max(box["height"] + (padding_y * 2), min_height)

    max_width = float(viewport["width"])
    max_height = float(viewport["height"])

    if clip_x + clip_width > max_width:
        clip_x = max(max_width - clip_width, 0.0)
    if clip_y + clip_height > max_height:
        clip_y = max(max_height - clip_height, 0.0)

    clip_width = min(clip_width, max_width)
    clip_height = min(clip_height, max_height)

    return {
        "x": float(clip_x),
        "y": float(clip_y),
        "width": float(clip_width),
        "height": float(clip_height),
    }


def _to_data_url(image_bytes: bytes, mime_type: str) -> str:
    return f"data:{mime_type};base64," + base64.b64encode(image_bytes).decode("ascii")


def _prepare_html_for_screenshot(html: str, base_url: str) -> str:
    sanitized_html = re.sub(
        r"<script\b[^>]*>.*?</script>",
        "",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )

    base_tag = f'<base href="{escape(base_url, quote=True)}">'
    helper_style = (
        "<style>"
        "html,body{background:#fff !important;}"
        "body{margin:0 auto;max-width:1440px;}"
        "iframe{display:none !important;}"
        "</style>"
    )

    if re.search(r"<head\b[^>]*>", sanitized_html, flags=re.IGNORECASE):
        return re.sub(
            r"(<head\b[^>]*>)",
            r"\1" + base_tag + helper_style,
            sanitized_html,
            count=1,
            flags=re.IGNORECASE,
        )

    if re.search(r"<html\b[^>]*>", sanitized_html, flags=re.IGNORECASE):
        return re.sub(
            r"(<html\b[^>]*>)",
            r"\1<head>" + base_tag + helper_style + "</head>",
            sanitized_html,
            count=1,
            flags=re.IGNORECASE,
        )

    return (
        "<!DOCTYPE html><html><head>"
        + base_tag
        + helper_style
        + "</head><body>"
        + sanitized_html
        + "</body></html>"
    )


def _build_summary(issues: list[ScanIssue]) -> ScanSummary:
    high = sum(issue.severity == "high" for issue in issues)
    medium = sum(issue.severity == "medium" for issue in issues)
    low = sum(issue.severity == "low" for issue in issues)

    return ScanSummary(
        total_issues=len(issues),
        high=high,
        medium=medium,
        low=low,
    )


def _timeout_seconds(page_timeout_ms: int) -> float:
    return max(page_timeout_ms / 1000, 1.0)


def _assign_issue_page_url(issues: list[ScanIssue], page_url: str) -> None:
    for issue in issues:
        issue.page_url = page_url
        issue.source = issue.source or "custom"


def _build_next_page_queue(
    *,
    page_data: ParsedPageData,
    base_url: str,
    next_depth: int,
    root_host: str | None,
    visited_urls: set[str],
    skipped_urls: set[str],
    options: ScanOptions,
) -> tuple[list[tuple[str, int]], int]:
    queued: list[tuple[str, int]] = []
    skipped_before = len(skipped_urls)

    for link in page_data.links:
        normalized = _normalize_discovered_url(base_url, link.get("href", ""))
        if not normalized:
            continue
        if normalized in visited_urls:
            continue
        if _matches_ignored_pattern(normalized, options.ignored_url_patterns):
            continue
        if options.stay_within_domain and root_host and not _is_same_host(normalized, root_host):
            continue
        if (
            options.skip_previously_scanned_pages
            and root_host
            and _is_same_host(normalized, root_host)
            and normalized in options.previously_scanned_urls
        ):
            skipped_urls.add(normalized)
            continue
        queued.append((normalized, next_depth))

    return queued, len(skipped_urls) - skipped_before


def _normalize_discovered_url(base_url: str, href: str) -> str | None:
    trimmed_href = href.strip()
    if not trimmed_href:
        return None
    if trimmed_href.startswith(("mailto:", "tel:", "javascript:")):
        return None

    absolute_url = urljoin(base_url, trimmed_href)
    absolute_url, _ = urldefrag(absolute_url)
    if not absolute_url.startswith(("http://", "https://")):
        return None

    if _has_skipped_crawl_extension(absolute_url):
        return None

    try:
        validate_public_http_url(absolute_url)
    except ValueError:
        return None

    return _normalize_url(absolute_url)


def _normalize_url(url: str) -> str:
    normalized, _ = urldefrag(url.strip())
    parsed = urlparse(normalized)
    path = parsed.path.rstrip("/")
    if not path:
        path = "/"
    rebuilt = parsed._replace(
        scheme=parsed.scheme.lower(),
        netloc=parsed.netloc.lower(),
        path=path,
        fragment="",
    )
    normalized_url = rebuilt.geturl()
    return normalized_url.rstrip("/") or normalized_url


def _matches_ignored_pattern(url: str, patterns: tuple[str, ...]) -> bool:
    parsed = urlparse(url)
    candidates = [url, parsed.path or "/"]

    for raw_pattern in patterns:
        pattern = raw_pattern.strip()
        if not pattern:
            continue

        if any(token in pattern for token in "*?[]"):
            if any(fnmatch(candidate, pattern) for candidate in candidates):
                return True
            continue

        if any(pattern in candidate for candidate in candidates):
            return True

    return False


def _is_same_host(url: str, host: str) -> bool:
    return (urlparse(url).hostname or "").lower() == host.lower()


def _has_skipped_crawl_extension(url: str) -> bool:
    path = urlparse(url).path.lower()
    return any(path.endswith(extension) for extension in SKIPPED_CRAWL_EXTENSIONS)


def _is_allowed_by_robots(
    url: str, robots_cache: dict[str, RobotFileParser | None]
) -> bool:
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    if origin not in robots_cache:
        robots_url = f"{origin}/robots.txt"
        parser = RobotFileParser()
        parser.set_url(robots_url)
        try:
            with urlopen(robots_url, timeout=3) as response:
                lines = response.read().decode("utf-8", errors="replace").splitlines()
            parser.parse(lines)
            robots_cache[origin] = parser
        except Exception:
            robots_cache[origin] = None

    parser = robots_cache[origin]
    return True if parser is None else parser.can_fetch("*", url)


def _build_tag_descriptor(tag: str, attrs_map: dict[str, str], occurrence: int) -> str:
    element_id = attrs_map.get("id", "").strip()
    if element_id:
        return f"{tag}#{element_id}"

    class_names = [name for name in attrs_map.get("class", "").split() if name]
    if class_names:
        descriptor = f"{tag}." + ".".join(class_names[:2])
    else:
        descriptor = tag

    return f"{descriptor}:nth-of-type({occurrence})"


def _build_source_hint(tag: str, attrs_map: dict[str, str]) -> str:
    parts = [tag]

    for key in ("id", "class", "href", "src", "aria-label", "role"):
        value = attrs_map.get(key, "").strip()
        if not value:
            continue
        compact_value = value
        if key == "class":
            compact_value = " ".join(value.split()[:2])
        if key in {"href", "src"}:
            compact_value = _shorten_value(value, 80)
        else:
            compact_value = _shorten_value(compact_value, 40)
        parts.append(f"{key}='{compact_value}'")

    return "<" + " ".join(parts) + ">"


def _build_dom_path(stack: list[str], current_descriptor: str) -> str:
    parts = [
        part
        for part in [*stack, current_descriptor]
        if _descriptor_tag(part) not in PATH_NOISE_TAGS
    ]

    body_index = next(
        (index for index, part in enumerate(parts) if _descriptor_tag(part) == "body"),
        None,
    )
    if body_index is not None:
        parts = parts[body_index:]

    if len(parts) > 8:
        parts = parts[-8:]

    return " > ".join(parts)


def _descriptor_tag(descriptor: str) -> str:
    return descriptor.split(".", 1)[0].split("#", 1)[0].split(":", 1)[0]


def _shorten_value(value: str, max_length: int) -> str:
    clean_value = " ".join(value.split())
    if len(clean_value) <= max_length:
        return clean_value
    return clean_value[: max_length - 3] + "..."


def _build_image_preview(image_attrs: dict[str, str]) -> str | None:
    aria_label = image_attrs.get("aria-label", "").strip()
    if aria_label:
        return aria_label

    src = image_attrs.get("src", "").strip()
    if not src:
        return None

    return src.rstrip("/").split("/")[-1] or src
