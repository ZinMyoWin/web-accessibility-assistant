from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import scan_worker
from app.main import run_multi_page_scan_job
from app.models.auth import User
from app.models.scan import ScanIssueRecord, ScanRun
from app.repositories import scan_repository
from app.schemas.scan import ScanIssue
from app.services import page_scanner
from app.services.page_scanner import (
    CrawlQueueControl,
    PageScanResult,
    ParsedPageData,
    ScanCancelled,
    ScanOptions,
)


def _session():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    User.__table__.create(engine)
    ScanRun.__table__.create(engine)
    ScanIssueRecord.__table__.create(engine)
    return sessionmaker(bind=engine)()


def _scan_run(**overrides):
    values = {
        "id": uuid4(),
        "user_id": uuid4(),
        "requested_url": "https://example.com",
        "final_url": None,
        "status": "running",
        "mode": "multi",
        "page_limit": 5,
        "pages_scanned": 0,
        "pages_skipped": 0,
        "scanned_page_urls": [],
        "skipped_page_urls": [],
        "queued_page_urls": ["https://example.com/about"],
        "excluded_page_urls": [],
        "worker_attempts": 1,
        "max_worker_attempts": 3,
        "started_at": datetime(2026, 1, 2, 2, 0, 0, tzinfo=UTC),
        "total_issues": 0,
        "high_count": 0,
        "medium_count": 0,
        "low_count": 0,
    }
    values.update(overrides)
    return ScanRun(**values)


def _persisted_scan(session, **overrides):
    scan_run = _scan_run(**overrides)
    session.add(scan_run)
    session.commit()
    session.refresh(scan_run)
    return scan_run


def test_request_scan_cancel_marks_queued_scan_cancelled():
    session = _session()
    scan_run = _persisted_scan(session, status="queued")

    cancelled = scan_repository.request_scan_cancel(session, scan_run.id, scan_run.user_id)

    assert cancelled is not None
    assert cancelled.status == "cancelled"
    assert cancelled.error_message == "Cancelled by user"
    assert cancelled.completed_at is not None
    assert cancelled.cancel_requested_at is not None
    assert cancelled.queued_page_urls == []


def test_request_scan_cancel_sets_flag_for_running_scan():
    session = _session()
    scan_run = _persisted_scan(session, status="running")

    cancelled = scan_repository.request_scan_cancel(session, scan_run.id, scan_run.user_id)

    assert cancelled is not None
    assert cancelled.status == "running"
    assert cancelled.cancel_requested_at is not None
    assert cancelled.completed_at is None


def test_request_scan_cancel_returns_none_for_another_users_scan():
    session = _session()
    scan_run = _persisted_scan(session, status="queued")

    assert scan_repository.request_scan_cancel(session, scan_run.id, uuid4()) is None


def test_mark_scan_cancelled_preserves_partial_issue_records():
    session = _session()
    scan_run = _persisted_scan(session, status="running", total_issues=1, high_count=1)
    session.add(
        ScanIssueRecord(
            scan_run_id=scan_run.id,
            position=1,
            rule_id="image-alt",
            severity="high",
            element="<img>",
            message="Image is missing an alt attribute.",
            recommendation="Add alt text.",
        )
    )
    session.commit()

    cancelled = scan_repository.mark_scan_cancelled(session, scan_run.id)

    assert cancelled is not None
    assert cancelled.status == "cancelled"
    assert cancelled.error_message == "Cancelled by user"
    assert cancelled.completed_at is not None
    assert cancelled.total_issues == 1
    assert cancelled.high_count == 1
    assert session.query(ScanIssueRecord).count() == 1


def test_mark_scan_cancelled_does_not_overwrite_completed_scan():
    session = _session()
    scan_run = _persisted_scan(session, status="complete", completed_at=datetime.now(UTC))

    result = scan_repository.mark_scan_cancelled(session, scan_run.id)

    assert result is not None
    assert result.status == "complete"


def test_stale_running_scan_with_cancel_request_is_cancelled_not_requeued():
    session = _session()
    scan_run = _persisted_scan(
        session,
        status="running",
        heartbeat_at=datetime(2026, 1, 1),
        cancel_requested_at=datetime(2026, 1, 1, 0, 5, 0, tzinfo=UTC),
    )

    recovered = scan_repository.recover_stale_running_scans(session, stale_after_seconds=30)

    session.refresh(scan_run)
    assert recovered == 1
    assert scan_run.status == "cancelled"
    assert scan_run.worker_id is None
    assert scan_run.heartbeat_at is None


