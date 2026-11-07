"""Focused tests for the API/DB performance work in task-8.

Covers:
* A) migration ``9848b576f075`` is the single linear head and its indexes can be
  created/dropped on SQLite (portable SQLAlchemy operations).
* B) crawl-memory lookup is a single column-only query with zero ORM row loads;
  the history-list fallback issue URLs use one batch query instead of N+1 lazy
  loads.
* C) incremental issue persistence appends only the new tail, retry claims clear
  partial rows, and the final replace stays authoritative.
* D) ``GET /scans/{id}?include_issues=false`` returns an empty issue list without
  querying ``scan_issues`` and keeps the stored summary counts.
* E) environment-driven connection-pool options for non-SQLite engines.
* F) token-bucket rate limiting: 429 + ``Retry-After``, per-identity isolation,
  env disable switch, idle-bucket pruning.
* G) Prometheus text metrics endpoint + structured slow-scan logging.
"""

from __future__ import annotations

import importlib.util
import json
import logging
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models.preferences  # noqa: F401 - register tables for create_all
import app.models.repair_suggestion  # noqa: F401 - register tables for create_all
from app import db as app_db
from app.db import get_db_session
from app.main import app
from app.models.auth import User
from app.models.base import Base
from app.models.scan import ScanIssueRecord, ScanRun
from app.repositories import scan_repository
from app.schemas.scan import ScanIssue, ScanPageResponse, ScanSummary
from app.services import metrics, rate_limit

BACKEND_DIR = Path(__file__).resolve().parents[1]
MIGRATION_F075_PATH = (
    BACKEND_DIR
    / "alembic"
    / "versions"
    / "9848b576f075_add_scan_performance_indexes.py"
)
EXPECTED_F075_INDEXES = {
    "scan_runs": {
        "ix_scan_runs_user_id_started_at",
        "ix_scan_runs_status_started_at",
        "ix_scan_runs_status_heartbeat_at",
    },
    "scan_issues": {"ix_scan_issues_scan_run_id_position"},
}
AUTH_HEADERS = {"Authorization": "Bearer test-token"}

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _create_database(*, shared: bool = False):
    """Create an in-memory SQLite database with every model table.

    ``shared=True`` uses a StaticPool so the single in-memory database can be
    used by the FastAPI threadpool (same pattern as test_bundle_and_cancel_api).
    """
    if shared:
        engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    else:
        engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
        class_=Session,
    )
    return engine, session_factory()


