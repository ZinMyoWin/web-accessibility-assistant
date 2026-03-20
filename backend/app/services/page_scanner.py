from __future__ import annotations

import base64
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from html import escape
from html.parser import HTMLParser
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

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


class AccessibilityHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.data = ParsedPageData()
        self._in_title = False
        self._title_parts: list[str] = []
        self._active_link: dict[str, str] | None = None
        self._active_heading: dict[str, str] | None = None
        self._tag_stack: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = {key: value or "" for key, value in attrs}
        line, column = self.getpos()
        position = SourcePosition(line=line, column=column + 1)
        source_hint = _build_source_hint(tag, attrs_map)
        current_descriptor = _build_tag_descriptor(tag, attrs_map)
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


def scan_page(url: str) -> ScanPageResponse:
    validate_public_http_url(url)

    try:
        html, final_url = _fetch_page_html(url)
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

    parser = AccessibilityHTMLParser()
    parser.feed(html)
    page_data = parser.finalize()
    issues = _build_issues(page_data)
    issues = _attach_issue_screenshots(final_url, html, issues)
    summary = _build_summary(issues)

    return ScanPageResponse(
        url=final_url,
        scanned_at=datetime.now(UTC).isoformat(),
        summary=summary,
        issues=issues,
    )


def _fetch_page_html(url: str) -> tuple[str, str]:
    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (compatible; WebAccessibilityAssistant/0.1; +https://example.com)"
            )
        },
    )
    with urlopen(request, timeout=20) as response:
        payload = response.read()
        content_type = response.headers.get("Content-Type", "")
        charset = "utf-8"
        if "charset=" in content_type:
            charset = content_type.split("charset=", maxsplit=1)[-1].split(";")[0].strip()
        html = payload.decode(charset or "utf-8", errors="replace")
        return html, response.geturl()


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


def _attach_issue_screenshots(url: str, html: str, issues: list[ScanIssue]) -> list[ScanIssue]:
    if not issues:
        return issues

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return issues

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                ],
            )
            context = browser.new_context(
                viewport={"width": 1440, "height": 960},
                locale="en-US",
                color_scheme="light",
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/133.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()
            page.set_content(_prepare_html_for_screenshot(html, url), wait_until="domcontentloaded")
            page.wait_for_timeout(1200)

            for issue in issues:
                issue.screenshot_data_url = _capture_issue_screenshot(page, issue)

            context.close()
            browser.close()
    except Exception:
        return issues

    return issues


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


def _build_tag_descriptor(tag: str, attrs_map: dict[str, str]) -> str:
    element_id = attrs_map.get("id", "").strip()
    if element_id:
        return f"{tag}#{element_id}"

    class_names = [name for name in attrs_map.get("class", "").split() if name]
    if class_names:
        return f"{tag}." + ".".join(class_names[:2])

    return tag


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
    parts = [part for part in [*stack, current_descriptor] if part.split(".", 1)[0] not in PATH_NOISE_TAGS]

    if "body" in parts:
        parts = parts[parts.index("body") :]

    if len(parts) > 8:
        parts = parts[-8:]

    return " > ".join(parts)


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
