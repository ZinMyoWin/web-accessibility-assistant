from __future__ import annotations

import logging
import os
import socket
from datetime import UTC, datetime
from time import sleep
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import get_session_factory
import app.models.auth  # noqa: F401 - register users table for scan_run.user_id FK
from app.models.scan import ScanRun
from app.repositories.scan_repository import (
    claim_next_queued_scan,
    complete_running_scan,
    get_scan_queue_state,
    recover_stale_running_scans,
    retry_or_fail_running_scan,
    update_scan_progress,
)
from app.services.page_scanner import (
    CrawlQueueControl,
    CrawlQueueState,
    ScanError,
    ScanOptions,
    scan_page,
)


logger = logging.getLogger("scan-worker")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

DEFAULT_POLL_INTERVAL_SECONDS = 2.0
DEFAULT_STALE_AFTER_SECONDS = 300


def run_worker_loop(*, run_once: bool = False) -> None:
    poll_interval = _get_poll_interval_seconds()
    stale_after_seconds = _get_stale_after_seconds()
    worker_id = _get_worker_id()
    session_factory = get_session_factory()

    logger.info("scan worker started as %s", worker_id)
    while True:
        db = session_factory()
        try:
            recovered = recover_stale_running_scans(
                db,
                stale_after_seconds=stale_after_seconds,
            )
            if recovered:
                logger.info("recovered %s stale scan job(s)", recovered)

            scan_run = claim_next_queued_scan(db, worker_id=worker_id)
            if scan_run is None:
                if run_once:
                    return
                sleep(poll_interval)
                continue

            logger.info("claimed scan job %s", scan_run.id)
            _run_claimed_scan(db, scan_run)
        finally:
            db.close()

        if run_once:
            return


def _run_claimed_scan(db: Session, scan_run: ScanRun) -> None:
    try:
        options = _scan_options_from_payload(scan_run.scan_options or {})
        result = scan_page(
            scan_run.requested_url,
            options,
            _build_queue_control(db, scan_run.id),
        )
        result.scan_id = str(scan_run.id)
        complete_running_scan(
            db,
            scan_run.id,
            result=result,
            completed_at=datetime.fromisoformat(result.scanned_at),
        )
        logger.info("completed scan job %s", scan_run.id)
    except ValueError as exc:
        _fail_scan(db, scan_run.id, str(exc))
    except ScanError as exc:
        _fail_scan(db, scan_run.id, exc.message)
    except Exception:
        db.rollback()
        logger.exception("unexpected scan worker failure for job %s", scan_run.id)
        _fail_scan(db, scan_run.id, "Unexpected error while running queued scan.")


def _fail_scan(db: Session, scan_id: UUID, message: str) -> None:
    scan_run = retry_or_fail_running_scan(
        db,
        scan_id,
        error_message=message,
        failed_at=datetime.now(UTC),
    )
    if scan_run and scan_run.status == "queued":
        logger.info("requeued scan job %s after failure: %s", scan_id, message)
    else:
        logger.info("failed scan job %s", scan_id)


def _build_queue_control(db: Session, scan_id: UUID) -> CrawlQueueControl:
    def publish(state: CrawlQueueState) -> None:
        update_scan_progress(
            db,
            scan_id,
            current_page_url=state.current_page_url,
            queued_page_urls=state.queued_page_urls,
            scanned_page_urls=state.scanned_page_urls,
            skipped_page_urls=state.skipped_page_urls,
        )

    def refresh() -> tuple[list[str], set[str]]:
        return get_scan_queue_state(db, scan_id)

    return CrawlQueueControl(publish=publish, refresh=refresh)


def _scan_options_from_payload(payload: dict[str, object]) -> ScanOptions:
    return ScanOptions(
        mode=str(payload.get("mode") or "multi"),
        page_limit=int(payload.get("page_limit") or 5),
        crawl_depth=int(payload.get("crawl_depth") or 3),
        request_delay_ms=int(payload.get("request_delay_ms") or 250),
        page_timeout_ms=int(payload.get("page_timeout_ms") or 15000),
        ignored_url_patterns=tuple(_string_list(payload.get("ignored_url_patterns"))),
        stay_within_domain=bool(payload.get("stay_within_domain", True)),
        respect_robots_txt=bool(payload.get("respect_robots_txt", True)),
        skip_previously_scanned_pages=bool(
            payload.get("skip_previously_scanned_pages", True)
        ),
        previously_scanned_urls=frozenset(
            _string_list(payload.get("previously_scanned_urls"))
        ),
        run_browser_analysis_for_multi=True,
    )


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _get_poll_interval_seconds() -> float:
    raw_value = os.getenv("SCAN_WORKER_POLL_INTERVAL_SECONDS", "").strip()
    if not raw_value:
        return DEFAULT_POLL_INTERVAL_SECONDS
    try:
        return max(float(raw_value), 0.25)
    except ValueError:
        return DEFAULT_POLL_INTERVAL_SECONDS


def _get_stale_after_seconds() -> int:
    raw_value = os.getenv("SCAN_WORKER_STALE_AFTER_SECONDS", "").strip()
    if not raw_value:
        return DEFAULT_STALE_AFTER_SECONDS
    try:
        return max(int(raw_value), 30)
    except ValueError:
        return DEFAULT_STALE_AFTER_SECONDS


def _get_worker_id() -> str:
    explicit_id = os.getenv("SCAN_WORKER_ID", "").strip()
    if explicit_id:
        return explicit_id
    return f"{socket.gethostname()}:{os.getpid()}"


if __name__ == "__main__":
    run_worker_loop()
