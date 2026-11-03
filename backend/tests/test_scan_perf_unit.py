"""Focused unit tests for scanner-engine performance and safety work.

Covers: worker-level browser reuse/recycling, render-wait tuning, screenshot
caps, vendored axe-core loading, phase timings, scan time budget, SSRF
validation, and the raw-HTML fallback regression that silently skipped
axe-core.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app import scan_worker
from app.schemas.scan import ScanIssue, ScanPageResponse, ScanSummary
from app.services import axe_scanner, page_scanner
from app.services.page_scanner import (
    PageScanResult,
    ParsedPageData,
    PhaseTimer,
    ScanError,
    ScanOptions,
)
from app.utils import url_utils

DEFAULT_HTML = (
    '<html lang="en"><head><title>Test page</title></head><body>'
    '<h1>Heading</h1></body></html>'
)

AXE_ASSET_SIZE = 553290
AXE_ASSET_SHA256 = "b511cd9dec01c76f4b2ad1723b66b6db37d4c2eb4ed199076e1829d9ee7b75e3"


# ---------------------------------------------------------------------------
# Shared fakes
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, status: int = 200) -> None:
        self.status = status


class _FakePage:
    def __init__(
        self,
        html: str = DEFAULT_HTML,
        url: str = "https://example.com",
        status: int = 200,
    ) -> None:
        self._html = html
        self.url = url
        self._status = status
        self.load_state_calls: list[tuple[str, int | None]] = []
        self.timeout_calls: list[int] = []
        self.set_content_calls: list[str] = []

    def set_default_timeout(self, timeout) -> None:
        pass

    def goto(self, url, wait_until=None, timeout=None):
        self.url = url
        return _FakeResponse(self._status)

    def wait_for_load_state(self, state=None, timeout=None) -> None:
        self.load_state_calls.append((state, timeout))

    def wait_for_timeout(self, timeout) -> None:
        self.timeout_calls.append(timeout)

    def content(self) -> str:
        return self._html

    def set_content(self, html, wait_until=None) -> None:
        self.set_content_calls.append(html)

    def locator(self, selector):
        raise AssertionError(f"unexpected locator call for {selector!r}")

    def screenshot(self, **kwargs) -> bytes:
        return b"screenshot"


class _RedirectPage(_FakePage):
    def __init__(self, redirect_url: str) -> None:
        super().__init__()
        self._redirect_url = redirect_url

    def goto(self, url, wait_until=None, timeout=None):
        self.url = self._redirect_url
        return _FakeResponse(200)


class _FakeContext:
    def close(self) -> None:
        pass


class _FakeSession:
    def __init__(self, page: _FakePage | None = None) -> None:
        self.page = page or _FakePage()
        self.closed = False
        self.pages_opened = 0

    def new_page(self):
        self.pages_opened += 1
        return _FakeContext(), self.page

    def close(self) -> None:
        self.closed = True


class _FakeLocator:
    def __init__(self) -> None:
        self.first = self

    def count(self) -> int:
        return 1

    def scroll_into_view_if_needed(self, timeout=None) -> None:
        pass

    def bounding_box(self) -> dict[str, float]:
        return {"x": 10.0, "y": 10.0, "width": 100.0, "height": 50.0}


class _ScreenshotPage:
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


def _fake_scan_result(mode: str = "single") -> SimpleNamespace:
    return SimpleNamespace(
        mode=mode,
        pages_scanned=1,
        scanned_at=datetime.now(UTC).isoformat(),
        timings={"total": 1.0},
    )


def _fake_scan_run(**overrides) -> SimpleNamespace:
    values = {
        "id": uuid4(),
        "requested_url": "https://example.com",
        "scan_options": {"mode": "single"},
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _reset_axe_cache(monkeypatch) -> None:
    monkeypatch.setattr(axe_scanner, "_axe_script_cache", None)


# ---------------------------------------------------------------------------
# A) Browser reuse and recycling
# ---------------------------------------------------------------------------


def test_scan_page_with_injected_browser_session_does_not_close_it(monkeypatch):
    session = _FakeSession()

    def fake_scan_one_page(url, options, *, run_browser_analysis, capture_screenshots, browser_session=None):
        return PageScanResult(final_url=url, page_data=ParsedPageData(), issues=[])

    monkeypatch.setattr(page_scanner, "_scan_one_page", fake_scan_one_page)

    result = page_scanner.scan_page(
        "https://example.com",
        ScanOptions(mode="single"),
        browser_session=session,
    )

    assert result.pages_scanned == 1
    assert session.closed is False


def test_scan_page_closes_owned_browser_session(monkeypatch):
    created: list[_FakeSession] = []

    class _TrackingSession(_FakeSession):
        def __init__(self) -> None:
            super().__init__()
            created.append(self)

    monkeypatch.setattr(page_scanner, "BrowserSession", _TrackingSession)
    monkeypatch.setattr(
        page_scanner,
        "_scan_one_page",
        lambda url, options, **kwargs: PageScanResult(
            final_url=url, page_data=ParsedPageData(), issues=[]
        ),
    )

    page_scanner.scan_page("https://example.com", ScanOptions(mode="single"))

    assert len(created) == 1
    assert created[0].closed is True


def test_worker_reuses_same_browser_session_across_two_jobs(monkeypatch):
    captured_sessions: list[object] = []
    created: list[SimpleNamespace] = []

    def factory():
        session = SimpleNamespace(closed=False, close=lambda: None)
        created.append(session)
        return session

    def fake_scan_page(requested_url, options, queue_control=None, *, browser_session=None):
        captured_sessions.append(browser_session)
        return _fake_scan_result()

    monkeypatch.setattr(scan_worker, "scan_page", fake_scan_page)
    monkeypatch.setattr(scan_worker, "is_scan_cancel_requested", lambda _db, _sid: False)
    monkeypatch.setattr(scan_worker, "complete_running_scan", lambda *_a, **_k: None)

    manager = scan_worker.WorkerBrowserManager(
        session_factory=factory, enabled=True, max_jobs=250
    )
    scan_run = _fake_scan_run()

    scan_worker._run_claimed_scan(object(), scan_run, browser_manager=manager)
    scan_worker._run_claimed_scan(object(), scan_run, browser_manager=manager)

    assert len(created) == 1
    assert captured_sessions[0] is captured_sessions[1] is created[0]


def test_worker_recreates_disconnected_browser_session(monkeypatch):
    created: list[_FakeManagedSession] = []

    def factory():
        session = _FakeManagedSession()
        created.append(session)
        return session

    manager = scan_worker.WorkerBrowserManager(
        session_factory=factory, enabled=True, max_jobs=250
    )

    first = manager.acquire()
    first.healthy = False
    second = manager.acquire()

    assert second is not first
    assert first.closed is True
    assert len(created) == 2


def test_worker_recycles_browser_after_max_jobs():
    created: list[_FakeManagedSession] = []

    def factory():
        session = _FakeManagedSession()
        created.append(session)
        return session

    manager = scan_worker.WorkerBrowserManager(
        session_factory=factory, enabled=True, max_jobs=2
    )

    first = manager.acquire()
    manager.job_finished()
    assert manager.acquire() is first
    assert first.closed is False

    manager.job_finished()
    assert first.closed is True
    third = manager.acquire()
    assert third is not first
    assert len(created) == 2


def test_worker_recreates_browser_after_browser_level_failure():
    created: list[_FakeManagedSession] = []

    def factory():
        session = _FakeManagedSession()
        created.append(session)
        return session

    manager = scan_worker.WorkerBrowserManager(
        session_factory=factory, enabled=True, max_jobs=250
    )

    first = manager.acquire()
    first.healthy = True
    manager.job_finished(browser_error=True)

    assert first.closed is True
    second = manager.acquire()
    assert second is not first


def test_worker_browser_reuse_can_be_disabled(monkeypatch):
    monkeypatch.setenv("SCAN_BROWSER_REUSE_ENABLED", "false")
    created: list[object] = []

    manager = scan_worker.WorkerBrowserManager(
        session_factory=lambda: created.append(object()) or SimpleNamespace(),
        enabled=None,
        max_jobs=250,
    )

    assert manager.enabled is False
    assert manager.acquire() is None
    manager.job_finished()
    assert manager.jobs_completed == 0
    assert created == []


def test_worker_browser_max_jobs_env_parsing(monkeypatch):
    monkeypatch.setenv("SCAN_BROWSER_MAX_JOBS", "7")
    assert scan_worker.get_browser_max_jobs() == 7
    monkeypatch.setenv("SCAN_BROWSER_MAX_JOBS", "not-a-number")
    assert scan_worker.get_browser_max_jobs() == scan_worker.DEFAULT_BROWSER_MAX_JOBS
    monkeypatch.delenv("SCAN_BROWSER_MAX_JOBS", raising=False)
    assert scan_worker.get_browser_max_jobs() == scan_worker.DEFAULT_BROWSER_MAX_JOBS


def test_run_worker_loop_warms_axe_cache_and_closes_browser(monkeypatch):
    state = {"warm": 0, "closed": 0}

    monkeypatch.setattr(
        scan_worker,
        "warm_axe_cache",
        lambda: state.__setitem__("warm", state["warm"] + 1) or True,
    )

    class _FakeManager:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def acquire(self):
            return None

        def job_finished(self, **_kwargs) -> None:
            pass

        def close(self) -> None:
            state["closed"] += 1

    monkeypatch.setattr(scan_worker, "WorkerBrowserManager", _FakeManager)
    monkeypatch.setattr(scan_worker, "recover_stale_running_scans", lambda *_a, **_k: 0)
    monkeypatch.setattr(scan_worker, "claim_next_queued_scan", lambda *_a, **_k: None)
    monkeypatch.setattr(
        scan_worker,
        "get_session_factory",
        lambda: (lambda: SimpleNamespace(close=lambda: None)),
    )

    scan_worker.run_worker_loop(run_once=True)

    assert state["warm"] == 1
    assert state["closed"] == 1


class _FakeManagedSession:
    def __init__(self, healthy: bool = True) -> None:
        self.healthy = healthy
        self.closed = False

    def is_usable(self) -> bool:
        return self.healthy and not self.closed

    def close(self) -> None:
        self.closed = True


# ---------------------------------------------------------------------------
# B) Render-wait tuning
# ---------------------------------------------------------------------------


class _RecordingPage:
    def __init__(self) -> None:
        self.load_states: list[tuple[str, int | None]] = []
        self.timeouts: list[int] = []

    def wait_for_load_state(self, state=None, timeout=None) -> None:
        self.load_states.append((state, timeout))

    def wait_for_timeout(self, timeout) -> None:
        self.timeouts.append(timeout)


def test_render_wait_uses_configured_idle_and_settle(monkeypatch):
    monkeypatch.setenv("SCAN_RENDER_IDLE_TIMEOUT_MS", "1234")
    monkeypatch.setenv("SCAN_RENDER_SETTLE_MS", "56")
    page = _RecordingPage()

    page_scanner._wait_for_rendered_content(page, 5000)

    assert page.load_states == [("load", 1000), ("networkidle", 1234)]
    assert page.timeouts == [56]


def test_render_wait_clamps_idle_timeout_to_page_timeout(monkeypatch):
    monkeypatch.setenv("SCAN_RENDER_IDLE_TIMEOUT_MS", "5000")
    monkeypatch.setenv("SCAN_RENDER_SETTLE_MS", "0")
    page = _RecordingPage()

    page_scanner._wait_for_rendered_content(page, 1000)

    timeout_by_state = dict(page.load_states)
    assert timeout_by_state["networkidle"] == 1000
    assert page.timeouts == []


def test_render_wait_defaults_keep_a_network_quiet_window(monkeypatch):
    monkeypatch.delenv("SCAN_RENDER_IDLE_TIMEOUT_MS", raising=False)
    monkeypatch.delenv("SCAN_RENDER_SETTLE_MS", raising=False)
    page = _RecordingPage()

    page_scanner._wait_for_rendered_content(page, 15000)

    timeout_by_state = dict(page.load_states)
    assert timeout_by_state["networkidle"] == 1500
    assert page.timeouts == [100]
    # networkidle only resolves after ~500ms of network quiet, so SPA content
    # injected shortly after load (demo page: 150ms) is still captured.
    assert timeout_by_state["networkidle"] >= 500


def test_rendered_demo_content_detects_injected_violations(monkeypatch):
    rendered_html = (
        '<html lang="en"><head><title>JavaScript rendered</title></head><body>'
        '<h1>Rendered</h1><img src="/dynamic-product.png">'
        '<a href="/dynamic-details">click here</a><button></button>'
        "</body></html>"
    )
    page = _FakePage(html=rendered_html)
    session = _FakeSession(page)
    monkeypatch.setattr(axe_scanner, "run_axe_core", lambda *_a, **_k: [])

    result = page_scanner._scan_rendered_page(
        "https://example.com",
        ScanOptions(mode="single"),
        capture_screenshots=False,
        browser_session=session,
    )

    assert result is not None
    rule_ids = {issue.rule_id for issue in result.issues}
    assert {"image-alt", "link-name"}.issubset(rule_ids)


# ---------------------------------------------------------------------------
# C) Screenshot cap
# ---------------------------------------------------------------------------


def test_screenshot_cap_limits_unique_captures(monkeypatch):
    monkeypatch.setenv("SCAN_MAX_SCREENSHOTS", "10")
    monkeypatch.setattr(page_scanner, "_store_screenshot", lambda *_a: "stored")
    issues = [_screenshot_issue(f"body > img:nth-of-type({index})") for index in range(15)]
    page = _ScreenshotPage()

    page_scanner._attach_issue_screenshots(page, issues)

    assert page.screenshot_calls == 10
    captured = [issue for issue in issues if issue.screenshot_data_url]
    assert len(captured) == 10
    assert all(issue.screenshot_data_url is None for issue in issues[10:])


def test_screenshot_cap_counts_shared_viewport_fallback_once(monkeypatch):
    monkeypatch.setenv("SCAN_MAX_SCREENSHOTS", "2")
    monkeypatch.setattr(page_scanner, "_store_screenshot", lambda *_a: "stored")
    issues = [
        _screenshot_issue("body > img:nth-of-type(1)"),
        _screenshot_issue("body > img:nth-of-type(2)"),
        _screenshot_issue(None),
        _screenshot_issue(None),
    ]
    page = _ScreenshotPage()

    page_scanner._attach_issue_screenshots(page, issues)

    # The shared viewport fallback counts as one capture, so the third key is
    # over the cap and both fallback issues stay screenshot-less.
    assert page.screenshot_calls == 2
    assert issues[0].screenshot_data_url == "stored"
    assert issues[1].screenshot_data_url == "stored"
    assert issues[2].screenshot_data_url is None
    assert issues[3].screenshot_data_url is None


def test_screenshot_cap_zero_disables_captures(monkeypatch):
    monkeypatch.setenv("SCAN_MAX_SCREENSHOTS", "0")
    page = _ScreenshotPage()
    issues = [_screenshot_issue("body > img:nth-of-type(1)")]

    page_scanner._attach_issue_screenshots(page, issues)

    assert page.screenshot_calls == 0
    assert issues[0].screenshot_data_url is None


# ---------------------------------------------------------------------------
# D) Vendored axe-core
# ---------------------------------------------------------------------------


def test_vendored_axe_asset_matches_recorded_checksum():
    asset_path = axe_scanner.AXE_ASSET_PATH
    assert asset_path.exists(), "vendored axe-core asset is missing"
    payload = asset_path.read_bytes()

    assert len(payload) == AXE_ASSET_SIZE
    assert hashlib.sha256(payload).hexdigest() == AXE_ASSET_SHA256
    assert b"axe v4.10.2" in payload[:100]


def test_axe_script_loads_from_vendored_asset_without_network(monkeypatch):
    _reset_axe_cache(monkeypatch)

    def fail_urlopen(*_args, **_kwargs):
        raise AssertionError("vendored axe asset must not require the network")

    monkeypatch.setattr(axe_scanner, "urlopen", fail_urlopen)

    script = axe_scanner._get_axe_script()

    assert len(script) > 100_000
    assert "axe" in script[:200].lower()


def test_axe_script_env_override_uses_custom_file(monkeypatch, tmp_path):
    custom_script = tmp_path / "axe-custom.js"
    custom_script.write_text("/* custom axe build */", encoding="utf-8")
    monkeypatch.setenv("AXE_SCRIPT_PATH", str(custom_script))
    _reset_axe_cache(monkeypatch)

    assert axe_scanner._get_axe_script() == "/* custom axe build */"


def test_axe_script_falls_back_to_cdn_when_asset_missing(monkeypatch, caplog):
    _reset_axe_cache(monkeypatch)
    monkeypatch.setattr(axe_scanner, "_local_axe_script_paths", lambda: [])

    class _CdnResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self) -> bytes:
            return b"/* cdn axe build */"

    monkeypatch.setattr(axe_scanner, "urlopen", lambda *_a, **_k: _CdnResponse())

    with caplog.at_level(logging.WARNING, logger=axe_scanner.__name__):
        script = axe_scanner._get_axe_script()

    assert script == "/* cdn axe build */"
    assert any("falling back to CDN" in record.message for record in caplog.records)


def test_warm_axe_cache_preloads_asset_once(monkeypatch):
    _reset_axe_cache(monkeypatch)
    load_calls = {"count": 0}
    real_loader = axe_scanner._read_local_axe_script

    def counting_loader():
        load_calls["count"] += 1
        return real_loader()

    monkeypatch.setattr(axe_scanner, "_read_local_axe_script", counting_loader)

    assert axe_scanner.warm_axe_cache() is True
    assert axe_scanner.warm_axe_cache() is True
    assert load_calls["count"] == 1


def test_warm_axe_cache_returns_false_when_every_source_fails(monkeypatch):
    _reset_axe_cache(monkeypatch)
    monkeypatch.setattr(axe_scanner, "_read_local_axe_script", lambda: None)

    def fail_download():
        raise OSError("CDN unreachable")

    monkeypatch.setattr(axe_scanner, "_download_axe_script", fail_download)

    assert axe_scanner.warm_axe_cache() is False


# ---------------------------------------------------------------------------
# E) Phase timings and time budget
# ---------------------------------------------------------------------------


def test_phase_timer_accumulates_and_snapshots():
    timer = PhaseTimer()

    with timer.measure("goto"):
        pass
    timer.add("goto", 5.0)
    timer.count("page")

    snapshot = timer.snapshot()

    assert snapshot["goto"] >= 5.0
    assert snapshot["goto_count"] == 2.0
    assert snapshot["page_count"] == 1.0


def test_attach_timings_sets_optional_field_when_supported():
    timer = PhaseTimer()
    timer.add("goto", 12.5)
    response = ScanPageResponse(
        url="https://example.com",
        scanned_at=datetime.now(UTC).isoformat(),
        summary=ScanSummary(total_issues=0, high=0, medium=0, low=0),
        issues=[],
    )

    attached = page_scanner._attach_timings(response, timer)

    if "timings" in type(response).model_fields:
        assert attached is True
        assert response.timings["goto"] == 12.5
    else:
        assert attached is False


def test_single_page_scan_records_timings(monkeypatch):
    def fake_rendered_page(url, options, *, capture_screenshots, browser_session=None):
        return PageScanResult(
            final_url=url,
            page_data=ParsedPageData(title="Rendered", html_lang="en"),
            issues=[],
        )

    monkeypatch.setattr(page_scanner, "_scan_rendered_page", fake_rendered_page)

    result = page_scanner.scan_page("https://example.com", ScanOptions(mode="single"))

    if "timings" not in type(result).model_fields:
        pytest.skip("ScanPageResponse.timings is owned by another change and not merged yet")
    assert result.timings is not None
    assert result.timings["total"] >= 0
    assert result.timings["page_count"] == 1.0
    assert result.timings["session_teardown"] >= 0


def test_multi_page_scan_fails_when_time_budget_exceeded(monkeypatch):
    monkeypatch.setenv("SCAN_MAX_SECONDS", "1")
    ticks = iter([0.0, 0.1, 2.0, 3.0, 4.0])
    monkeypatch.setattr(page_scanner, "_monotonic", lambda: next(ticks, 10.0))
    scanned_urls: list[str] = []

    def fake_scan_one_page(url, options, *, run_browser_analysis, capture_screenshots, browser_session=None):
        scanned_urls.append(url)
        links = (
            [{"href": "/a"}, {"href": "/b"}] if len(scanned_urls) == 1 else []
        )
        return PageScanResult(
            final_url=url,
            page_data=ParsedPageData(title="Page", html_lang="en", links=links),
            issues=[],
        )

    monkeypatch.setattr(page_scanner, "_scan_one_page", fake_scan_one_page)

    with pytest.raises(ScanError, match="Scan exceeded time budget"):
        page_scanner.scan_page(
            "https://example.com",
            ScanOptions(
                mode="multi",
                page_limit=5,
                crawl_depth=2,
                request_delay_ms=0,
            ),
        )

    assert scanned_urls == ["https://example.com", "https://example.com/a"]


def test_worker_logs_structured_scan_timings(caplog):
    scan_run = _fake_scan_run()
    result = SimpleNamespace(
        mode="multi",
        pages_scanned=3,
        timings={"total": 99.0, "goto": 12.0},
    )

    with caplog.at_level(logging.INFO, logger="scan-worker"):
        scan_worker._log_scan_timings(scan_run, result, 123.4)

    records = [
        record for record in caplog.records if "scan_timing" in record.getMessage()
    ]
    assert len(records) == 1
    payload = json.loads(records[0].getMessage().split("scan_timing ", 1)[1])
    assert payload == {
        "scan_id": str(scan_run.id),
        "url": "https://example.com",
        "mode": "multi",
        "pages": 3,
        "total_ms": 123.4,
        "phases": {"total": 99.0, "goto": 12.0},
    }


# ---------------------------------------------------------------------------
# Raw-HTML fallback regression (previously silently skipped axe-core)
# ---------------------------------------------------------------------------


def test_raw_html_fallback_runs_axe_core_and_merges(monkeypatch):
    custom_issues = [
        ScanIssue(
            rule_id="image-alt",
            severity="medium",
            element="<img>",
            message="Image is missing an alt attribute.",
            recommendation="Add alt text.",
        )
    ]
    axe_issue = ScanIssue(
        rule_id="color-contrast",
        severity="high",
        element="<p>low contrast</p>",
        message="Elements must meet minimum color contrast ratio thresholds",
        recommendation="Increase contrast.",
        source="axe-core",
    )
    captured: dict[str, object] = {}

    def fake_run_axe_core(page, *, wcag_standard, include_best_practices):
        captured["wcag_standard"] = wcag_standard
        captured["include_best_practices"] = include_best_practices
        return [axe_issue]

    monkeypatch.setattr(axe_scanner, "run_axe_core", fake_run_axe_core)

    issues = page_scanner._run_playwright_analysis(
        "https://example.com",
        "<html><body><img><p>low contrast</p></body></html>",
        custom_issues,
        page_timeout_ms=5000,
        capture_screenshots=False,
        browser_session=_FakeSession(),
        wcag_standard="wcag22aa",
        include_best_practices=False,
    )

    # The fallback path must actually run axe-core and merge it in, not return
    # only the custom checks (the regression this test was written for).
    assert len(issues) == 2
    assert {issue.rule_id for issue in issues} == {"image-alt", "color-contrast"}
    assert any(issue.source == "axe-core" for issue in issues)
    assert captured == {"wcag_standard": "wcag22aa", "include_best_practices": False}


def test_scan_one_page_fallback_threads_wcag_options(monkeypatch):
    monkeypatch.setattr(page_scanner, "_scan_rendered_page", lambda *_a, **_k: None)
    monkeypatch.setattr(
        page_scanner,
        "_fetch_page_html",
        lambda *_a, **_k: (DEFAULT_HTML, "https://example.com"),
    )
    captured: dict[str, object] = {}

    def fake_analysis(url, html, custom_issues, **kwargs):
        captured.update(kwargs)
        return custom_issues

    monkeypatch.setattr(page_scanner, "_run_playwright_analysis", fake_analysis)

    page_scanner._scan_one_page(
        "https://example.com",
        ScanOptions(
            mode="single",
            wcag_standard="wcag22aa",
            include_best_practices=False,
        ),
        run_browser_analysis=True,
        capture_screenshots=False,
    )

    assert captured["wcag_standard"] == "wcag22aa"
    assert captured["include_best_practices"] is False


# ---------------------------------------------------------------------------
# F) SSRF validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://127.0.0.1:8000/test/page-bad",
        "http://[::1]/",
        "http://10.0.0.5/",
        "http://192.168.1.10/",
        "http://169.254.10.10/",
        "http://0.0.0.0/",
    ],
)
def test_private_targets_are_blocked_when_disallowed(monkeypatch, url):
    monkeypatch.setenv("SCAN_ALLOW_PRIVATE_TARGETS", "false")

    with pytest.raises(ValueError):
        url_utils.validate_public_http_url(url)


def test_private_targets_are_allowed_by_default(monkeypatch):
    monkeypatch.delenv("SCAN_ALLOW_PRIVATE_TARGETS", raising=False)
    monkeypatch.setattr(url_utils, "_warned_private_targets_allowed", False)

    assert (
        url_utils.validate_public_http_url("http://127.0.0.1:8000/test/page-bad")
        == "http://127.0.0.1:8000/test/page-bad"
    )


def test_public_hostname_is_allowed_when_private_targets_disallowed(monkeypatch):
    monkeypatch.setenv("SCAN_ALLOW_PRIVATE_TARGETS", "false")
    monkeypatch.setattr(
        url_utils.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(2, 1, 6, "", ("93.184.216.34", 0))],
    )

    assert (
        url_utils.validate_public_http_url("https://example.com/page")
        == "https://example.com/page"
    )


def test_dns_resolution_failure_is_blocked_when_private_targets_disallowed(monkeypatch):
    monkeypatch.setenv("SCAN_ALLOW_PRIVATE_TARGETS", "false")

    def fail_resolution(*_args, **_kwargs):
        raise OSError("name resolution failed")

    monkeypatch.setattr(url_utils.socket, "getaddrinfo", fail_resolution)

    with pytest.raises(ValueError, match="could not be resolved"):
        url_utils.validate_public_http_url("https://does-not-resolve.example/")


def test_url_with_embedded_credentials_is_rejected(monkeypatch):
    monkeypatch.delenv("SCAN_ALLOW_PRIVATE_TARGETS", raising=False)

    with pytest.raises(ValueError, match="credentials"):
        url_utils.validate_public_http_url("https://user:secret@example.com/")


def test_overlong_url_is_rejected():
    with pytest.raises(ValueError, match="at most"):
        url_utils.validate_public_http_url(
            "https://example.com/" + ("a" * (url_utils.MAX_URL_LENGTH + 1))
        )


def test_non_http_scheme_and_missing_host_are_rejected():
    with pytest.raises(ValueError, match="http and https"):
        url_utils.validate_public_http_url("ftp://example.com/")
    with pytest.raises(ValueError, match="valid host"):
        url_utils.validate_public_http_url("https:///no-host")


def test_rendered_redirect_to_private_target_is_blocked(monkeypatch):
    monkeypatch.setenv("SCAN_ALLOW_PRIVATE_TARGETS", "false")
    page = _RedirectPage("http://127.0.0.1/admin")
    session = _FakeSession(page)

    with pytest.raises(ScanError):
        page_scanner._scan_rendered_page(
            "https://example.com",
            ScanOptions(mode="single"),
            capture_screenshots=False,
            browser_session=session,
        )


def test_raw_fetch_redirect_to_private_target_is_blocked(monkeypatch):
    monkeypatch.setenv("SCAN_ALLOW_PRIVATE_TARGETS", "false")
    monkeypatch.setattr(page_scanner, "_scan_rendered_page", lambda *_a, **_k: None)
    monkeypatch.setattr(
        page_scanner,
        "_fetch_page_html",
        lambda *_a, **_k: (DEFAULT_HTML, "http://127.0.0.1/internal"),
    )

    with pytest.raises(ScanError):
        page_scanner._scan_one_page(
            "https://example.com",
            ScanOptions(mode="single"),
            run_browser_analysis=True,
            capture_screenshots=False,
        )
