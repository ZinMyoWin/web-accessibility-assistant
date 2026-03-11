from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.schemas.scan import ScanIssue, ScanPageResponse, ScanSummary
from app.utils.url_utils import validate_public_http_url


VAGUE_LINK_TEXT = {"click here", "read more", "here", "more", "link"}


class ScanError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class ParsedPageData:
    html_lang: str | None = None
    title: str = ""
    images: list[dict[str, str]] = field(default_factory=list)
    links: list[dict[str, str]] = field(default_factory=list)
    heading_levels: list[int] = field(default_factory=list)
    ids: list[str] = field(default_factory=list)


class AccessibilityHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.data = ParsedPageData()
        self._in_title = False
        self._title_parts: list[str] = []
        self._active_link: dict[str, str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = {key: value or "" for key, value in attrs}

        if tag == "html":
            self.data.html_lang = attrs_map.get("lang", "").strip() or None

        if tag == "title":
            self._in_title = True

        if tag == "img":
            self.data.images.append(attrs_map)

        if tag == "a":
            self._active_link = {"href": attrs_map.get("href", ""), "text": ""}

        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.data.heading_levels.append(int(tag[1]))

        element_id = attrs_map.get("id", "").strip()
        if element_id:
            self.data.ids.append(element_id)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

        if tag == "a" and self._active_link is not None:
            self._active_link["text"] = self._active_link["text"].strip()
            self.data.links.append(self._active_link)
            self._active_link = None

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_parts.append(data)

        if self._active_link is not None:
            self._active_link["text"] += data

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
                )
            )

    duplicate_ids = {value: count for value, count in Counter(page.ids).items() if count > 1}
    for duplicate_id, count in duplicate_ids.items():
        issues.append(
            ScanIssue(
                rule_id="duplicate-id",
                severity="medium",
                element=f"id='{duplicate_id}'",
                message=f"Duplicate id found {count} times.",
                recommendation="Use unique id values for each element on the page.",
            )
        )

    previous_level: int | None = None
    for level in page.heading_levels:
        if previous_level is not None and level > previous_level + 1:
            issues.append(
                ScanIssue(
                    rule_id="heading-order",
                    severity="medium",
                    element=f"<h{level}>",
                    message="Heading levels skip hierarchy.",
                    recommendation="Use headings in order without skipping levels.",
                )
            )
        previous_level = level

    return issues


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