def test_retry_or_fail_running_scan_marks_cancelled_instead_of_requeueing():
    session = _session()
    scan_run = _persisted_scan(
        session,
        status="running",
        worker_attempts=1,
        max_worker_attempts=3,
        cancel_requested_at=datetime(2026, 1, 1, 0, 5, 0, tzinfo=UTC),
    )

    result = scan_repository.retry_or_fail_running_scan(
        session,
        scan_run.id,
        error_message="worker crashed",
        failed_at=datetime.now(UTC),
    )

    assert result is not None
    assert result.status == "cancelled"
    assert result.error_message == "Cancelled by user"
    assert result.worker_attempts == 1


def test_is_scan_cancel_requested_tracks_flag_and_status():
    session = _session()
    flagged = _persisted_scan(session, status="running")
    cancelled = _persisted_scan(session, status="cancelled")
    plain = _persisted_scan(session, status="running")

    assert scan_repository.is_scan_cancel_requested(session, flagged.id) is False
    scan_repository.request_scan_cancel(session, flagged.id, flagged.user_id)
    assert scan_repository.is_scan_cancel_requested(session, flagged.id) is True
    assert scan_repository.is_scan_cancel_requested(session, cancelled.id) is True
    assert scan_repository.is_scan_cancel_requested(session, plain.id) is False
    assert scan_repository.is_scan_cancel_requested(session, uuid4()) is False


def test_history_status_filter_accepts_cancelled():
    session = _session()
    owner_id = uuid4()
    cancelled = _persisted_scan(session, user_id=owner_id, status="cancelled")
    _persisted_scan(session, user_id=owner_id, status="complete")

    response = scan_repository.list_saved_scans(
        session,
        user_id=owner_id,
        limit=20,
        offset=0,
        status="cancelled",
    )

    assert response.total == 1
    assert response.items[0].id == str(cancelled.id)


def test_multi_page_scan_stops_after_cancel_request(monkeypatch):
    scanned_urls: list[str] = []

    def fake_scan_one_page(url, options, *, run_browser_analysis, capture_screenshots, browser_session=None):
        scanned_urls.append(url)
        links = [{"href": "/about"}, {"href": "/contact"}] if len(scanned_urls) == 1 else []
        return PageScanResult(
            final_url=url,
            page_data=ParsedPageData(title="Page", html_lang="en", links=links),
            issues=[],
        )

    monkeypatch.setattr(page_scanner, "_scan_one_page", fake_scan_one_page)
    control = CrawlQueueControl(should_cancel=lambda: len(scanned_urls) >= 1)

    with pytest.raises(ScanCancelled):
        page_scanner.scan_page(
            "https://example.com",
            ScanOptions(mode="multi", page_limit=3, crawl_depth=2, request_delay_ms=0),
            control,
        )

    assert scanned_urls == ["https://example.com"]


def test_single_page_scan_raises_when_cancel_requested_before_start(monkeypatch):
    def fail_scan(*_args, **_kwargs):
        raise AssertionError("page should not be scanned after cancellation")

    monkeypatch.setattr(page_scanner, "_scan_one_page", fail_scan)

    with pytest.raises(ScanCancelled):
        page_scanner.scan_page(
            "https://example.com",
            ScanOptions(mode="single"),
            CrawlQueueControl(should_cancel=lambda: True),
        )


def test_worker_marks_scan_cancelled_and_does_not_retry(monkeypatch):
    scan_id = uuid4()
    scan_run = SimpleNamespace(
        id=scan_id,
        requested_url="https://example.com",
        scan_options={"mode": "multi"},
    )
    captured: dict[str, object] = {}

    def fake_scan_page(*_args, **_kwargs):
        raise ScanCancelled()

    monkeypatch.setattr(scan_worker, "scan_page", fake_scan_page)
    monkeypatch.setattr(scan_worker, "is_scan_cancel_requested", lambda _db, _sid: False)
    monkeypatch.setattr(
        scan_worker,
        "mark_scan_cancelled",
        lambda _db, sid: captured.setdefault("cancelled", sid),
    )
    monkeypatch.setattr(
        scan_worker,
        "retry_or_fail_running_scan",
        lambda *_args, **_kwargs: pytest.fail("cancelled scans must not be retried"),
    )
    monkeypatch.setattr(
        scan_worker,
        "complete_running_scan",
        lambda *_args, **_kwargs: pytest.fail("cancelled scans must not complete"),
    )

    scan_worker._run_claimed_scan(object(), scan_run)

    assert captured["cancelled"] == scan_id