def _create_user(session: Session, *, email_prefix: str = "perf") -> User:
    user = User(
        name="Perf User",
        email=f"{email_prefix}-{uuid4()}@example.com",
        password_hash="hashed:password",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_scan_run(session: Session, *, user: User, **overrides) -> ScanRun:
    values: dict[str, object] = {
        "id": uuid4(),
        "user_id": user.id,
        "requested_url": "https://example.com",
        "final_url": None,
        "status": "running",
        "mode": "multi",
        "page_limit": 5,
        "pages_scanned": 0,
        "pages_skipped": 0,
        "scanned_page_urls": [],
        "skipped_page_urls": [],
        "queued_page_urls": [],
        "excluded_page_urls": [],
        "current_page_url": None,
        "worker_attempts": 0,
        "max_worker_attempts": 3,
        "started_at": datetime(2026, 1, 1, tzinfo=UTC),
        "total_issues": 0,
        "high_count": 0,
        "medium_count": 0,
        "low_count": 0,
    }
    values.update(overrides)
    scan_run = ScanRun(**values)
    session.add(scan_run)
    session.commit()
    session.refresh(scan_run)
    return scan_run


def _add_issue_record(
    session: Session,
    scan_run: ScanRun,
    position: int,
    *,
    severity: str = "high",
    page_url: str | None = "https://example.com",
) -> ScanIssueRecord:
    issue = ScanIssueRecord(
        scan_run_id=scan_run.id,
        position=position,
        rule_id="image-alt",
        severity=severity,
        element="<img>",
        message="Image is missing an alt attribute.",
        recommendation="Add meaningful alt text.",
        page_url=page_url,
    )
    session.add(issue)
    session.commit()
    return issue


def _partial_issue(severity: str = "high", *, page_url: str = "https://example.com") -> ScanIssue:
    return ScanIssue(
        rule_id="image-alt",
        severity=severity,
        element="<img>",
        message="Image is missing an alt attribute.",
        recommendation="Add meaningful alt text.",
        page_url=page_url,
    )


def _scan_result(
    *,
    issues: list[ScanIssue],
    pages_scanned: int = 1,
    scanned_at: datetime | None = None,
    timings: dict[str, float] | None = None,
) -> ScanPageResponse:
    return ScanPageResponse(
        url="https://example.com",
        scanned_at=(scanned_at or datetime.now(UTC)).isoformat(),
        mode="multi",
        pages_scanned=pages_scanned,
        scanned_page_urls=["https://example.com"],
        summary=ScanSummary(
            total_issues=len(issues),
            high=sum(issue.severity == "high" for issue in issues),
            medium=sum(issue.severity == "medium" for issue in issues),
            low=sum(issue.severity == "low" for issue in issues),
        ),
        issues=issues,
        timings=timings,
    )


class _DatabaseCounters:
    def __init__(self) -> None:
        self.statements: list[str] = []
        self.orm_rows = 0
        self.inserted_issue_rows = 0
        self.deleted_issue_rows = 0

    def issue_selects(self) -> list[str]:
        return [s for s in self.statements if "scan_issues" in s.lower()]


@contextmanager
def _count_database(engine, models=()):
    """Count SQL statements, ORM rows loaded, and issue-row writes."""
    counters = _DatabaseCounters()

    def on_execute(_conn, _cursor, statement, _parameters, _context, _executemany):
        counters.statements.append(statement)

    def on_after_execute(
        _conn, cursor, statement, _parameters, _context, _executemany
    ):
        # ``cursor.rowcount`` is the portable way to count affected rows for
        # INSERT/UPDATE/DELETE on both SQLite and PostgreSQL (the pysqlite
        # "fast executemany" form flattens parameters, so parameter length is
        # not a reliable row count).
        lowered = statement.lower()
        affected = max(int(cursor.rowcount or 0), 0)
        if "insert into scan_issues" in lowered:
            counters.inserted_issue_rows += affected
        elif "delete from scan_issues" in lowered:
            counters.deleted_issue_rows += affected

    def on_load(_instance, _context):
        counters.orm_rows += 1

    event.listen(engine, "before_cursor_execute", on_execute)
    event.listen(engine, "after_cursor_execute", on_after_execute)
    listeners = [(model, on_load) for model in models]
    for model, handler in listeners:
        event.listen(model, "load", handler)
    try:
        yield counters
    finally:
        event.remove(engine, "before_cursor_execute", on_execute)
        event.remove(engine, "after_cursor_execute", on_after_execute)
        for model, handler in listeners:
            event.remove(model, "load", handler)


@contextmanager
def _override_db(session: Session):
    app.dependency_overrides[get_db_session] = lambda: session
    try:
        yield
    finally:
        app.dependency_overrides.clear()


def _fake_db():
    return SimpleNamespace(close=lambda: None, rollback=lambda: None)


def _fake_user():
    return SimpleNamespace(
        id=uuid4(),
        name="Rate Limit User",
        email="rate-limit@example.com",
        created_at=datetime.now(UTC),
    )


def _fake_preferences():
    return SimpleNamespace(
        default_scan_mode="single",
        default_page_limit=5,
        crawl_depth=3,
        request_delay_ms=250,
        page_timeout_ms=15000,
        ignored_url_patterns=["/logout"],
        stay_within_domain=True,
        respect_robots_txt=True,
        skip_previously_scanned_pages=True,
        wcag_standard="wcag21aa",
        include_best_practices=True,
    )


class _FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture(autouse=True)
def _reset_process_state():
    """Keep rate-limit buckets and metrics counters isolated per test."""
    rate_limit.reset_rate_limits()
    metrics.reset_metrics()
    yield
    rate_limit.reset_rate_limits()
    metrics.reset_metrics()


# ---------------------------------------------------------------------------
# A) Index migration f075
# ---------------------------------------------------------------------------


def _load_migration_f075():
    spec = importlib.util.spec_from_file_location(
        "perf_migration_f075", MIGRATION_F075_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migrations_have_single_head_and_preserve_f075_ancestry():
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    script = ScriptDirectory.from_config(config)

    assert script.get_heads() == ["9848b576f076"]
    assert script.get_revision("9848b576f076").down_revision == "9848b576f075"
    revision = script.get_revision("9848b576f075")
    assert revision.down_revision == "9848b576f074"


def test_migration_f075_creates_and_drops_expected_indexes_on_sqlite():
    migration = _load_migration_f075()
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with engine.begin() as connection:
        operations = Operations(MigrationContext.configure(connection))
        migration.op = operations
        try:
            for table_name, expected_names in EXPECTED_F075_INDEXES.items():
                existing_names = {
                    index["name"] for index in inspect(connection).get_indexes(table_name)
                }
                assert expected_names.isdisjoint(existing_names)

            migration.upgrade()

            for table_name, expected_names in EXPECTED_F075_INDEXES.items():
                existing_names = {
                    index["name"] for index in inspect(connection).get_indexes(table_name)
                }
                assert expected_names <= existing_names

            migration.downgrade()

            for table_name, expected_names in EXPECTED_F075_INDEXES.items():
                existing_names = {
                    index["name"] for index in inspect(connection).get_indexes(table_name)
                }
                assert expected_names.isdisjoint(existing_names)
        finally:
            migration.op = None
    engine.dispose()


# ---------------------------------------------------------------------------
# B) Crawl-memory lookup + history list query shape
# ---------------------------------------------------------------------------


def test_crawl_memory_lookup_is_one_column_query_without_orm_issue_loads():
    engine, session = _create_database()
    owner = _create_user(session)
    other_user = _create_user(session)

    first_scan = _make_scan_run(
        session,
        user=owner,
        status="complete",
        requested_url="https://example.com/",
        final_url="https://example.com/home",
        scanned_page_urls=[
            "https://example.com/about",
            "https://example.com/contact",
        ],
    )
    legacy_scan = _make_scan_run(
        session,
        user=owner,
        status="complete",
        requested_url="https://example.com/blog#section",
        final_url=None,
        scanned_page_urls=[],
    )
    mixed_scan = _make_scan_run(
        session,
        user=owner,
        status="complete",
        requested_url="https://EXAMPLE.com/",
        final_url="https://example.com",
        scanned_page_urls=[
            "https://example.com/Case-Sensitive",
            "https://external.example.net/elsewhere",
        ],
    )
    _make_scan_run(
        session,
        user=other_user,
        status="complete",
        requested_url="https://example.com/other-user-page",
        scanned_page_urls=["https://example.com/other-user-page"],
    )
    _make_scan_run(
        session,
        user=owner,
        status="error",
        requested_url="https://example.com/failed",
        scanned_page_urls=["https://example.com/failed"],
    )
    for scan_run in (first_scan, legacy_scan, mixed_scan):
        _add_issue_record(
            session,
            scan_run,
            1,
            page_url="https://example.com/issue-page-url",
        )
    session.expunge_all()

    with _count_database(engine, models=[ScanRun, ScanIssueRecord]) as counters:
        scanned_urls = scan_repository.get_previously_scanned_page_urls_for_domain(
            session,
            owner.id,
            "https://example.com/",
        )

    # The baseline measured 2 SQL statements and 20,200 ORM rows for 200 scans
    # x 100 issues; the column-only rewrite is exactly one statement and no ORM
    # row materialization (result tuples are plain SQLAlchemy Row objects).
    assert len(counters.statements) == 1
    assert counters.orm_rows == 0
    assert counters.issue_selects() == []
    assert scanned_urls == {
        "https://example.com",
        "https://example.com/home",
        "https://example.com/about",
        "https://example.com/contact",
        "https://example.com/blog",
        "https://example.com/Case-Sensitive",
    }
    session.close()


def test_history_list_fallback_uses_one_issue_query_instead_of_n_plus_one():
    engine, session = _create_database()
    owner = _create_user(session)

    for index in range(3):
        _make_scan_run(
            session,
            user=owner,
            status="queued",
            requested_url=f"https://example.com/queued-{index}",
            scanned_page_urls=[],
            queued_page_urls=["https://example.com/queued"],
        )
    for index in range(2):
        scan_run = _make_scan_run(
            session,
            user=owner,
            status="running",
            requested_url=f"https://example.com/running-{index}",
            scanned_page_urls=[],
        )
        _add_issue_record(
            session,
            scan_run,
            1,
            page_url=f"https://example.com/running-{index}/issue-page",
        )
    _make_scan_run(
        session,
        user=owner,
        status="complete",
        requested_url="https://example.com/complete",
        final_url="https://example.com/complete",
        scanned_page_urls=["https://example.com/complete"],
    )
    for index in range(2):
        legacy = _make_scan_run(
            session,
            user=owner,
            status="complete",
            requested_url=f"https://example.com/legacy-{index}",
            final_url=None,
            scanned_page_urls=[],
        )
        _add_issue_record(
            session,
            legacy,
            1,
            page_url=f"https://example.com/legacy-{index}/issue-page",
        )
    session.expunge_all()

    with _count_database(engine, models=[ScanRun, ScanIssueRecord]) as counters:
        response = scan_repository.list_saved_scans(
            session,
            user_id=owner.id,
            limit=50,
            offset=0,
        )

    # Baseline: limit=50 issued 45 SQL statements (2 + 43 lazy issue loads).
    # Optimized: COUNT + page SELECT + one column-only fallback query.
    assert response.total == 8
    assert len(response.items) == 8
    assert len(counters.statements) == 3
    assert len(counters.issue_selects()) == 1
    assert counters.orm_rows == 8

    fallback_by_url = {
        item.requested_url: item.scanned_page_urls for item in response.items
    }
    assert fallback_by_url["https://example.com/queued-0"] == [
        "https://example.com/queued-0"
    ]
    assert fallback_by_url["https://example.com/running-0"] == [
        "https://example.com/running-0",
        "https://example.com/running-0/issue-page",
    ]
    assert fallback_by_url["https://example.com/legacy-0"] == [
        "https://example.com/legacy-0",
        "https://example.com/legacy-0/issue-page",
    ]
    # Rows with persisted scanned_page_urls never consult issue rows.
    assert fallback_by_url["https://example.com/complete"] == [
        "https://example.com/complete"
    ]
    session.close()


# ---------------------------------------------------------------------------
# C) Incremental issue persistence + retry cleanup
# ---------------------------------------------------------------------------


def test_three_progress_publishes_persist_only_new_issue_rows():
    engine, session = _create_database()
    owner = _create_user(session)
    scan_run = _make_scan_run(session, user=owner, status="running")

    issues_100 = [_partial_issue("high") for _ in range(100)]
    issues_200 = issues_100 + [_partial_issue("medium") for _ in range(100)]
    issues_300 = issues_200 + [_partial_issue("low") for _ in range(100)]

    with _count_database(engine, models=[ScanRun, ScanIssueRecord]) as counters:
        scan_repository.update_scan_progress(session, scan_run.id, issues=issues_100)
        assert session.query(ScanIssueRecord).count() == 100
        scan_repository.update_scan_progress(session, scan_run.id, issues=issues_200)
        assert session.query(ScanIssueRecord).count() == 200
        scan_repository.update_scan_progress(session, scan_run.id, issues=issues_300)
        assert session.query(ScanIssueRecord).count() == 300

    # Delete-all + re-insert-all would write 100 + 200 + 300 = 600 INSERTs and
    # 100 + 200 = 300 DELETEs. The append path writes exactly 300 rows for 300
    # final rows (1x insert, 0 deletes).
    assert counters.inserted_issue_rows == 300
    assert counters.deleted_issue_rows == 0

    session.refresh(scan_run)
    assert scan_run.total_issues == 300
    assert scan_run.high_count == 100
    assert scan_run.medium_count == 100
    assert scan_run.low_count == 100
    persisted_positions = [
        row.position
        for row in session.scalars(
            select(ScanIssueRecord)
            .where(ScanIssueRecord.scan_run_id == scan_run.id)
            .order_by(ScanIssueRecord.position)
        )
    ]
    assert persisted_positions == list(range(1, 301))
    session.close()


def test_claim_next_queued_scan_clears_partial_issue_rows_on_retry():
    engine, session = _create_database()
    owner = _create_user(session)
    scan_run = _make_scan_run(
        session,
        user=owner,
        status="queued",
        worker_attempts=1,
        total_issues=3,
        high_count=2,
        medium_count=1,
        pages_scanned=1,
        scanned_page_urls=["https://example.com"],
    )
    _add_issue_record(session, scan_run, 1)
    _add_issue_record(session, scan_run, 2, severity="medium")
    _add_issue_record(session, scan_run, 3, severity="high")
    session.expunge_all()

    claimed = scan_repository.claim_next_queued_scan(session, worker_id="retry-worker")

    assert claimed is not None
    assert claimed.status == "running"
    assert claimed.worker_attempts == 2
    assert claimed.total_issues == 0
    assert claimed.high_count == 0
    assert claimed.medium_count == 0
    assert claimed.low_count == 0
    assert (
        session.query(ScanIssueRecord)
        .filter(ScanIssueRecord.scan_run_id == scan_run.id)
        .count()
        == 0
    )

    scan_repository.update_scan_progress(
        session,
        scan_run.id,
        issues=[_partial_issue("high"), _partial_issue("medium")],
    )
    session.refresh(claimed)
    assert claimed.total_issues == 2
    positions = [
        row.position
        for row in session.scalars(
            select(ScanIssueRecord)
            .where(ScanIssueRecord.scan_run_id == scan_run.id)
            .order_by(ScanIssueRecord.position)
        )
    ]
    assert positions == [1, 2]
    session.close()


def test_complete_running_scan_final_replace_is_ordered_and_authoritative():
    engine, session = _create_database()
    owner = _create_user(session)
    scan_run = _make_scan_run(session, user=owner, status="running")

    scan_repository.update_scan_progress(
        session,
        scan_run.id,
        issues=[_partial_issue("high"), _partial_issue("high")],
    )

    final_issues = [
        _partial_issue("high"),
        _partial_issue("medium"),
        _partial_issue("low"),
    ]
    result = _scan_result(issues=final_issues, pages_scanned=2)
    completed = scan_repository.complete_running_scan(
        session,
        scan_run.id,
        result=result,
        completed_at=datetime.now(UTC),
    )

    assert completed is not None
    assert completed.status == "complete"
    assert completed.total_issues == 3
    assert completed.high_count == 1
    assert completed.medium_count == 1
    assert completed.low_count == 1
    assert completed.score == scan_repository.calculate_scan_score(result)
    rows = session.scalars(
        select(ScanIssueRecord)
        .where(ScanIssueRecord.scan_run_id == scan_run.id)
        .order_by(ScanIssueRecord.position)
    ).all()
    assert [row.position for row in rows] == [1, 2, 3]
    assert [row.severity for row in rows] == ["high", "medium", "low"]
    session.close()


# ---------------------------------------------------------------------------
# D) Lightweight polling endpoint (include_issues=false)
# ---------------------------------------------------------------------------


def test_scan_detail_include_issues_false_skips_issue_rows_but_keeps_summary(monkeypatch):
    engine, session = _create_database(shared=True)
    user = _create_user(session)
    scan_run = _make_scan_run(
        session,
        user=user,
        status="complete",
        completed_at=datetime(2026, 1, 1, 0, 5, tzinfo=UTC),
        pages_scanned=2,
        scanned_page_urls=["https://example.com", "https://example.com/about"],
        total_issues=2,
        high_count=1,
        medium_count=1,
        low_count=0,
        score=91,
    )
    _add_issue_record(session, scan_run, 1, severity="high")
    _add_issue_record(session, scan_run, 2, severity="medium")
    monkeypatch.setattr("app.main.get_user_for_token", lambda _db, _token: user)

    client = TestClient(app)
    with _override_db(session):
        full_response = client.get(f"/scans/{scan_run.id}", headers=AUTH_HEADERS)

    assert full_response.status_code == 200
    full_body = full_response.json()
    assert len(full_body["issues"]) == 2
    assert full_body["summary"] == {
        "total_issues": 2,
        "high": 1,
        "medium": 1,
        "low": 0,
    }

    session.expunge_all()
    with _count_database(engine) as counters:
        with _override_db(session):
            light_response = client.get(
                f"/scans/{scan_run.id}",
                params={"include_issues": "false"},
                headers=AUTH_HEADERS,
            )

    assert light_response.status_code == 200
    light_body = light_response.json()
    assert light_body["issues"] == []
    assert light_body["summary"] == full_body["summary"]
    assert light_body["status"] == full_body["status"]
    assert light_body["id"] == full_body["id"]
    assert light_body["pages_scanned"] == full_body["pages_scanned"]
    assert light_body["scanned_page_urls"] == full_body["scanned_page_urls"]
    # The lightweight path never issues a scan_issues query.
    assert counters.issue_selects() == []

    session.close()


# ---------------------------------------------------------------------------
# E) Connection-pool configuration
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "database_url",
    ["sqlite+pysqlite:///:memory:", "sqlite:///local-test.db"],
)
def test_engine_options_are_empty_for_sqlite(database_url):
    assert app_db.get_engine_options(database_url) == {}


def test_engine_options_use_documented_defaults_for_postgres(monkeypatch):
    for env_name in (
        "DB_POOL_SIZE",
        "DB_MAX_OVERFLOW",
        "DB_POOL_TIMEOUT",
        "DB_POOL_RECYCLE",
        "DB_POOL_PRE_PING",
    ):
        monkeypatch.delenv(env_name, raising=False)
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/accessibility_assistant",
    )

    assert app_db.get_engine_options() == {
        "pool_size": 5,
        "max_overflow": 10,
        "pool_timeout": 30,
        "pool_recycle": 1800,
        "pool_pre_ping": True,
    }


