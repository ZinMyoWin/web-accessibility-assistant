from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db import get_db_session
from app.main import app
from app import scan_worker
from app.services import page_scanner
from app.services.page_scanner import PageScanResult, ParsedPageData, ScanOptions


def _fake_db():
    return SimpleNamespace(close=lambda: None, rollback=lambda: None)


def test_health_endpoint():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


def test_js_rendered_test_page_endpoint():
    client = TestClient(app)
    response = client.get("/test/page-js-rendered")

    assert response.status_code == 200
    assert "window.setTimeout" in response.text
    assert "dynamic-product.png" in response.text


def test_auth_signup_login_me_and_logout(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()
    users_by_email: dict[str, SimpleNamespace] = {}
    sessions_by_token: dict[str, SimpleNamespace] = {}

    def fake_create_user(_db, *, name, email, password_hash):
        user = SimpleNamespace(
            id=uuid4(),
            name=name,
            email=email,
            password_hash=password_hash,
            created_at=datetime.now(UTC),
        )
        users_by_email[email] = user
        return user

    def fake_create_user_session(_db, *, user, token_jti, expires_at):
        sessions_by_token[token_jti] = user
        return SimpleNamespace(user_id=user.id)

    monkeypatch.setattr("app.main.get_user_by_email", lambda _db, email: users_by_email.get(email))
    monkeypatch.setattr("app.main.create_user", fake_create_user)
    monkeypatch.setattr("app.main.create_user_session", fake_create_user_session)
    monkeypatch.setattr(
        "app.main.create_session_token",
        lambda _user_id: (
            f"token-{len(sessions_by_token) + 1}",
            f"token-{len(sessions_by_token) + 1}",
            datetime.now(UTC),
        ),
    )
    monkeypatch.setattr("app.main.hash_password", lambda password: f"hashed:{password}")
    monkeypatch.setattr("app.main.verify_password", lambda password, password_hash: password_hash == f"hashed:{password}")
    monkeypatch.setattr("app.main.get_user_for_token", lambda _db, token: sessions_by_token.get(token))

    def fake_revoke_user_session(_db, token):
        sessions_by_token.pop(token, None)
        return True

    monkeypatch.setattr("app.main.revoke_user_session", fake_revoke_user_session)

    client = TestClient(app)
    signup_response = client.post(
        "/auth/signup",
        json={
            "name": "Test User",
            "email": "USER@EXAMPLE.COM",
            "password": "password123",
        },
    )
    duplicate_response = client.post(
        "/auth/signup",
        json={
            "name": "Test User",
            "email": "user@example.com",
            "password": "password123",
        },
    )
    login_response = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "password123"},
    )
    token = login_response.json()["token"]
    me_response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    logout_response = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    after_logout_response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert signup_response.status_code == 200
    assert signup_response.json()["user"]["email"] == "user@example.com"
    assert duplicate_response.status_code == 409
    assert login_response.status_code == 200
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "user@example.com"
    assert logout_response.status_code == 200
    assert after_logout_response.status_code == 401
    app.dependency_overrides.clear()


