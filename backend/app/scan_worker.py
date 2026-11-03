from __future__ import annotations

import json
import logging
import os
import socket
from datetime import UTC, datetime
from time import perf_counter, sleep
from uuid import UUID

from sqlalchemy.orm import Session

from app.db import get_session_factory
import app.models.auth  # noqa: F401 - register users table for scan_run.user_id FK
from app.models.scan import ScanRun
from app.repositories.scan_repository import (
    claim_next_queued_scan,
    complete_running_scan,
    get_scan_queue_state,
    is_scan_cancel_requested,
    mark_scan_cancelled,
    recover_stale_running_scans,
    retry_or_fail_running_scan,
    update_scan_progress,
)
from app.services.axe_scanner import warm_axe_cache
from app.services.page_scanner import (
    BrowserSession,
    CrawlQueueControl,
    CrawlQueueState,
    ScanCancelled,
    ScanError,
    ScanOptions,
    scan_page,
)
from app.services.scan_options_resolver import DEFAULT_WCAG_STANDARD


logger = logging.getLogger("scan-worker")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

DEFAULT_POLL_INTERVAL_SECONDS = 0.5
DEFAULT_STALE_AFTER_SECONDS = 300
DEFAULT_BROWSER_MAX_JOBS = 250


def browser_reuse_enabled() -> bool:
    """Return whether the worker should keep one browser across scan jobs."""
    raw_value = os.getenv("SCAN_BROWSER_REUSE_ENABLED", "").strip().lower()
    return raw_value not in {"0", "false", "no", "off"}


def get_browser_max_jobs() -> int:
    """Return how many completed jobs a persistent browser serves before recycling."""
    raw_value = os.getenv("SCAN_BROWSER_MAX_JOBS", "").strip()
    if not raw_value:
        return DEFAULT_BROWSER_MAX_JOBS
    try:
        return max(int(raw_value), 1)
    except ValueError:
        return DEFAULT_BROWSER_MAX_JOBS


def _session_is_healthy(session) -> bool:
    checker = getattr(session, "is_usable", None) or getattr(session, "is_connected", None)
    if checker is None:
        return True
    try:
        return bool(checker())
    except Exception:
        return False


class WorkerBrowserManager:
    """Owns the process-level Playwright browser reused across scan jobs.

    The browser is created lazily, replaced when it disconnects or a job raises
    a browser-level error, proactively recycled after ``SCAN_BROWSER_MAX_JOBS``
    completed jobs (controls memory growth), and closed on worker shutdown.
    When ``SCAN_BROWSER_REUSE_ENABLED`` is false every job falls back to the old
    per-scan create/close behaviour.
    """

    def __init__(self, *, session_factory=None, enabled: bool | None = None, max_jobs: int | None = None) -> None:
        self._session_factory = session_factory or BrowserSession
        self._enabled = browser_reuse_enabled() if enabled is None else bool(enabled)
        self._max_jobs = get_browser_max_jobs() if max_jobs is None else max(int(max_jobs), 1)
        self._session = None
        self._jobs_completed = 0

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def jobs_completed(self) -> int:
        return self._jobs_completed

    def acquire(self):
        """Return a healthy session for the next job, or None when reuse is off."""
        if not self._enabled:
            return None
        if self._session is not None and (
            self._jobs_completed >= self._max_jobs
            or not _session_is_healthy(self._session)
        ):
            self.reset()
        if self._session is None:
            self._session = self._session_factory()
        return self._session

    def job_finished(self, *, browser_error: bool = False) -> None:
        """Record a finished job; recycle the browser when due or after a crash."""
        if not self._enabled:
            return
        self._jobs_completed += 1
        if browser_error or self._jobs_completed >= self._max_jobs:
            self.reset()

    def reset(self) -> None:
        session = self._session
        self._session = None
        self._jobs_completed = 0
        if session is not None:
            try:
                session.close()
            except Exception:
                logger.warning("failed to close reused browser session", exc_info=True)

    def close(self) -> None:
        self.reset()


def run_worker_loop(*, run_once: bool = False) -> None:
    poll_interval = _get_poll_interval_seconds()
    stale_after_seconds = _get_stale_after_seconds()
    worker_id = _get_worker_id()
    session_factory = get_session_factory()
    browser_manager = WorkerBrowserManager()

    if not warm_axe_cache():
        logger.warning("axe-core cache warm-up failed; the first scan may be slower")
    logger.info("scan worker started as %s", worker_id)
    try:
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
                _run_claimed_scan(db, scan_run, browser_manager=browser_manager)
            finally:
                db.close()

            if run_once:
                return
    finally:
        browser_manager.close()


def _run_claimed_scan(
    db: Session,
    scan_run: ScanRun,
    *,
    browser_manager: WorkerBrowserManager | None = None,
) -> None:
    browser_session = browser_manager.acquire() if browser_manager is not None else None
    browser_error = False
    started_at = perf_counter()
    try:
        if is_scan_cancel_requested(db, scan_run.id):
            mark_scan_cancelled(db, scan_run.id)
            logger.info("cancelled scan job %s before it started", scan_run.id)
            return
        options = _scan_options_from_payload(scan_run.scan_options or {})
        result = scan_page(
            scan_run.requested_url,
            options,
            _build_queue_control(db, scan_run.id),
            browser_session=browser_session,
        )
        result.scan_id = str(scan_run.id)
        _log_scan_timings(scan_run, result, (perf_counter() - started_at) * 1000)
        if is_scan_cancel_requested(db, scan_run.id):
            # Honour a cancel requested during the final page instead of
            # persisting a partial "complete" result.
            mark_scan_cancelled(db, scan_run.id)
            logger.info("cancelled scan job %s after the last page", scan_run.id)
            return
        complete_running_scan(
            db,
            scan_run.id,
            result=result,
            completed_at=datetime.fromisoformat(result.scanned_at),
        )
        logger.info("completed scan job %s", scan_run.id)
    except ScanCancelled:
        mark_scan_cancelled(db, scan_run.id)
        logger.info("cancelled scan job %s", scan_run.id)
    except ValueError as exc:
        _fail_scan(db, scan_run.id, str(exc))
    except ScanError as exc:
        _fail_scan(db, scan_run.id, exc.message)
    except Exception:
        browser_error = True
        db.rollback()
        logger.exception("unexpected scan worker failure for job %s", scan_run.id)
        _fail_scan(db, scan_run.id, "Unexpected error while running queued scan.")
    finally:
        if browser_manager is not None:
            browser_manager.job_finished(browser_error=browser_error)


def _log_scan_timings(scan_run: ScanRun, result, elapsed_ms: float) -> None:
    """Emit one structured JSON line with the scan's phase timings."""
    payload = {
        "scan_id": str(scan_run.id),
        "url": getattr(scan_run, "requested_url", None),
        "mode": getattr(result, "mode", None),
        "pages": getattr(result, "pages_scanned", 0),
        "total_ms": round(float(elapsed_ms), 1),
        "phases": getattr(result, "timings", None) or {},
    }
    logger.info("scan_timing %s", json.dumps(payload, default=str, sort_keys=True))


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
            issues=list(state.issues),
        )

    def refresh() -> tuple[list[str], set[str]]:
        return get_scan_queue_state(db, scan_id)

    def should_cancel() -> bool:
        return is_scan_cancel_requested(db, scan_id)

    return CrawlQueueControl(
        publish=publish,
        refresh=refresh,
        should_cancel=should_cancel,
    )


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
        wcag_standard=str(payload.get("wcag_standard") or DEFAULT_WCAG_STANDARD),
        include_best_practices=bool(payload.get("include_best_practices", True)),
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
