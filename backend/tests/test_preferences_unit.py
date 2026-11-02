from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import get_db_session
from app.main import app
from app.models.auth import User
from app.models.preferences import AppPreferences
from app.repositories import preferences_repository
from app.repositories.preferences_repository import (
    get_preferences,
    reset_preferences,
    update_preferences,
)
from app.schemas.preferences import AppPreferencesResponse, AppPreferencesUpdate


def _session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    User.__table__.create(engine)
    AppPreferences.__table__.create(engine)
    return sessionmaker(bind=engine)()


def _user(session):
    user = User(
        name="Preferences User",
        email=f"prefs-{uuid4()}@example.com",
        password_hash="hashed:password",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _auth_user():
    return SimpleNamespace(id=uuid4(), name="Test User", email="user@example.com")


def _fake_db():
    return SimpleNamespace(close=lambda: None, rollback=lambda: None)


def test_new_preferences_row_has_notification_defaults():
    session = _session()
    user = _user(session)

    prefs = get_preferences(session, user.id)

    assert prefs.notify_score_threshold_enabled is False
    assert prefs.notify_score_threshold == 70
    assert prefs.notify_severities == ["high"]


def test_partial_update_roundtrip_persists_notification_preferences():
    session = _session()
    user = _user(session)

    update_preferences(
        session,
        user.id,
        AppPreferencesUpdate(
            notify_score_threshold_enabled=True,
            notify_score_threshold=85,
            notify_severities=["high", "medium"],
        ),
    )

    stored = get_preferences(session, user.id)
    assert stored.notify_score_threshold_enabled is True
    assert stored.notify_score_threshold == 85
    assert stored.notify_severities == ["high", "medium"]
    # Unrelated preference defaults must survive a partial update.
    assert stored.default_page_limit == 5
    assert stored.wcag_standard == "wcag21aa"

    response = AppPreferencesResponse.model_validate(stored)
    assert response.notify_score_threshold == 85
    assert response.notify_severities == ["high", "medium"]


def test_reset_preferences_restores_notification_defaults():
    session = _session()
    user = _user(session)
    update_preferences(
        session,
        user.id,
        AppPreferencesUpdate(
            notify_score_threshold_enabled=True,
            notify_score_threshold=10,
            notify_severities=["low"],
        ),
    )

    reset = reset_preferences(session, user.id)

    assert reset.notify_score_threshold_enabled is False
    assert reset.notify_score_threshold == 70
    assert reset.notify_severities == ["high"]
    assert reset.wcag_standard == "wcag21aa"


@pytest.mark.parametrize("value", [-1, 101, 1000])
def test_notify_score_threshold_rejects_out_of_bounds_values(value):
    with pytest.raises(ValidationError):
        AppPreferencesUpdate(notify_score_threshold=value)


@pytest.mark.parametrize("value", [0, 70, 100])
def test_notify_score_threshold_accepts_inclusive_bounds(value):
    update = AppPreferencesUpdate(notify_score_threshold=value)

    assert update.notify_score_threshold == value


def test_notify_severities_rejects_unknown_values():
    with pytest.raises(ValidationError):
        AppPreferencesUpdate(notify_severities=["catastrophic"])


def test_notify_severities_normalizes_and_deduplicates():
    update = AppPreferencesUpdate(notify_severities=["High", "high", "minor"])

    assert update.notify_severities == ["high", "minor"]


def test_get_preferences_endpoint_returns_notification_fields(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()
    current_user = _auth_user()
    monkeypatch.setattr("app.main.get_user_for_token", lambda _db, _token: current_user)
    monkeypatch.setattr(
        "app.main.get_preferences",
        lambda _db, _user_id: SimpleNamespace(encrypted_api_key=None),
    )

    client = TestClient(app)
    response = client.get(
        "/preferences",
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["notify_score_threshold_enabled"] is False
    assert body["notify_score_threshold"] == 70
    assert body["notify_severities"] == ["high"]
    assert body["has_api_key"] is False
    app.dependency_overrides.clear()


def test_update_preferences_endpoint_accepts_partial_notification_update(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()
    current_user = _auth_user()
    captured: dict[str, object] = {}
    monkeypatch.setattr("app.main.get_user_for_token", lambda _db, _token: current_user)

    def fake_update_preferences(_db, user_id, update_data):
        captured["user_id"] = user_id
        captured["update_data"] = update_data
        return SimpleNamespace(
            encrypted_api_key=None,
            notify_score_threshold_enabled=True,
            notify_score_threshold=55,
            notify_severities=["medium"],
        )

    monkeypatch.setattr("app.main.update_preferences", fake_update_preferences)

    client = TestClient(app)
    response = client.put(
        "/preferences",
        headers={"Authorization": "Bearer test-token"},
        json={
            "notify_score_threshold_enabled": True,
            "notify_score_threshold": 55,
            "notify_severities": ["medium"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["notify_score_threshold_enabled"] is True
    assert body["notify_score_threshold"] == 55
    assert body["notify_severities"] == ["medium"]
    assert captured["user_id"] == current_user.id
    # Only the fields the client sent are forwarded to the repository.
    update_data = captured["update_data"]
    assert isinstance(update_data, AppPreferencesUpdate)
    assert update_data.model_dump(exclude_unset=True) == {
        "notify_score_threshold_enabled": True,
        "notify_score_threshold": 55,
        "notify_severities": ["medium"],
    }
    app.dependency_overrides.clear()


def test_update_preferences_endpoint_rejects_out_of_bounds_threshold(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()
    current_user = _auth_user()
    monkeypatch.setattr("app.main.get_user_for_token", lambda _db, _token: current_user)

    client = TestClient(app)
    response = client.put(
        "/preferences",
        headers={"Authorization": "Bearer test-token"},
        json={"notify_score_threshold": 101},
    )

    assert response.status_code == 422
    app.dependency_overrides.clear()


def test_preferences_repository_module_exposes_update_and_reset():
    assert preferences_repository.update_preferences is update_preferences
    assert preferences_repository.reset_preferences is reset_preferences