def test_engine_options_read_environment_overrides(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "8")
    monkeypatch.setenv("DB_MAX_OVERFLOW", "4")
    monkeypatch.setenv("DB_POOL_TIMEOUT", "12")
    monkeypatch.setenv("DB_POOL_RECYCLE", "600")
    monkeypatch.setenv("DB_POOL_PRE_PING", "false")

    options = app_db.get_engine_options("postgresql+psycopg://user:pass@db:5432/app")

    assert options == {
        "pool_size": 8,
        "max_overflow": 4,
        "pool_timeout": 12,
        "pool_recycle": 600,
        "pool_pre_ping": False,
    }


def test_engine_options_ignore_invalid_environment_values(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "not-a-number")
    monkeypatch.setenv("DB_MAX_OVERFLOW", "-3")
    monkeypatch.setenv("DB_POOL_TIMEOUT", "0")
    monkeypatch.setenv("DB_POOL_PRE_PING", "maybe")

    options = app_db.get_engine_options("postgresql+psycopg://user:pass@db:5432/app")

    assert options["pool_size"] == 5
    assert options["max_overflow"] == 0
    assert options["pool_timeout"] == 1
    assert options["pool_pre_ping"] is True


# ---------------------------------------------------------------------------
# F) Rate limiting
# ---------------------------------------------------------------------------


