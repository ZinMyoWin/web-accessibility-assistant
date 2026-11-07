import base64
import hashlib
import hmac
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from app.db import get_db_session
from app.main import app
from app.models.auth import User, UserSession
from app.models.mcp import McpAccountLink, McpRateLimit
from app.models.scan import ScanIssueRecord, ScanRun
from app.repositories.auth_repository import create_user_session, revoke_user_session
from app.repositories.mcp_repository import enforce_mcp_rate_limit
from app.services.auth_service import create_session_token

SECRET = "mcp-dedicated-secret-at-least-32-bytes"
ISSUER = "https://identity.example.com"


def assertion(*, subject="external-user", secret=SECRET, header=None, **overrides):
    now = int(time.time())
    claims = {
        "iss": "waa-mcp", "aud": "waa-mcp-backend", "typ": "mcp-delegation",
        "sub": subject, "oauth_issuer": ISSUER, "scope": "scans:read",
        "iat": now, "exp": now + 60,
    }
    claims.update(overrides)

    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

    signed = f"{encode(header or {'alg': 'HS256', 'typ': 'JWT'})}.{encode(claims)}"
    signature = base64.urlsafe_b64encode(hmac.new(secret.encode(), signed.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{signed}.{signature}"


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setenv("MCP_INTERNAL_SECRET", SECRET)
    monkeypatch.setenv("MCP_OAUTH_ISSUER", ISSUER)
    monkeypatch.setenv("MCP_RATE_LIMIT_PER_MINUTE", "60")
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'mcp.sqlite'}", connect_args={"check_same_thread": False})
    for model in (User, UserSession, ScanRun, ScanIssueRecord, McpAccountLink, McpRateLimit):
        model.__table__.create(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    users, tokens = [], []
    with factory() as db:
        for name in ("one", "two"):
            user = User(name=name, email=f"{name}@example.com", password_hash="unused")
            db.add(user)
            db.commit()
            token, jti, expires = create_session_token(user.id)
            create_user_session(db, user=user, token_jti=jti, expires_at=expires)
            users.append(user)
            tokens.append(token)

    def override_db():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db_session] = override_db
    try:
        with TestClient(app) as client:
            yield client, factory, users, tokens, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def link(api, user=0, subject="external-user"):
    client, _, _, tokens, _ = api
    return client.post("/mcp/link", headers={"Authorization": f"Bearer {tokens[user]}", "X-MCP-Assertion": assertion(subject=subject)})


def headers(subject="external-user"):
    return {"Authorization": f"Bearer {assertion(subject=subject)}"}


def seed_scan(api, user=0, issues=3):
    _, factory, users, _, _ = api
    with factory() as db:
        scan = ScanRun(
            user_id=users[user].id, requested_url="https://example.com", status="complete",
            mode="single", pages_scanned=1, started_at=datetime.now(UTC),
            total_issues=issues, high_count=issues, medium_count=0, low_count=0,
            score=80, error_message="private internal detail", queued_page_urls=["private"],
        )
        db.add(scan)
        db.commit()
        for position in range(issues):
            db.add(ScanIssueRecord(
                scan_run_id=scan.id, position=position, rule_id="image-alt", severity="high",
                element="<img>" + "x" * 3000, message="m" * 3000,
                recommendation="r" * 3000, page_url="https://example.com/" + "x" * 3000,
                screenshot_data_url="data:image/png;base64,SECRET", wcag_criteria=["WCAG 1.1.1"] * 30,
            ))
        db.commit()
        return scan.id


def test_link_requires_both_identities_and_rejects_reassignment(api):
    client, _, users, tokens, _ = api
    assert client.post("/mcp/link", headers={"X-MCP-Assertion": assertion()}).status_code == 401
    assert client.post("/mcp/link", headers={"Authorization": f"Bearer {tokens[0]}"}).status_code == 401
    assert link(api).json() == {"linked": True, "user_id": str(users[0].id)}
    assert link(api).status_code == 200
    assert link(api, user=1).status_code == 409
    assert client.get("/mcp/identity", headers=headers()).json() == {"user_id": str(users[0].id)}


def test_unlink_is_scoped_and_immediately_revokes_access(api):
    client, _, _, tokens, _ = api
    link(api)
    link(api, user=1, subject="other")
    assert client.delete("/mcp/link", headers={"Authorization": f"Bearer {tokens[0]}"}).json() == {"unlinked": 1}
    assert client.get("/mcp/identity", headers=headers()).status_code == 403
    assert client.get("/mcp/identity", headers=headers("other")).status_code == 200


def test_link_rejects_revoked_application_session(api):
    client, factory, _, tokens, _ = api
    with factory() as db:
        revoke_user_session(db, tokens[0])
    assert link(api).status_code == 401
    assert client.delete("/mcp/link", headers={"Authorization": f"Bearer {tokens[0]}"}).status_code == 401


@pytest.mark.parametrize("changes", [
    {"secret": "wrong"}, {"aud": "different"}, {"iss": "other"}, {"typ": "access"},
    {"scope": "scans:write"}, {"oauth_issuer": "https://evil.example"},
    {"exp": 1}, {"iat": 0}, {"iat": True}, {"exp": "123"},
    {"subject": ""}, {"subject": "x" * 513}, {"nbf": 9999999999},
    {"header": {"alg": "none"}}, {"header": {"alg": "HS256", "crit": ["custom"]}},
])
def test_invalid_assertions_are_rejected(api, changes):
    client, _, _, _, _ = api
    link(api)
    response = client.get("/mcp/identity", headers={"Authorization": f"Bearer {assertion(**changes)}"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired MCP assertion."}


def test_missing_auth_unknown_identity_and_disabled_configuration(api, monkeypatch):
    client, _, _, tokens, _ = api
    assert client.get("/mcp/identity").status_code == 401
    assert client.get("/mcp/identity", headers=headers()).status_code == 403
    assert client.get("/mcp/identity", headers={"Authorization": f"Bearer {tokens[0]}"}).status_code == 401
    monkeypatch.delenv("MCP_INTERNAL_SECRET")
    assert client.get("/mcp/identity", headers=headers()).status_code == 503


def test_issuer_is_exact_and_secret_strength_is_measured_in_bytes(api, monkeypatch):
    client, _, _, tokens, _ = api
    issuer = ISSUER + "/"
    secret = "\u00e9" * 16
    monkeypatch.setenv("MCP_OAUTH_ISSUER", issuer)
    monkeypatch.setenv("MCP_INTERNAL_SECRET", secret)
    signed = assertion(secret=secret, oauth_issuer=issuer)
    assert client.post("/mcp/link", headers={
        "Authorization": f"Bearer {tokens[0]}", "X-MCP-Assertion": signed,
    }).status_code == 200
    assert client.get("/mcp/identity", headers={"Authorization": f"Bearer {signed}"}).status_code == 200
    mismatch = assertion(secret=secret, oauth_issuer=ISSUER)
    assert client.get("/mcp/identity", headers={"Authorization": f"Bearer {mismatch}"}).status_code == 401


def test_scans_and_issues_are_bounded_scoped_and_exclude_sensitive_columns(api):
    client, _, _, _, engine = api
    link(api)
    own = seed_scan(api)
    other = seed_scan(api, user=1)
    statements = []

    def capture(_conn, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture)
    try:
        listing = client.get("/mcp/scans", headers=headers()).json()
        assert listing["total"] == 1
        assert listing["items"][0]["id"] == str(own)
        assert "error_message" not in listing["items"][0]
        assert "queued_page_urls" not in listing["items"][0]
        assert client.get(f"/mcp/scans/{own}", headers=headers()).status_code == 200
        for scan_id in (other, uuid4()):
            assert client.get(f"/mcp/scans/{scan_id}", headers=headers()).status_code == 404
            assert client.get(f"/mcp/scans/{scan_id}/issues", headers=headers()).status_code == 404
        page = client.get(f"/mcp/scans/{own}/issues?limit=1&offset=1&severity=high", headers=headers()).json()
        assert page["total"] == 3
        assert page["limit"] == page["offset"] == len(page["items"]) == 1
        issue = page["items"][0]
        assert len(issue["element"]) == len(issue["message"]) == len(issue["recommendation"]) == 2000
        assert len(issue["page_url"]) == 2048
        assert len(issue["wcag_criteria"]) == 20
        assert "screenshot_data_url" not in issue
        assert client.get(f"/mcp/scans/{own}/issues?severity=low", headers=headers()).json()["total"] == 0
        assert not any("screenshot_data_url" in sql for sql in statements)
        assert not any("queued_page_urls" in sql for sql in statements)
        assert any("LIMIT" in sql and "scan_issues" in sql for sql in statements)
    finally:
        event.remove(engine, "before_cursor_execute", capture)


@pytest.mark.parametrize("path", [
    "/mcp/scans?limit=21", "/mcp/scans?offset=-1", "/mcp/scans?offset=100001",
    "/mcp/scans?status=unknown", "/mcp/scans?q=" + "x" * 201,
    "/mcp/scans/not-a-uuid", f"/mcp/scans/{uuid4()}/issues?limit=51",
    f"/mcp/scans/{uuid4()}/issues?severity=critical",
])
def test_query_validation(api, path):
    client, _, _, _, _ = api
    link(api)
    assert client.get(path, headers=headers()).status_code == 422


def test_rate_limit_is_shared_by_identity_and_data_routes(api, monkeypatch):
    client, _, _, _, _ = api
    link(api)
    monkeypatch.setenv("MCP_RATE_LIMIT_PER_MINUTE", "3")
    assert client.get("/mcp/identity", headers=headers()).status_code == 200
    assert client.get("/mcp/scans", headers=headers()).status_code == 200
    denied = client.get("/mcp/scans", headers=headers())
    assert denied.status_code == 429
    assert 1 <= int(denied.headers["Retry-After"]) <= 60


def test_atomic_rate_limit_across_concurrent_sessions_and_window_reset(api, monkeypatch):
    _, factory, users, _, _ = api
    monkeypatch.setenv("MCP_RATE_LIMIT_PER_MINUTE", "5")
    monkeypatch.setattr("app.repositories.mcp_repository.time.time", lambda: 1800000001)

    def consume(_):
        with factory() as db:
            try:
                enforce_mcp_rate_limit(db, users[0].id)
                return 200
            except HTTPException as error:
                return error.status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(consume, range(20)))
    assert results.count(200) == 5
    assert results.count(429) == 15
    monkeypatch.setattr("app.repositories.mcp_repository.time.time", lambda: 1800000061)
    assert consume(0) == 200
    with factory() as db:
        assert db.scalar(select(McpRateLimit.requests)) == 1


def test_concurrent_different_users_never_share_identity_or_scan_data(api):
    client, _, users, _, _ = api
    link(api)
    link(api, user=1, subject="other")
    scans = [seed_scan(api, user=index) for index in range(2)]

    def read(index):
        subject = "external-user" if index == 0 else "other"
        identity = client.get("/mcp/identity", headers=headers(subject)).json()
        listing = client.get("/mcp/scans", headers=headers(subject)).json()
        return identity["user_id"], listing["items"][0]["id"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(read, [0, 1]))
    assert results == [(str(users[index].id), str(scans[index])) for index in range(2)]


def test_write_routes_are_not_exposed(api):
    client, _, _, _, _ = api
    link(api)
    for method in (client.post, client.put, client.delete):
        assert method("/mcp/scans", headers=headers()).status_code == 405
