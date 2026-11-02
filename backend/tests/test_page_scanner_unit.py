from app.schemas.scan import ScanIssue
from app.services import page_scanner
from app.services.page_scanner import PageScanResult, ParsedPageData, ScanOptions


def test_custom_checks_detect_core_accessibility_issues():
    html = """
    <html>
      <head><title></title></head>
      <body>
        <h1>Main</h1>
        <h3>Skipped level</h3>
        <img src="/hero.png">
        <a href="/details">click here</a>
        <div id="duplicate"></div>
        <span id="duplicate"></span>
      </body>
    </html>
    """

    page_data = page_scanner._parse_page_html(html)
    issues = page_scanner._build_issues(page_data)
    rule_ids = {issue.rule_id for issue in issues}

    assert {
        "document-title",
        "html-lang",
        "image-alt",
        "link-name",
        "duplicate-id",
        "heading-order",
    }.issubset(rule_ids)


def test_discovered_url_normalization_filters_unsafe_and_static_assets():
    assert (
        page_scanner._normalize_discovered_url(
            "https://example.com/docs/",
            "../about#team",
        )
        == "https://example.com/about"
    )
    assert page_scanner._normalize_discovered_url("https://example.com", "mailto:a@b.test") is None
    assert page_scanner._normalize_discovered_url("https://example.com", "/logo.svg") is None
    assert page_scanner._normalize_discovered_url("https://example.com", "javascript:void(0)") is None


def test_queue_control_removes_excluded_urls_and_preserves_requested_order():
    queued_pages = [
        ("https://example.com/about", 1),
        ("https://example.com/contact", 1),
        ("https://example.com/pricing", 1),
    ]
    control = page_scanner.CrawlQueueControl(
        refresh=lambda: (
            ["https://example.com/pricing", "https://example.com/contact"],
            {"https://example.com/about"},
        )
    )

    updated_queue = page_scanner._apply_queue_control(queued_pages, control)

    assert updated_queue == [
        ("https://example.com/pricing", 1),
        ("https://example.com/contact", 1),
    ]


def test_multi_page_scan_tracks_skipped_previously_scanned_urls(monkeypatch):
    def fake_scan_one_page(url, options, *, run_browser_analysis, capture_screenshots, browser_session=None):
        links = [{"href": "/about"}, {"href": "/contact"}] if url == "https://example.com" else []
        return PageScanResult(
            final_url=url,
            page_data=ParsedPageData(title="Page", html_lang="en", links=links),
            issues=[],
        )

    monkeypatch.setattr(page_scanner, "_scan_one_page", fake_scan_one_page)

    result = page_scanner.scan_page(
        "https://example.com",
        ScanOptions(
            mode="multi",
            page_limit=3,
            crawl_depth=2,
            request_delay_ms=0,
            previously_scanned_urls=frozenset({"https://example.com/about"}),
            skip_previously_scanned_pages=True,
        ),
    )

    assert result.scanned_page_urls == ["https://example.com", "https://example.com/contact"]
    assert result.skipped_page_urls == ["https://example.com/about"]


def test_issue_page_url_and_source_are_assigned():
    issues = [
        ScanIssue(
            rule_id="image-alt",
            severity="medium",
            element="<img>",
            message="Image is missing an alt attribute.",
            recommendation="Add alt text.",
        )
    ]

    page_scanner._assign_issue_page_url(issues, "https://example.com/about")

    assert issues[0].page_url == "https://example.com/about"
    assert issues[0].source == "custom"


class _FakeResponse:
    def __init__(self, status: int = 200) -> None:
        self.status = status


class _FakePage:
    def __init__(self, html_by_url: dict[str, str]) -> None:
        self._html_by_url = html_by_url
        self.url = ""

    def set_default_timeout(self, timeout) -> None:
        pass

    def goto(self, url, wait_until=None, timeout=None):
        self.url = url
        return _FakeResponse(200)

    def wait_for_load_state(self, state=None, timeout=None) -> None:
        pass

    def wait_for_timeout(self, timeout) -> None:
        pass

    def content(self) -> str:
        return self._html_by_url[self.url]


class _FakeContext:
    def close(self) -> None:
        pass


class _FakeBrowserSession:
    instances = 0
    pages_opened = 0
    closes = 0
    html_by_url: dict[str, str] = {}

    def __init__(self) -> None:
        type(self).instances += 1

    def new_page(self):
        type(self).pages_opened += 1
        return _FakeContext(), _FakePage(type(self).html_by_url)

    def close(self) -> None:
        type(self).closes += 1


def test_multi_page_scan_reuses_one_browser_session_across_pages(monkeypatch):
    from app.services import axe_scanner

    _FakeBrowserSession.instances = 0
    _FakeBrowserSession.pages_opened = 0
    _FakeBrowserSession.closes = 0
    _FakeBrowserSession.html_by_url = {
        "https://example.com": (
            '<html lang="en"><head><title>Root</title></head><body>'
            '<a href="/about">About page</a><a href="/contact">Contact page</a>'
            "</body></html>"
        ),
        "https://example.com/about": (
            '<html lang="en"><head><title>About</title></head><body>About</body></html>'
        ),
        "https://example.com/contact": (
            '<html lang="en"><head><title>Contact</title></head><body>Contact</body></html>'
        ),
    }
    monkeypatch.setattr(page_scanner, "BrowserSession", _FakeBrowserSession)
    monkeypatch.setattr(axe_scanner, "run_axe_core", lambda page: [])

    result = page_scanner.scan_page(
        "https://example.com",
        ScanOptions(
            mode="multi",
            page_limit=3,
            crawl_depth=2,
            request_delay_ms=0,
            respect_robots_txt=False,
            run_browser_analysis_for_multi=True,
        ),
    )

    assert result.pages_scanned == 3
    assert _FakeBrowserSession.instances == 1
    assert _FakeBrowserSession.pages_opened == 3
    assert _FakeBrowserSession.closes == 1