def test_worker_marks_cancelled_when_flag_set_after_final_page(monkeypatch):
    scan_id = uuid4()
    scan_run = SimpleNamespace(
        id=scan_id,
        requested_url="https://example.com",
        scan_options={"mode": "single"},
    )
    captured: dict[str, object] = {}
    cancel_checks = {"count": 0}

    def fake_is_cancelled(_db, _sid):
        cancel_checks["count"] += 1
        return cancel_checks["count"] > 1

    result = SimpleNamespace(scanned_at=datetime.now(UTC).isoformat())

    monkeypatch.setattr(scan_worker, "scan_page", lambda *_args, **_kwargs: result)
    monkeypatch.setattr(scan_worker, "is_scan_cancel_requested", fake_is_cancelled)
    monkeypatch.setattr(
        scan_worker,
        "mark_scan_cancelled",
        lambda _db, sid: captured.setdefault("cancelled", sid),
    )
    monkeypatch.setattr(
        scan_worker,
        "complete_running_scan",
        lambda *_args, **_kwargs: pytest.fail("cancelled scans must not complete"),
    )

    scan_worker._run_claimed_scan(object(), scan_run)

    assert captured["cancelled"] == scan_id


def test_worker_completes_scan_when_cancellation_is_not_requested(monkeypatch):
    scan_id = uuid4()
    scan_run = SimpleNamespace(
        id=scan_id,
        requested_url="https://example.com",
        scan_options={"mode": "single"},
    )
    captured: dict[str, object] = {}
    result = SimpleNamespace(scanned_at=datetime.now(UTC).isoformat())

    monkeypatch.setattr(scan_worker, "scan_page", lambda *_args, **_kwargs: result)
    monkeypatch.setattr(scan_worker, "is_scan_cancel_requested", lambda _db, _sid: False)
    monkeypatch.setattr(
        scan_worker,
        "complete_running_scan",
        lambda _db, sid, **_kwargs: captured.setdefault("completed", sid),
    )
    monkeypatch.setattr(
        scan_worker,
        "mark_scan_cancelled",
        lambda *_args, **_kwargs: pytest.fail("scan should not be cancelled"),
    )

    scan_worker._run_claimed_scan(object(), scan_run)

    assert captured["completed"] == scan_id


def test_background_multi_page_job_marks_cancelled(monkeypatch):
    scan_id = uuid4()
    fake_db = SimpleNamespace(close=lambda: None)
    captured: dict[str, object] = {}

    monkeypatch.setattr("app.main.get_session_factory", lambda: (lambda: fake_db))

    def fake_scan_page(*_args, **_kwargs):
        raise ScanCancelled()

    monkeypatch.setattr("app.main.scan_page", fake_scan_page)
    monkeypatch.setattr(
        "app.main.mark_scan_cancelled",
        lambda _db, sid: captured.setdefault("cancelled", sid),
    )
    monkeypatch.setattr(
        "app.main.complete_running_scan",
        lambda *_args, **_kwargs: pytest.fail("cancelled scans must not complete"),
    )

    run_multi_page_scan_job(scan_id, "https://example.com", ScanOptions(mode="multi"))

    assert captured["cancelled"] == scan_id


def test_scan_page_response_schema_accepts_cancelled_status():
    from app.schemas.scan import ScanPageResponse, ScanSummary

    response = ScanPageResponse(
        status="cancelled",
        url="https://example.com",
        scanned_at=datetime.now(UTC).isoformat(),
        summary=ScanSummary(total_issues=0, high=0, medium=0, low=0),
        issues=[],
    )

    assert response.status == "cancelled"


def test_scan_issue_partial_data_survives_cancellation(monkeypatch):
    """Cancelling after the first page keeps the issues already discovered."""
    session = _session()
    scan_run = _persisted_scan(session, status="running")
    issue = ScanIssue(
        rule_id="image-alt",
        severity="high",
        element="<img>",
        message="Image is missing an alt attribute.",
        recommendation="Add alt text.",
        page_url="https://example.com",
    )

    scan_repository.update_scan_progress(
        session,
        scan_run.id,
        current_page_url=None,
        issues=[issue],
        scanned_page_urls=["https://example.com"],
    )
    cancelled = scan_repository.mark_scan_cancelled(session, scan_run.id)

    assert cancelled is not None
    assert cancelled.total_issues == 1
    assert cancelled.scanned_page_urls == ["https://example.com"]
