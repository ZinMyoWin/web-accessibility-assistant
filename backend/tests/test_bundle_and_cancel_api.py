import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db_session
from app.main import app
from app.models.auth import User
from app.models.repair_suggestion import RepairSuggestion
from app.models.scan import ScanIssueRecord, ScanRun
from app.repositories.repair_suggestion_repository import (
    RepairSuggestionDraft,
    build_repair_suggestion_groups,
    save_repair_suggestion,
)

AUTH_HEADERS = {"Authorization": "Bearer test-token"}


def _build_session():
    # StaticPool + check_same_thread=False keeps one in-memory database shared
    # with the FastAPI threadpool that executes sync endpoints.
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    User.__table__.create(engine)
    ScanRun.__table__.create(engine)
    ScanIssueRecord.__table__.create(engine)
    RepairSuggestion.__table__.create(engine)
    return sessionmaker(bind=engine)()


def _create_user(session, email_prefix="bundle"):
    user = User(
        name="Bundle User",
        email=f"{email_prefix}-{uuid4()}@example.com",
        password_hash="hashed:password",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_scan(session, user, *, status="complete", completed=True, **overrides):
    values = {
        "id": uuid4(),
        "user_id": user.id,
        "requested_url": "https://example.com",
        "final_url": "https://example.com",
        "status": status,
        "mode": "multi",
        "page_limit": 5,
        "pages_scanned": 2,
        "pages_skipped": 0,
        "scanned_page_urls": ["https://example.com", "https://example.com/about"],
        "skipped_page_urls": [],
        "queued_page_urls": [],
        "excluded_page_urls": [],
        "started_at": datetime(2026, 1, 2, 2, 0, 0, tzinfo=UTC),
        "completed_at": datetime(2026, 1, 2, 2, 5, 0, tzinfo=UTC) if completed else None,
        "total_issues": 0,
        "high_count": 0,
        "medium_count": 0,
        "low_count": 0,
        "score": 90,
    }
    values.update(overrides)
    scan_run = ScanRun(**values)
    session.add(scan_run)
    session.commit()
    session.refresh(scan_run)
    return scan_run


def _add_issue(session, scan_run, position, *, rule_id="image-alt", message="Image is missing an alt attribute.", page_url="https://example.com"):
    issue = ScanIssueRecord(
        scan_run_id=scan_run.id,
        position=position,
        rule_id=rule_id,
        severity="high",
        element="<img>",
        message=message,
        recommendation="Add meaningful alt text.",
        page_url=page_url,
        wcag_criteria=["WCAG 1.1.1"],
        source="custom",
    )
    session.add(issue)
    session.commit()
    return issue


def _save_suggestion(session, scan_run):
    group = build_repair_suggestion_groups(scan_run)[0]
    return save_repair_suggestion(
        session,
        scan_run=scan_run,
        group=group,
        provider="openai",
        model="gpt-4o",
        draft=RepairSuggestionDraft(
            explanation="Images need text alternatives.",
            impact="Screen reader users miss the image purpose.",
            recommended_fix="Add descriptive alt text.",
            before_code="<img src='/hero.png'>",
            after_code="<img src='/hero.png' alt='Dashboard overview'>",
            confidence="high",
        ),
    )


@pytest.fixture()
def api(monkeypatch):
    session = _build_session()
    user = _create_user(session)
    monkeypatch.setattr("app.main.get_user_for_token", lambda _db, _token: user)
    app.dependency_overrides[get_db_session] = lambda: session
    try:
        yield TestClient(app), session, user
    finally:
        app.dependency_overrides.clear()
        session.close()


def test_repair_suggestion_bundle_returns_markdown_envelope(api):
    client, session, user = api
    scan_run = _create_scan(session, user, total_issues=2, high_count=2, score=90)
    _add_issue(session, scan_run, 1)
    _add_issue(session, scan_run, 2, rule_id="document-title", message="Document title is missing.")
    _save_suggestion(session, scan_run)
    session.refresh(scan_run)

    response = client.get(
        f"/scans/{scan_run.id}/repair-suggestion-bundle",
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["scan_id"] == str(scan_run.id)
    assert body["filename"] == f"accessaudit-repair-bundle-{str(scan_run.id)[:8]}.md"
    assert body["content_type"] == "text/markdown; charset=utf-8"
    assert body["group_count"] == 2
    assert body["generated_count"] == 1
    assert body["missing_count"] == 1
    assert body["generated_at"].endswith("+00:00")
    assert "## Generated suggestions" in body["content"]
    assert "## Not yet generated" in body["content"]
    assert "Document title is missing." in body["content"]
    assert "api_key" not in body["content"].lower()


def test_repair_suggestion_bundle_supports_json_format(api):
    client, session, user = api
    scan_run = _create_scan(session, user, total_issues=1, high_count=1, score=88)
    _add_issue(session, scan_run, 1)
    session.refresh(scan_run)

    response = client.get(
        f"/scans/{scan_run.id}/repair-suggestion-bundle",
        params={"format": "json"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["filename"].endswith(".json")
    assert body["content_type"] == "application/json; charset=utf-8"
    payload = json.loads(body["content"])
    assert payload["scan"]["id"] == str(scan_run.id)
    assert payload["groups"][0]["suggestion"] is None
    assert body["generated_count"] == 0
    assert body["missing_count"] == 1


def test_repair_suggestion_bundle_rejects_unknown_format(api):
    client, session, user = api
    scan_run = _create_scan(session, user)

    response = client.get(
        f"/scans/{scan_run.id}/repair-suggestion-bundle",
        params={"format": "pdf"},
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 400
    assert "Unsupported bundle format" in response.json()["detail"]


def test_repair_suggestion_bundle_returns_404_for_another_users_scan(api):
    client, session, _user = api
    other_user = _create_user(session, email_prefix="other")
    other_scan = _create_scan(session, other_user)

    response = client.get(
        f"/scans/{other_scan.id}/repair-suggestion-bundle",
        headers=AUTH_HEADERS,
    )

    assert response.status_code == 404


def test_repair_suggestion_bundle_requires_authentication(api):
    client, session, user = api
    scan_run = _create_scan(session, user)

    response = client.get(f"/scans/{scan_run.id}/repair-suggestion-bundle")

    assert response.status_code == 401


def test_cancel_queued_scan_marks_it_cancelled(api):
    client, session, user = api
    scan_run = _create_scan(session, user, status="queued", completed=False, score=None)

    response = client.post(f"/scans/{scan_run.id}/cancel", headers=AUTH_HEADERS)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cancelled"
    assert body["error_message"] == "Cancelled by user"
    assert body["completed_at"] is not None
    assert body["cancel_requested_at"] is not None
    session.refresh(scan_run)
    assert scan_run.status == "cancelled"
    assert scan_run.queued_page_urls == []


def test_cancel_running_scan_sets_cancel_flag_without_finishing(api):
    client, session, user = api
    scan_run = _create_scan(
        session,
        user,
        status="running",
        completed=False,
        score=None,
        worker_attempts=1,
        current_page_url="https://example.com/about",
    )

    response = client.post(f"/scans/{scan_run.id}/cancel", headers=AUTH_HEADERS)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "running"
    assert body["cancel_requested_at"] is not None
    assert body["completed_at"] is None
    session.refresh(scan_run)
    assert scan_run.status == "running"
    assert scan_run.cancel_requested_at is not None


def test_cancel_terminal_scan_returns_409(api):
    client, session, user = api
    scan_run = _create_scan(session, user, status="complete")

    response = client.post(f"/scans/{scan_run.id}/cancel", headers=AUTH_HEADERS)

    assert response.status_code == 409


def test_cancel_already_cancelled_scan_returns_409(api):
    client, session, user = api
    scan_run = _create_scan(session, user, status="cancelled")

    response = client.post(f"/scans/{scan_run.id}/cancel", headers=AUTH_HEADERS)

    assert response.status_code == 409


def test_cancel_another_users_scan_returns_404(api):
    client, session, _user = api
    other_user = _create_user(session, email_prefix="other")
    other_scan = _create_scan(session, other_user, status="queued", completed=False)

    response = client.post(f"/scans/{other_scan.id}/cancel", headers=AUTH_HEADERS)

    assert response.status_code == 404


def test_cancel_requires_authentication(api):
    client, session, user = api
    scan_run = _create_scan(session, user, status="queued", completed=False)

    response = client.post(f"/scans/{scan_run.id}/cancel")

    assert response.status_code == 401