class _FakeLocator:
    def __init__(self) -> None:
        self.first = self

    def count(self) -> int:
        return 1

    def scroll_into_view_if_needed(self, timeout=None) -> None:
        pass

    def bounding_box(self) -> dict[str, float]:
        return {"x": 10.0, "y": 10.0, "width": 100.0, "height": 50.0}


class _FakeShotPage:
    def __init__(self) -> None:
        self.screenshot_calls = 0
        self.viewport_size = {"width": 1280, "height": 720}

    def locator(self, selector):
        return _FakeLocator()

    def screenshot(self, **kwargs) -> bytes:
        self.screenshot_calls += 1
        return f"shot-{self.screenshot_calls}".encode()


def _screenshot_issue(dom_path: str | None = None) -> ScanIssue:
    return ScanIssue(
        rule_id="image-alt",
        severity="medium",
        element="<img>",
        message="Image is missing an alt attribute.",
        recommendation="Add alt text.",
        dom_path=dom_path,
    )


def test_attach_issue_screenshots_dedupes_captures_and_uploads(monkeypatch):
    stored: list[bytes] = []

    def fake_store(image_bytes, mime_type):
        stored.append(image_bytes)
        return f"stored-{len(stored)}"

    monkeypatch.setattr(page_scanner, "_store_screenshot", fake_store)

    page = _FakeShotPage()
    issues = [
        _screenshot_issue("body > img:nth-of-type(1)"),
        _screenshot_issue("body > img:nth-of-type(1)"),
        _screenshot_issue(None),
        _screenshot_issue(None),
    ]

    page_scanner._attach_issue_screenshots(page, issues)

    assert page.screenshot_calls == 2
    assert len(stored) == 2
    assert issues[0].screenshot_data_url == issues[1].screenshot_data_url
    assert issues[2].screenshot_data_url == issues[3].screenshot_data_url
    assert all(issue.screenshot_data_url for issue in issues)


def test_publish_queue_state_includes_cumulative_page_issues():
    published = []
    control = page_scanner.CrawlQueueControl(publish=published.append)
    issue = _screenshot_issue()
    pages = [
        PageScanResult(
            final_url="https://example.com",
            page_data=ParsedPageData(),
            issues=[issue],
        )
    ]

    page_scanner._publish_queue_state(
        control,
        current_page_url=None,
        queued_pages=[],
        scanned_pages=pages,
        skipped_urls=set(),
    )

    assert published[0].issues == (issue,)


def test_store_screenshot_uses_data_url_without_cloudinary(monkeypatch):
    monkeypatch.delenv("CLOUDINARY_URL", raising=False)

    stored_value = page_scanner._store_screenshot(b"image-bytes", "image/jpeg")

    assert stored_value == "data:image/jpeg;base64,aW1hZ2UtYnl0ZXM="


def test_store_screenshot_uploads_to_cloudinary_when_configured(monkeypatch):
    monkeypatch.setenv("CLOUDINARY_URL", "cloudinary://key:secret@example")
    monkeypatch.setattr(
        page_scanner,
        "_upload_screenshot_to_cloudinary",
        lambda image_bytes, mime_type: "https://res.cloudinary.com/example/image/upload/demo.jpg",
    )

    stored_value = page_scanner._store_screenshot(b"image-bytes", "image/jpeg")

    assert stored_value == "https://res.cloudinary.com/example/image/upload/demo.jpg"


def test_store_screenshot_omits_value_when_cloudinary_upload_fails(monkeypatch):
    monkeypatch.setenv("CLOUDINARY_URL", "cloudinary://key:secret@example")
    monkeypatch.delenv("CLOUDINARY_SCREENSHOT_FALLBACK", raising=False)
    monkeypatch.setattr(page_scanner, "_upload_screenshot_to_cloudinary", lambda *_args: None)

    stored_value = page_scanner._store_screenshot(b"image-bytes", "image/jpeg")

    assert stored_value is None


def test_store_screenshot_can_fallback_to_data_url_when_cloudinary_upload_fails(monkeypatch):
    monkeypatch.setenv("CLOUDINARY_URL", "cloudinary://key:secret@example")
    monkeypatch.setenv("CLOUDINARY_SCREENSHOT_FALLBACK", "data_url")
    monkeypatch.setattr(page_scanner, "_upload_screenshot_to_cloudinary", lambda *_args: None)

    stored_value = page_scanner._store_screenshot(b"image-bytes", "image/jpeg")

    assert stored_value == "data:image/jpeg;base64,aW1hZ2UtYnl0ZXM="
