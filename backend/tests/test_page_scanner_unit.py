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
    def fake_scan_one_page(url, options, *, run_browser_analysis, capture_screenshots):
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
