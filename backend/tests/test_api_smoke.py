from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.db import get_db_session
from app.main import app


def _fake_db():
    return object()


def test_health_endpoint():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


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
            default_page_limit=20,
            crawl_depth=3,
            request_delay_ms=250,
            page_timeout_ms=15000,
            ignored_url_patterns=["/logout", "/admin", "*.pdf"],
            stay_within_domain=True,
            respect_robots_txt=True,
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
    app.dependency_overrides.clear()