def test_delete_scans_endpoint(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()
    monkeypatch.setattr("app.main.clear_saved_scans", lambda _db: 2)

    client = TestClient(app)
    response = client.delete("/scans")

    assert response.status_code == 200
    assert response.json() == {"deleted_scan_runs": 2}
    app.dependency_overrides.clear()


def test_reset_preferences_endpoint(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()

    monkeypatch.setattr(
        "app.main.reset_preferences",
        lambda _db: SimpleNamespace(
            ai_provider="openai",
            ai_model="gpt-4o",
            active_suggestion_provider="openai",
            auto_generate_suggestions=True,
            default_scan_mode="multi",
            default_page_limit=5,
            crawl_depth=3,
            request_delay_ms=250,
            page_timeout_ms=15000,
            ignored_url_patterns=["/logout", "/admin", "*.pdf"],
            stay_within_domain=True,
            respect_robots_txt=True,
            skip_previously_scanned_pages=True,
            wcag_standard="wcag2aa",
            include_best_practices=True,
            fail_on_experimental=False,
            email_notifications=False,
            email_address=None,
            notify_on_scan_complete=True,
            notify_on_scan_failed=True,
            notify_on_high_severity=False,
            weekly_summary=False,
            theme="light",
            reduced_motion=False,
            high_contrast=False,
            density="comfortable",
            encrypted_api_key=None,
        ),
    )

    client = TestClient(app)
    response = client.post("/preferences/reset")

    assert response.status_code == 200
    body = response.json()
    assert body["ai_provider"] == "openai"
    assert body["has_api_key"] is False
    assert body["skip_previously_scanned_pages"] is True
    app.dependency_overrides.clear()


def test_scan_page_multi_mode_endpoint(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()

    captured: dict[str, object] = {}
    scan_id = uuid4()

    def fake_scan_page(url, options, queue_control=None):
        captured["url"] = url
        captured["options"] = options
        captured["queue_control"] = queue_control
        return SimpleNamespace(
            scan_id=None,
            url="https://example.com",
            scanned_at=datetime.now(UTC).isoformat(),
            mode="multi",
            pages_scanned=3,
            pages_skipped=1,
            scanned_page_urls=["https://example.com", "https://example.com/contact"],
            skipped_page_urls=["https://example.com/about"],
            summary=SimpleNamespace(total_issues=2, high=1, medium=1, low=0),
            issues=[],
        )

    def fake_create_scan_job(
        _db,
        *,
        requested_url,
        started_at,
        mode,
        page_limit,
        status,
        scan_options,
    ):
        captured["requested_url"] = requested_url
        captured["mode"] = mode
        captured["page_limit"] = page_limit
        captured["job_status"] = status
        captured["scan_options"] = scan_options
        return SimpleNamespace(id=scan_id)

    def fake_complete_running_scan(_db, completed_scan_id, *, result, completed_at):
        captured["completed_scan_id"] = completed_scan_id
        captured["pages_scanned"] = result.pages_scanned
        return SimpleNamespace(id=completed_scan_id)

    monkeypatch.setattr("app.main.scan_page", fake_scan_page)
    monkeypatch.setattr("app.main.create_scan_job", fake_create_scan_job)
    monkeypatch.setattr("app.main.complete_running_scan", fake_complete_running_scan)
    monkeypatch.setattr("app.main.get_session_factory", lambda: _fake_db)
    monkeypatch.setattr(
        "app.main.get_previously_scanned_page_urls_for_domain",
        lambda _db, _url: {"https://example.com/about"},
    )

    client = TestClient(app)
    response = client.post(
        "/scan/page",
        json={
            "url": "https://example.com",
            "mode": "multi",
            "page_limit": 5,
            "crawl_depth": 2,
            "request_delay_ms": 10,
            "page_timeout_ms": 5000,
            "ignored_url_patterns": ["/logout"],
            "stay_within_domain": True,
            "respect_robots_txt": False,
            "skip_previously_scanned_pages": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "multi"
    assert body["status"] == "running"
    assert body["scan_id"] == str(scan_id)
    assert body["pages_scanned"] == 0
    assert body["pages_skipped"] == 0
    assert body["scanned_page_urls"] == []
    assert body["skipped_page_urls"] == []
    assert str(captured["url"]) == "https://example.com/"
    assert captured["mode"] == "multi"
    assert captured["page_limit"] == 5
    assert captured["job_status"] == "running"
    assert captured["pages_scanned"] == 3
    assert captured["completed_scan_id"] == scan_id
    assert captured["scan_options"]["page_limit"] == 5
    assert captured["scan_options"]["previously_scanned_urls"] == ["https://example.com/about"]
    assert captured["queue_control"] is not None
    options = captured["options"]
    assert getattr(options, "crawl_depth") == 2
    assert getattr(options, "respect_robots_txt") is False
    assert getattr(options, "skip_previously_scanned_pages") is True
    assert getattr(options, "run_browser_analysis_for_multi") is True
    assert "https://example.com/about" in getattr(options, "previously_scanned_urls")
    app.dependency_overrides.clear()


def test_scan_page_multi_mode_can_enqueue_for_worker(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()
    scan_id = uuid4()
    captured: dict[str, object] = {}

    def fake_create_scan_job(
        _db,
        *,
        requested_url,
        started_at,
        mode,
        page_limit,
        status,
        scan_options,
    ):
        captured["requested_url"] = requested_url
        captured["status"] = status
        captured["scan_options"] = scan_options
        return SimpleNamespace(id=scan_id)

    monkeypatch.setenv("SCAN_EXECUTION_MODE", "worker")
    monkeypatch.setattr("app.main.create_scan_job", fake_create_scan_job)
    monkeypatch.setattr(
        "app.main.get_previously_scanned_page_urls_for_domain",
        lambda _db, _url: set(),
    )

    client = TestClient(app)
    response = client.post(
        "/scan/page",
        json={
            "url": "https://example.com",
            "mode": "multi",
            "page_limit": 5,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert body["scan_id"] == str(scan_id)
    assert captured["status"] == "queued"
    assert captured["scan_options"]["mode"] == "multi"
    app.dependency_overrides.clear()


def test_scan_queue_control_endpoints(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()
    scan_id = uuid4()
    captured: dict[str, object] = {}

    def fake_to_saved_scan_response(scan_run):
        return {
            "id": str(scan_run.id),
            "url": "https://example.com",
            "requested_url": "https://example.com",
            "final_url": None,
            "status": "running",
            "mode": "multi",
            "page_limit": 5,
            "pages_scanned": 1,
            "pages_skipped": 0,
            "scanned_page_urls": ["https://example.com"],
            "skipped_page_urls": [],
            "queued_page_urls": scan_run.queued_page_urls,
            "excluded_page_urls": scan_run.excluded_page_urls,
            "current_page_url": None,
            "worker_attempts": 1,
            "max_worker_attempts": 3,
            "last_error": None,
            "started_at": datetime.now(UTC).isoformat(),
            "completed_at": None,
            "duration_seconds": None,
            "summary": {"total_issues": 0, "high": 0, "medium": 0, "low": 0},
            "score": None,
            "error_message": None,
            "issues": [],
        }

    def fake_remove(_db, received_scan_id, page_url):
        captured["removed"] = (received_scan_id, page_url)
        return SimpleNamespace(
            id=received_scan_id,
            queued_page_urls=["https://example.com/contact"],
            excluded_page_urls=[page_url],
        )

    def fake_prioritize(_db, received_scan_id, page_url):
        captured["prioritized"] = (received_scan_id, page_url)
        return SimpleNamespace(
            id=received_scan_id,
            queued_page_urls=[page_url, "https://example.com/contact"],
            excluded_page_urls=[],
        )

    monkeypatch.setattr("app.main.remove_queued_scan_page", fake_remove)
    monkeypatch.setattr("app.main.prioritize_queued_scan_page", fake_prioritize)
    monkeypatch.setattr("app.main.to_saved_scan_response", fake_to_saved_scan_response)

    client = TestClient(app)
    remove_response = client.post(
        f"/scans/{scan_id}/queue/remove",
        json={"url": "https://example.com/about"},
    )
    prioritize_response = client.post(
        f"/scans/{scan_id}/queue/prioritize",
        json={"url": "https://example.com/pricing"},
    )

    assert remove_response.status_code == 200
    assert prioritize_response.status_code == 200
    assert captured["removed"] == (scan_id, "https://example.com/about")
    assert captured["prioritized"] == (scan_id, "https://example.com/pricing")
    assert remove_response.json()["excluded_page_urls"] == ["https://example.com/about"]
    assert prioritize_response.json()["queued_page_urls"][0] == "https://example.com/pricing"
    app.dependency_overrides.clear()


def test_multi_page_scan_skips_previously_scanned_internal_pages(monkeypatch):
    scanned_urls: list[str] = []

    def fake_scan_one_page(url, options, *, run_browser_analysis, capture_screenshots):
        scanned_urls.append(url)
        links = [{"href": "/about"}, {"href": "/contact"}] if len(scanned_urls) == 1 else []
        return PageScanResult(
            final_url=url,
            page_data=ParsedPageData(links=links),
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

    assert scanned_urls == ["https://example.com", "https://example.com/contact"]
    assert result.pages_scanned == 2
    assert result.pages_skipped == 1
    assert result.scanned_page_urls == ["https://example.com", "https://example.com/contact"]
    assert result.skipped_page_urls == ["https://example.com/about"]


def test_multi_page_scan_can_include_previously_scanned_pages_when_disabled(monkeypatch):
    scanned_urls: list[str] = []

    def fake_scan_one_page(url, options, *, run_browser_analysis, capture_screenshots):
        scanned_urls.append(url)
        links = [{"href": "/about"}, {"href": "/contact"}] if len(scanned_urls) == 1 else []
        return PageScanResult(
            final_url=url,
            page_data=ParsedPageData(links=links),
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
            skip_previously_scanned_pages=False,
        ),
    )

    assert scanned_urls == [
        "https://example.com",
        "https://example.com/about",
        "https://example.com/contact",
    ]
    assert result.pages_scanned == 3
    assert result.pages_skipped == 0
    assert result.scanned_page_urls == [
        "https://example.com",
        "https://example.com/about",
        "https://example.com/contact",
    ]
    assert result.skipped_page_urls == []


def test_multi_page_scan_honors_queue_control_remove_and_priority(monkeypatch):
    scanned_urls: list[str] = []
    published_queues: list[list[str]] = []

    def fake_scan_one_page(url, options, *, run_browser_analysis, capture_screenshots):
        scanned_urls.append(url)
        links = (
            [{"href": "/about"}, {"href": "/contact"}, {"href": "/pricing"}]
            if len(scanned_urls) == 1
            else []
        )
        return PageScanResult(
            final_url=url,
            page_data=ParsedPageData(links=links),
            issues=[],
        )

    def publish(state):
        published_queues.append(state.queued_page_urls)

    def refresh():
        return (
            ["https://example.com/contact", "https://example.com/pricing"],
            {"https://example.com/about"},
        )

    monkeypatch.setattr(page_scanner, "_scan_one_page", fake_scan_one_page)

    result = page_scanner.scan_page(
        "https://example.com",
        ScanOptions(
            mode="multi",
            page_limit=3,
            crawl_depth=2,
            request_delay_ms=0,
        ),
        page_scanner.CrawlQueueControl(publish=publish, refresh=refresh),
    )

    assert scanned_urls == [
        "https://example.com",
        "https://example.com/contact",
        "https://example.com/pricing",
    ]
    assert result.pages_scanned == 3
    assert "https://example.com/about" not in result.scanned_page_urls
    assert ["https://example.com/contact", "https://example.com/pricing"] in published_queues


def test_multi_page_scan_always_scans_submitted_start_url(monkeypatch):
    scanned_urls: list[str] = []

    def fake_scan_one_page(url, options, *, run_browser_analysis, capture_screenshots):
        scanned_urls.append(url)
        return PageScanResult(
            final_url=url,
            page_data=ParsedPageData(links=[]),
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
            previously_scanned_urls=frozenset({"https://example.com"}),
            skip_previously_scanned_pages=True,
        ),
    )

    assert scanned_urls == ["https://example.com"]
    assert result.pages_scanned == 1
    assert result.pages_skipped == 0
    assert result.scanned_page_urls == ["https://example.com"]
    assert result.skipped_page_urls == []


def test_multi_page_scan_can_run_browser_analysis_for_each_page(monkeypatch):
    browser_flags: list[bool] = []

    def fake_scan_one_page(url, options, *, run_browser_analysis, capture_screenshots):
        browser_flags.append(run_browser_analysis)
        links = [{"href": "/about"}] if len(browser_flags) == 1 else []
        return PageScanResult(
            final_url=url,
            page_data=ParsedPageData(links=links),
            issues=[],
        )

    monkeypatch.setattr(page_scanner, "_scan_one_page", fake_scan_one_page)

    page_scanner.scan_page(
        "https://example.com",
        ScanOptions(
            mode="multi",
            page_limit=2,
            crawl_depth=2,
            request_delay_ms=0,
            run_browser_analysis_for_multi=True,
        ),
    )

    assert browser_flags == [True, True]


def test_single_page_scan_prefers_rendered_dom_for_full_analysis(monkeypatch):
    def fake_rendered_page(url, options, *, capture_screenshots):
        return PageScanResult(
            final_url="https://example.com/app",
            page_data=ParsedPageData(
                title="Rendered app",
                html_lang="en",
                links=[{"href": "/dashboard", "text": "Dashboard"}],
            ),
            issues=[],
        )

    def fail_raw_fetch(*_args, **_kwargs):
        raise AssertionError("raw fetch should not run when rendering succeeds")

    monkeypatch.setattr(page_scanner, "_scan_rendered_page", fake_rendered_page)
    monkeypatch.setattr(page_scanner, "_fetch_page_html", fail_raw_fetch)

    result = page_scanner.scan_page("https://example.com", ScanOptions(mode="single"))

    assert result.url == "https://example.com/app"
    assert result.scanned_page_urls == ["https://example.com/app"]
    assert result.summary.total_issues == 0


def test_single_page_scan_falls_back_to_raw_html_when_rendering_is_unavailable(monkeypatch):
    monkeypatch.setattr(page_scanner, "_scan_rendered_page", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        page_scanner,
        "_fetch_page_html",
        lambda *_args, **_kwargs: (
            "<html lang='en'><head><title>Raw fallback</title></head>"
            "<body><img src='/missing-alt.png'></body></html>",
            "https://example.com",
        ),
    )
    monkeypatch.setattr(
        page_scanner,
        "_run_playwright_analysis",
        lambda _url, _html, custom_issues, **_kwargs: custom_issues,
    )

    result = page_scanner.scan_page("https://example.com", ScanOptions(mode="single"))

    assert result.url == "https://example.com"
    assert result.summary.total_issues == 1
    assert result.issues[0].rule_id == "image-alt"


def test_scan_worker_builds_full_analysis_options_from_payload():
    options = scan_worker._scan_options_from_payload(
        {
            "mode": "multi",
            "page_limit": 4,
            "crawl_depth": 2,
            "request_delay_ms": 0,
            "page_timeout_ms": 5000,
            "ignored_url_patterns": ["/logout"],
            "stay_within_domain": True,
            "respect_robots_txt": False,
            "skip_previously_scanned_pages": True,
            "previously_scanned_urls": ["https://example.com/about"],
        }
    )

    assert options.mode == "multi"
    assert options.page_limit == 4
    assert options.crawl_depth == 2
    assert options.ignored_url_patterns == ("/logout",)
    assert options.respect_robots_txt is False
    assert options.run_browser_analysis_for_multi is True
    assert options.previously_scanned_urls == frozenset({"https://example.com/about"})