def test_token_bucket_limits_refills_and_isolates_identities():
    clock = _FakeClock()
    limiter = rate_limit.TokenBucketRateLimiter(rate_per_minute=2, clock=clock)

    assert limiter.try_acquire("user-a") == (True, 0.0)
    assert limiter.try_acquire("user-a") == (True, 0.0)

    allowed, retry_after = limiter.try_acquire("user-a")
    assert allowed is False
    assert retry_after == pytest.approx(30.0)

    # A different identity has its own full bucket.
    assert limiter.try_acquire("user-b") == (True, 0.0)

    clock.advance(30.0)
    assert limiter.try_acquire("user-a") == (True, 0.0)


def test_token_bucket_prunes_idle_identities():
    clock = _FakeClock()
    limiter = rate_limit.TokenBucketRateLimiter(rate_per_minute=60, clock=clock)
    for index in range(300):
        limiter.try_acquire(f"user-{index}")
    assert limiter.bucket_count() == 300

    clock.advance(rate_limit._IDLE_BUCKET_SECONDS + rate_limit._PRUNE_INTERVAL_SECONDS + 1)
    limiter.try_acquire("fresh-user")

    assert limiter.bucket_count() == 1


def test_auth_endpoints_return_429_with_retry_after(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("RATE_LIMIT_AUTH_PER_MINUTE", "2")
    monkeypatch.setattr("app.main.get_user_by_email", lambda _db, _email: None)
    rate_limit.reset_rate_limits()

    client = TestClient(app)
    responses = [
        client.post(
            "/auth/login",
            json={"email": "nobody@example.com", "password": "password123"},
        )
        for _ in range(3)
    ]

    assert [response.status_code for response in responses] == [401, 401, 429]
    limited = responses[-1]
    assert "Retry-After" in limited.headers
    assert int(limited.headers["Retry-After"]) >= 1
    assert "Too many authentication attempts" in limited.json()["detail"]
    assert 'rate_limited_total{scope="auth"} 1' in metrics.render_prometheus()
    app.dependency_overrides.clear()


def test_auth_rate_limit_is_per_client_ip(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()
    monkeypatch.setenv("RATE_LIMIT_AUTH_PER_MINUTE", "1")
    monkeypatch.setattr("app.main.get_user_by_email", lambda _db, _email: None)
    rate_limit.reset_rate_limits()

    first_client = TestClient(app, client=("10.0.0.1", 50000))
    second_client = TestClient(app, client=("10.0.0.2", 50000))
    payload = {"email": "nobody@example.com", "password": "password123"}

    assert first_client.post("/auth/login", json=payload).status_code == 401
    assert first_client.post("/auth/login", json=payload).status_code == 429
    assert second_client.post("/auth/login", json=payload).status_code == 401
    app.dependency_overrides.clear()


def test_scan_endpoint_rate_limits_per_authenticated_user(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()
    monkeypatch.setenv("RATE_LIMIT_SCAN_PER_MINUTE", "2")
    monkeypatch.setenv("SCAN_EXECUTION_MODE", "worker")
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
    current_user = {"value": _fake_user()}
    monkeypatch.setattr(
        "app.main.get_user_for_token", lambda _db, _token: current_user["value"]
    )
    monkeypatch.setattr(
        "app.main.get_preferences", lambda _db, _user_id: _fake_preferences()
    )
    monkeypatch.setattr(
        "app.main.create_scan_job",
        lambda _db, **_kwargs: SimpleNamespace(id=uuid4()),
    )
    rate_limit.reset_rate_limits()

    client = TestClient(app)
    payload = {"url": "https://example.com", "mode": "single"}
    responses = [
        client.post("/scan/page", json=payload, headers=AUTH_HEADERS)
        for _ in range(3)
    ]

    assert [response.status_code for response in responses] == [200, 200, 429]
    assert "Retry-After" in responses[-1].headers
    assert "Too many scan requests" in responses[-1].json()["detail"]

    # A different authenticated user has an independent bucket.
    current_user["value"] = _fake_user()
    assert (
        client.post("/scan/page", json=payload, headers=AUTH_HEADERS).status_code
        == 200
    )
    app.dependency_overrides.clear()


def test_rate_limit_can_be_disabled_via_environment(monkeypatch):
    app.dependency_overrides[get_db_session] = lambda: _fake_db()
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("RATE_LIMIT_AUTH_PER_MINUTE", "1")
    monkeypatch.setattr("app.main.get_user_by_email", lambda _db, _email: None)
    rate_limit.reset_rate_limits()

    client = TestClient(app)
    payload = {"email": "nobody@example.com", "password": "password123"}
    statuses = [
        client.post("/auth/login", json=payload).status_code for _ in range(4)
    ]

    assert statuses == [401, 401, 401, 401]
    app.dependency_overrides.clear()


def test_rate_limit_config_reads_environment(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_SCAN_PER_MINUTE", "12")
    monkeypatch.setenv("RATE_LIMIT_AUTH_PER_MINUTE", "7")

    assert rate_limit.get_configured_limit(rate_limit.SCAN_SCOPE) == 12
    assert rate_limit.get_configured_limit(rate_limit.AUTH_SCOPE) == 7

    monkeypatch.setenv("RATE_LIMIT_AUTH_PER_MINUTE", "invalid")
    assert rate_limit.get_configured_limit(rate_limit.AUTH_SCOPE) == 10


# ---------------------------------------------------------------------------
# G) Prometheus metrics + slow-scan logging
# ---------------------------------------------------------------------------


def test_render_prometheus_includes_every_metric_family():
    metrics.record_scan_request("complete")
    metrics.record_scan_request("complete")
    metrics.record_scan_request("queued")
    metrics.record_scan_issues(high=2, medium=1, low=0)
    metrics.record_scan_duration(1.5)
    metrics.record_rate_limited(rate_limit.AUTH_SCOPE)
    metrics.set_scan_queue_depth(3)
    metrics.set_scan_worker_attempts_total(7)

    text = metrics.render_prometheus()

    assert 'scan_requests_total{status="complete"} 2' in text
    assert 'scan_requests_total{status="queued"} 1' in text
    assert 'scan_issues_total{severity="high"} 2' in text
    assert 'scan_issues_total{severity="medium"} 1' in text
    assert 'scan_duration_seconds_bucket{le="2"} 1' in text
    assert 'scan_duration_seconds_bucket{le="+Inf"} 1' in text
    assert "scan_duration_seconds_sum 1.5" in text
    assert "scan_duration_seconds_count 1" in text
    assert 'rate_limited_total{scope="auth"} 1' in text
    assert "scan_queue_depth 3" in text
    assert "scan_worker_attempts_total 7" in text


def test_metrics_endpoint_renders_database_gauges(monkeypatch):
    engine, session = _create_database(shared=True)
    user = _create_user(session)
    _make_scan_run(session, user=user, status="queued", worker_attempts=2)
    _make_scan_run(session, user=user, status="queued", worker_attempts=0)
    _make_scan_run(session, user=user, status="complete", worker_attempts=3)
    metrics.record_scan_request("complete")

    client = TestClient(app)
    with _override_db(session):
        response = client.get("/metrics")

    assert response.status_code == 200
    content_type = response.headers["content-type"]
    assert content_type.startswith("text/plain")
    assert "version=0.0.4" in content_type
    assert "scan_queue_depth 2" in response.text
    assert "scan_worker_attempts_total 5" in response.text
    assert 'scan_requests_total{status="complete"} 1' in response.text
    session.close()
    engine.dispose()


def test_metrics_endpoint_returns_404_when_disabled(monkeypatch):
    monkeypatch.setenv("METRICS_ENABLED", "false")
    app.dependency_overrides[get_db_session] = lambda: _fake_db()

    client = TestClient(app)
    response = client.get("/metrics")

    assert response.status_code == 404
    app.dependency_overrides.clear()


def test_slow_scan_emits_one_structured_log_line_with_phase_timings(monkeypatch, caplog):
    monkeypatch.setenv("SCAN_SLOW_LOG_SECONDS", "10")
    engine, session = _create_database()
    user = _create_user(session)
    started_at = datetime.now(UTC) - timedelta(seconds=42)
    scan_run = _make_scan_run(
        session,
        user=user,
        status="running",
        started_at=started_at,
    )
    result = _scan_result(
        issues=[_partial_issue("high"), _partial_issue("medium")],
        pages_scanned=2,
        timings={"browser_setup": 1.25, "render_wait": 0.5},
    )

    with caplog.at_level(logging.WARNING, logger="app.metrics"):
        completed = scan_repository.complete_running_scan(
            session,
            scan_run.id,
            result=result,
            completed_at=datetime.now(UTC),
        )

    assert completed is not None
    slow_records = [
        record
        for record in caplog.records
        if "slow_scan_complete" in record.getMessage()
    ]
    assert len(slow_records) == 1
    payload = json.loads(slow_records[0].getMessage().split(" ", 1)[1])
    assert payload["event"] == "slow_scan"
    assert payload["scan_id"] == str(scan_run.id)
    assert payload["mode"] == "multi"
    assert payload["pages"] == 2
    assert payload["total_seconds"] >= 41
    assert payload["issue_counts"] == {
        "total": 2,
        "high": 1,
        "medium": 1,
        "low": 0,
    }
    assert payload["phase_timings"] == {"browser_setup": 1.25, "render_wait": 0.5}

    rendered = metrics.render_prometheus()
    assert "scan_duration_seconds_count 1" in rendered
    assert 'scan_requests_total{status="complete"} 1' in rendered
    session.close()
    engine.dispose()


def test_fast_scan_does_not_emit_slow_log_line(monkeypatch, caplog):
    monkeypatch.setenv("SCAN_SLOW_LOG_SECONDS", "10")
    engine, session = _create_database()
    user = _create_user(session)
    scan_run = _make_scan_run(
        session,
        user=user,
        status="running",
        started_at=datetime.now(UTC) - timedelta(seconds=2),
    )
    result = _scan_result(issues=[_partial_issue("high")])

    with caplog.at_level(logging.WARNING, logger="app.metrics"):
        scan_repository.complete_running_scan(
            session,
            scan_run.id,
            result=result,
            completed_at=datetime.now(UTC),
        )

    assert not [
        record
        for record in caplog.records
        if "slow_scan_complete" in record.getMessage()
    ]
    session.close()
    engine.dispose()


def test_slow_scan_threshold_parsing(monkeypatch):
    monkeypatch.delenv("SCAN_SLOW_LOG_SECONDS", raising=False)
    assert metrics.get_slow_scan_threshold_seconds() == 10.0

    monkeypatch.setenv("SCAN_SLOW_LOG_SECONDS", "2.5")
    assert metrics.get_slow_scan_threshold_seconds() == 2.5

    monkeypatch.setenv("SCAN_SLOW_LOG_SECONDS", "invalid")
    assert metrics.get_slow_scan_threshold_seconds() == 10.0


def test_metrics_enabled_is_environment_driven(monkeypatch):
    monkeypatch.delenv("METRICS_ENABLED", raising=False)
    assert metrics.metrics_enabled() is True

    monkeypatch.setenv("METRICS_ENABLED", "false")
    assert metrics.metrics_enabled() is False

    monkeypatch.setenv("METRICS_ENABLED", "true")
    assert metrics.metrics_enabled() is True
