from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.auth import User
import app.models.preferences  # noqa: F401
from app.models.scan import ScanIssueRecord, ScanRun
from app.repositories import scan_repository
from app.schemas.scan import ScanPageResponse, ScanSummary


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
        "queued_page_urls": [
            "https://example.com/about",
            "https://example.com/contact",
        ],
        "excluded_page_urls": [],
        "current_page_url": None,
        "worker_attempts": 1,
        "max_worker_attempts": 3,
        "started_at": datetime.now(UTC),
        "total_issues": 0,
        "high_count": 0,
        "medium_count": 0,
        "low_count": 0,
    }
    values.update(overrides)
    return ScanRun(**values)


def test_calculate_scan_score_is_weighted_and_bounded():
    result = ScanPageResponse(
        url="https://example.com",
        scanned_at=datetime.now(UTC).isoformat(),
        mode="multi",
        pages_scanned=2,
        summary=ScanSummary(total_issues=4, high=1, medium=2, low=1),
        issues=[],
    )
    heavy_result = ScanPageResponse(
        url="https://example.com",
        scanned_at=datetime.now(UTC).isoformat(),
        mode="single",
        pages_scanned=1,
        summary=ScanSummary(total_issues=100, high=100, medium=0, low=0),
        issues=[],
    )

    assert scan_repository.calculate_scan_score(result) == 90
    assert scan_repository.calculate_scan_score(heavy_result) == 0


def test_remove_queued_scan_page_excludes_url_from_running_scan():
    session = _session()
    scan_run = _scan_run()
    session.add(scan_run)
    session.commit()

    updated = scan_repository.remove_queued_scan_page(
        session,
        scan_run.id,
        scan_run.user_id,
        "https://example.com/about/",
    )

    assert updated is not None
    assert updated.queued_page_urls == ["https://example.com/contact"]
    assert updated.excluded_page_urls == ["https://example.com/about"]


def test_prioritize_queued_scan_page_moves_url_to_front():
    session = _session()
    scan_run = _scan_run(
        queued_page_urls=[
            "https://example.com/about",
            "https://example.com/contact",
            "https://example.com/pricing",
        ]
    )
    session.add(scan_run)
    session.commit()

    updated = scan_repository.prioritize_queued_scan_page(
        session,
        scan_run.id,
        scan_run.user_id,
        "https://example.com/pricing",
    )

    assert updated is not None
    assert updated.queued_page_urls == [
        "https://example.com/pricing",
        "https://example.com/about",
        "https://example.com/contact",
    ]


def test_update_scan_progress_preserves_user_priority_and_exclusions():
    session = _session()
    scan_run = _scan_run(
        queued_page_urls=["https://example.com/contact"],
        excluded_page_urls=["https://example.com/about"],
    )
    session.add(scan_run)
    session.commit()

    scan_repository.update_scan_progress(
        session,
        scan_run.id,
        current_page_url="https://example.com",
        queued_page_urls=[
            "https://example.com/about",
            "https://example.com/pricing",
            "https://example.com/contact",
        ],
        scanned_page_urls=["https://example.com"],
        skipped_page_urls=[],
    )

    session.refresh(scan_run)
    assert scan_run.current_page_url == "https://example.com"
    assert scan_run.queued_page_urls == [
        "https://example.com/contact",
        "https://example.com/pricing",
    ]
    assert scan_run.scanned_page_urls == ["https://example.com"]
    assert scan_run.pages_scanned == 1


def test_recover_stale_scan_requeues_until_max_attempts_then_fails():
    session = _session()
    stale_scan = _scan_run(
        worker_attempts=1,
        max_worker_attempts=2,
        heartbeat_at=datetime(2026, 1, 1),
    )
    exhausted_scan = _scan_run(
        worker_attempts=2,
        max_worker_attempts=2,
        heartbeat_at=datetime(2026, 1, 1),
    )
    session.add_all([stale_scan, exhausted_scan])
    session.commit()

    recovered_count = scan_repository.recover_stale_running_scans(
        session,
        stale_after_seconds=30,
    )

    session.refresh(stale_scan)
    session.refresh(exhausted_scan)
    assert recovered_count == 2
    assert stale_scan.status == "queued"
    assert stale_scan.last_error == "Scan worker stopped responding; job was requeued."
    assert exhausted_scan.status == "error"
    assert exhausted_scan.error_message == (
        "Scan worker stopped responding and retry attempts were exhausted."
    )


def test_saved_scan_queries_are_scoped_to_user():
    session = _session()
    owner_id = uuid4()
    other_user_id = uuid4()
    owner_scan = _scan_run(user_id=owner_id, status="complete")
    other_scan = _scan_run(user_id=other_user_id, status="complete")
    session.add_all([owner_scan, other_scan])
    session.commit()

    response = scan_repository.list_saved_scans(
        session,
        user_id=owner_id,
        limit=20,
        offset=0,
    )

    assert response.total == 1
    assert response.items[0].id == str(owner_scan.id)
    assert scan_repository.get_saved_scan(session, owner_scan.id, owner_id) is not None
    assert scan_repository.get_saved_scan(session, other_scan.id, owner_id) is None


def test_queue_controls_do_not_update_another_users_scan():
    session = _session()
    owner_id = uuid4()
    other_user_id = uuid4()
    other_scan = _scan_run(user_id=other_user_id)
    session.add(other_scan)
    session.commit()

    updated = scan_repository.remove_queued_scan_page(
        session,
        other_scan.id,
        owner_id,
        "https://example.com/about",
    )

    assert updated is None
