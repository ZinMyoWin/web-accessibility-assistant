from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import urldefrag, urlparse
from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.scan import ScanIssueRecord, ScanRun
from app.schemas.history import (
    SavedScanListItem,
    SavedScanListResponse,
    SavedScanResponse,
)
from app.schemas.scan import ScanIssue, ScanPageResponse, ScanSummary


def save_completed_scan(
    session: Session,
    *,
    user_id: UUID,
    requested_url: str,
    result: ScanPageResponse,
    started_at: datetime,
    completed_at: datetime,
    mode: str = "single",
    page_limit: int | None = None,
) -> ScanRun:
    duration_seconds = _duration_seconds(started_at, completed_at)

    scan_run = ScanRun(
        user_id=user_id,
        requested_url=requested_url,
        final_url=result.url,
        status="complete",
        mode=mode,
        page_limit=page_limit,
        pages_scanned=result.pages_scanned,
        pages_skipped=result.pages_skipped,
        scanned_page_urls=result.scanned_page_urls,
        skipped_page_urls=result.skipped_page_urls,
        queued_page_urls=[],
        excluded_page_urls=[],
        current_page_url=None,
        started_at=started_at,
        completed_at=completed_at,
        duration_seconds=duration_seconds,
        total_issues=result.summary.total_issues,
        high_count=result.summary.high,
        medium_count=result.summary.medium,
        low_count=result.summary.low,
        score=calculate_scan_score(result),
        error_message=None,
    )
    session.add(scan_run)
    session.flush()

    session.add_all(
        [
            ScanIssueRecord(
                scan_run_id=scan_run.id,
                position=index,
                rule_id=issue.rule_id,
                severity=issue.severity,
                element=issue.element,
                message=issue.message,
                recommendation=issue.recommendation,
                line=issue.line,
                column=issue.column,
                source_hint=issue.source_hint,
                dom_path=issue.dom_path,
                text_preview=issue.text_preview,
                page_url=issue.page_url,
                wcag_criteria=issue.wcag_criteria,
                source=issue.source,
            )
            for index, issue in enumerate(result.issues, start=1)
        ]
    )
    session.commit()
    session.refresh(scan_run)
    return scan_run


def create_scan_job(
    session: Session,
    *,
    user_id: UUID,
    requested_url: str,
    started_at: datetime,
    mode: str = "single",
    page_limit: int | None = None,
    status: str = "running",
    scan_options: dict[str, object] | None = None,
) -> ScanRun:
    scan_run = ScanRun(
        user_id=user_id,
        requested_url=requested_url,
        final_url=None,
        status=status,
        mode=mode,
        page_limit=page_limit,
        pages_scanned=0,
        pages_skipped=0,
        scanned_page_urls=[],
        skipped_page_urls=[],
        queued_page_urls=[],
        excluded_page_urls=[],
        current_page_url=None,
        scan_options=scan_options,
        worker_attempts=0,
        max_worker_attempts=3,
        worker_id=None,
        locked_at=None,
        heartbeat_at=None,
        last_error=None,
        started_at=started_at,
        completed_at=None,
        duration_seconds=None,
        total_issues=0,
        high_count=0,
        medium_count=0,
        low_count=0,
        score=None,
        error_message=None,
    )
    session.add(scan_run)
    session.commit()
    session.refresh(scan_run)
    return scan_run


def claim_next_queued_scan(session: Session, *, worker_id: str | None = None) -> ScanRun | None:
    statement: Select[tuple[ScanRun]] = (
        select(ScanRun)
        .where(ScanRun.status == "queued")
        .order_by(ScanRun.started_at.asc())
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    scan_run = session.scalar(statement)
    if scan_run is None:
        return None

    now = datetime.now(UTC)
    scan_run.status = "running"
    scan_run.worker_attempts = (scan_run.worker_attempts or 0) + 1
    scan_run.worker_id = worker_id
    scan_run.locked_at = now
    scan_run.heartbeat_at = now
    scan_run.current_page_url = None
    scan_run.last_error = None
    session.commit()
    session.refresh(scan_run)
    return scan_run


def recover_stale_running_scans(
    session: Session,
    *,
    stale_after_seconds: int,
) -> int:
    stale_before = datetime.now(UTC) - timedelta(seconds=stale_after_seconds)
    statement = select(ScanRun).where(
        ScanRun.status == "running",
        or_(ScanRun.heartbeat_at.is_(None), ScanRun.heartbeat_at < stale_before),
    )

    recovered_count = 0
    for scan_run in session.scalars(statement).all():
        attempts = scan_run.worker_attempts or 0
        max_attempts = scan_run.max_worker_attempts or 3
        if attempts >= max_attempts:
            scan_run.status = "error"
            scan_run.completed_at = datetime.now(UTC)
            scan_run.duration_seconds = _duration_seconds(
                scan_run.started_at,
                scan_run.completed_at,
            )
            scan_run.error_message = (
                scan_run.last_error
                or "Scan worker stopped responding and retry attempts were exhausted."
            )
            scan_run.current_page_url = None
            scan_run.queued_page_urls = scan_run.queued_page_urls or []
        else:
            scan_run.status = "queued"
            scan_run.current_page_url = None
            scan_run.worker_id = None
            scan_run.locked_at = None
            scan_run.heartbeat_at = None
            scan_run.last_error = "Scan worker stopped responding; job was requeued."
        recovered_count += 1

    if recovered_count:
        session.commit()
    else:
        session.rollback()

    return recovered_count


def complete_running_scan(
    session: Session,
    scan_id: UUID,
    *,
    result: ScanPageResponse,
    completed_at: datetime,
) -> ScanRun | None:
    scan_run = session.get(ScanRun, scan_id)
    if scan_run is None:
        return None

    duration_seconds = _duration_seconds(scan_run.started_at, completed_at)

    scan_run.final_url = result.url
    scan_run.status = "complete"
    scan_run.pages_scanned = result.pages_scanned
    scan_run.pages_skipped = result.pages_skipped
    scan_run.scanned_page_urls = result.scanned_page_urls
    scan_run.skipped_page_urls = result.skipped_page_urls
    scan_run.queued_page_urls = []
    scan_run.current_page_url = None
    scan_run.completed_at = completed_at
    scan_run.duration_seconds = duration_seconds
    scan_run.total_issues = result.summary.total_issues
    scan_run.high_count = result.summary.high
    scan_run.medium_count = result.summary.medium
    scan_run.low_count = result.summary.low
    scan_run.score = calculate_scan_score(result)
    scan_run.error_message = None
    scan_run.last_error = None
    scan_run.worker_id = None
    scan_run.locked_at = None
    scan_run.heartbeat_at = None

    session.add_all(
        [
            ScanIssueRecord(
                scan_run_id=scan_run.id,
                position=index,
                rule_id=issue.rule_id,
                severity=issue.severity,
                element=issue.element,
                message=issue.message,
                recommendation=issue.recommendation,
                line=issue.line,
                column=issue.column,
                source_hint=issue.source_hint,
                dom_path=issue.dom_path,
                text_preview=issue.text_preview,
                page_url=issue.page_url,
                wcag_criteria=issue.wcag_criteria,
                source=issue.source,
            )
            for index, issue in enumerate(result.issues, start=1)
        ]
    )
    session.commit()
    session.refresh(scan_run)
    return scan_run


def fail_running_scan(
    session: Session,
    scan_id: UUID,
    *,
    error_message: str,
    completed_at: datetime,
) -> ScanRun | None:
    scan_run = session.get(ScanRun, scan_id)
    if scan_run is None:
        return None

    duration_seconds = _duration_seconds(scan_run.started_at, completed_at)

    scan_run.status = "error"
    scan_run.completed_at = completed_at
    scan_run.duration_seconds = duration_seconds
    scan_run.error_message = error_message
    scan_run.last_error = error_message
    scan_run.current_page_url = None
    scan_run.queued_page_urls = scan_run.queued_page_urls or []
    scan_run.worker_id = None
    scan_run.locked_at = None
    scan_run.heartbeat_at = None
    session.commit()
    session.refresh(scan_run)
    return scan_run


def retry_or_fail_running_scan(
    session: Session,
    scan_id: UUID,
    *,
    error_message: str,
    failed_at: datetime,
) -> ScanRun | None:
    scan_run = session.get(ScanRun, scan_id)
    if scan_run is None:
        return None

    attempts = scan_run.worker_attempts or 0
    max_attempts = scan_run.max_worker_attempts or 3
    scan_run.last_error = error_message
    scan_run.current_page_url = None
    scan_run.worker_id = None
    scan_run.locked_at = None
    scan_run.heartbeat_at = None

    if attempts < max_attempts:
        scan_run.status = "queued"
        scan_run.error_message = None
        scan_run.queued_page_urls = scan_run.queued_page_urls or []
    else:
        duration_seconds = _duration_seconds(scan_run.started_at, failed_at)
        scan_run.status = "error"
        scan_run.completed_at = failed_at
        scan_run.duration_seconds = duration_seconds
        scan_run.error_message = error_message

    session.commit()
    session.refresh(scan_run)
    return scan_run


def save_failed_scan(
    session: Session,
    *,
    user_id: UUID,
    requested_url: str,
    error_message: str,
    started_at: datetime,
    completed_at: datetime,
    mode: str = "single",
    page_limit: int | None = None,
) -> ScanRun:
    duration_seconds = _duration_seconds(started_at, completed_at)

    scan_run = ScanRun(
        user_id=user_id,
        requested_url=requested_url,
        final_url=None,
        status="error",
        mode=mode,
        page_limit=page_limit,
        pages_scanned=0,
        pages_skipped=0,
        scanned_page_urls=[],
        skipped_page_urls=[],
        queued_page_urls=[],
        excluded_page_urls=[],
        current_page_url=None,
        started_at=started_at,
        completed_at=completed_at,
        duration_seconds=duration_seconds,
        total_issues=0,
        high_count=0,
        medium_count=0,
        low_count=0,
        score=None,
        error_message=error_message,
        last_error=error_message,
    )
    session.add(scan_run)
    session.commit()
    session.refresh(scan_run)
    return scan_run


def list_saved_scans(
    session: Session,
    *,
    user_id: UUID,
    limit: int,
    offset: int,
    status: str | None = None,
    mode: str | None = None,
    q: str | None = None,
) -> SavedScanListResponse:
    base_query = select(ScanRun).where(ScanRun.user_id == user_id)

    if status:
        base_query = base_query.where(ScanRun.status == status)
    if mode:
        base_query = base_query.where(ScanRun.mode == mode)
    if q:
        search = f"%{q}%"
        base_query = base_query.where(
            or_(
                ScanRun.requested_url.ilike(search),
                ScanRun.final_url.ilike(search),
            )
        )

    total = session.scalar(select(func.count()).select_from(base_query.subquery())) or 0

    rows = session.scalars(
        base_query.order_by(ScanRun.started_at.desc()).offset(offset).limit(limit)
    ).all()

    return SavedScanListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[to_saved_scan_list_item(row) for row in rows],
    )


def get_saved_scan(session: Session, scan_id: UUID, user_id: UUID) -> ScanRun | None:
    statement: Select[tuple[ScanRun]] = (
        select(ScanRun)
        .options(selectinload(ScanRun.issues))
        .where(ScanRun.id == scan_id, ScanRun.user_id == user_id)
    )
    return session.scalar(statement)


def clear_saved_scans(session: Session, user_id: UUID) -> int:
    deleted_count = (
        session.query(ScanRun)
        .filter(ScanRun.user_id == user_id)
        .delete(synchronize_session=False)
    )
    session.commit()
    return int(deleted_count or 0)


def to_saved_scan_list_item(scan_run: ScanRun) -> SavedScanListItem:
    return SavedScanListItem(
        id=str(scan_run.id),
        url=scan_run.final_url or scan_run.requested_url,
        requested_url=scan_run.requested_url,
        final_url=scan_run.final_url,
        status=scan_run.status,
        mode=scan_run.mode,
        page_limit=scan_run.page_limit,
        pages_scanned=scan_run.pages_scanned,
        pages_skipped=scan_run.pages_skipped or 0,
        scanned_page_urls=scan_run.scanned_page_urls or _fallback_scanned_page_urls(scan_run),
        skipped_page_urls=scan_run.skipped_page_urls or [],
        queued_page_urls=scan_run.queued_page_urls or [],
        excluded_page_urls=scan_run.excluded_page_urls or [],
        current_page_url=scan_run.current_page_url,
        worker_attempts=scan_run.worker_attempts or 0,
        max_worker_attempts=scan_run.max_worker_attempts or 3,
        last_error=scan_run.last_error,
        started_at=scan_run.started_at.isoformat(),
        completed_at=scan_run.completed_at.isoformat() if scan_run.completed_at else None,
        duration_seconds=scan_run.duration_seconds,
        summary=ScanSummary(
            total_issues=scan_run.total_issues,
            high=scan_run.high_count,
            medium=scan_run.medium_count,
            low=scan_run.low_count,
        ),
        score=scan_run.score,
        error_message=scan_run.error_message,
    )


def update_scan_progress(
    session: Session,
    scan_id: UUID,
    *,
    current_page_url: str | None = None,
    queued_page_urls: list[str] | None = None,
    scanned_page_urls: list[str] | None = None,
    skipped_page_urls: list[str] | None = None,
) -> None:
    scan_run = session.get(ScanRun, scan_id)
    if scan_run is None:
        return
    session.refresh(scan_run)

    scan_run.current_page_url = current_page_url
    if queued_page_urls is not None:
        incoming_urls = _unique_urls(queued_page_urls)
        excluded_urls = {
            _normalize_crawl_memory_url(url) for url in (scan_run.excluded_page_urls or [])
        }
        incoming_urls = [
            url
            for url in incoming_urls
            if _normalize_crawl_memory_url(url) not in excluded_urls
        ]
        existing_urls = scan_run.queued_page_urls or []
        incoming_lookup = {_normalize_crawl_memory_url(url): url for url in incoming_urls}
        ordered_urls = [
            incoming_lookup[_normalize_crawl_memory_url(url)]
            for url in existing_urls
            if _normalize_crawl_memory_url(url) in incoming_lookup
        ]
        ordered_urls.extend(
            url
            for url in incoming_urls
            if _normalize_crawl_memory_url(url)
            not in {_normalize_crawl_memory_url(existing_url) for existing_url in ordered_urls}
        )
        scan_run.queued_page_urls = ordered_urls
    if scanned_page_urls is not None:
        scan_run.scanned_page_urls = _unique_urls(scanned_page_urls)
        scan_run.pages_scanned = len(scan_run.scanned_page_urls)
    if skipped_page_urls is not None:
        scan_run.skipped_page_urls = _unique_urls(skipped_page_urls)
        scan_run.pages_skipped = len(scan_run.skipped_page_urls)
    scan_run.heartbeat_at = datetime.now(UTC)
    session.commit()


def get_scan_queue_state(session: Session, scan_id: UUID) -> tuple[list[str], set[str]]:
    scan_run = session.get(ScanRun, scan_id)
    if scan_run is None:
        return [], set()
    session.refresh(scan_run)
    return scan_run.queued_page_urls or [], set(scan_run.excluded_page_urls or [])


def remove_queued_scan_page(
    session: Session,
    scan_id: UUID,
    user_id: UUID,
    url: str,
) -> ScanRun | None:
    scan_run = session.scalar(
        select(ScanRun).where(ScanRun.id == scan_id, ScanRun.user_id == user_id)
    )
    if scan_run is None:
        return None
    if scan_run.status not in {"queued", "running"}:
        return scan_run

    normalized_url = _normalize_crawl_memory_url(url)
    queued_urls = [
        existing_url
        for existing_url in (scan_run.queued_page_urls or [])
        if _normalize_crawl_memory_url(existing_url) != normalized_url
    ]
    excluded_urls = _unique_urls([*(scan_run.excluded_page_urls or []), normalized_url])
    scan_run.queued_page_urls = queued_urls
    scan_run.excluded_page_urls = excluded_urls
    scan_run.heartbeat_at = datetime.now(UTC)
    session.commit()
    session.refresh(scan_run)
    return scan_run


def prioritize_queued_scan_page(
    session: Session,
    scan_id: UUID,
    user_id: UUID,
    url: str,
) -> ScanRun | None:
    scan_run = session.scalar(
        select(ScanRun).where(ScanRun.id == scan_id, ScanRun.user_id == user_id)
    )
    if scan_run is None:
        return None
    if scan_run.status not in {"queued", "running"}:
        return scan_run

    normalized_url = _normalize_crawl_memory_url(url)
    queued_urls = scan_run.queued_page_urls or []
    matching_url = next(
        (
            existing_url
            for existing_url in queued_urls
            if _normalize_crawl_memory_url(existing_url) == normalized_url
        ),
        None,
    )
    if matching_url is None:
        return scan_run

    scan_run.queued_page_urls = [
        matching_url,
        *[
            existing_url
            for existing_url in queued_urls
            if _normalize_crawl_memory_url(existing_url) != normalized_url
        ],
    ]
    scan_run.heartbeat_at = datetime.now(UTC)
    session.commit()
    session.refresh(scan_run)
    return scan_run


def to_saved_scan_response(scan_run: ScanRun) -> SavedScanResponse:
    return SavedScanResponse(
        **to_saved_scan_list_item(scan_run).model_dump(),
        issues=[
            ScanIssue(
                rule_id=issue.rule_id,
                severity=issue.severity,
                element=issue.element,
                message=issue.message,
                recommendation=issue.recommendation,
                line=issue.line,
                column=issue.column,
                source_hint=issue.source_hint,
                dom_path=issue.dom_path,
                text_preview=issue.text_preview,
                page_url=issue.page_url,
                wcag_criteria=issue.wcag_criteria,
                source=issue.source,
            )
            for issue in scan_run.issues
        ],
    )


def calculate_scan_score(result: ScanPageResponse) -> int:
    pages_scanned = max(result.pages_scanned, 1)
    issue_penalty = (
        result.summary.high * 12
        + result.summary.medium * 4
        + result.summary.low
    )
    normalized_penalty = issue_penalty / pages_scanned
    return max(0, min(100, round(100 - normalized_penalty)))


def get_previously_scanned_page_urls_for_domain(
    session: Session,
    user_id: UUID,
    root_url: str,
) -> set[str]:
    root_host = _normalized_host(root_url)
    if not root_host:
        return set()

    statement: Select[tuple[ScanRun]] = (
        select(ScanRun)
        .options(selectinload(ScanRun.issues))
        .where(ScanRun.status == "complete", ScanRun.user_id == user_id)
    )

    scanned_urls: set[str] = set()
    for scan_run in session.scalars(statement).all():
        candidate_urls = [
            scan_run.requested_url,
            scan_run.final_url,
            *(scan_run.scanned_page_urls or []),
        ]
        candidate_urls.extend(issue.page_url for issue in scan_run.issues)

        for candidate_url in candidate_urls:
            if not candidate_url:
                continue
            if _normalized_host(candidate_url) != root_host:
                continue
            scanned_urls.add(_normalize_crawl_memory_url(candidate_url))

    return scanned_urls


def _normalized_host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def _normalize_crawl_memory_url(url: str) -> str:
    normalized, _ = urldefrag(url.strip())
    parsed = urlparse(normalized)
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    path = parsed.path.rstrip("/")
    if not path:
        path = "/"
    rebuilt = parsed._replace(scheme=scheme, netloc=netloc, path=path, fragment="")
    return rebuilt.geturl().rstrip("/") or rebuilt.geturl()


def _fallback_scanned_page_urls(scan_run: ScanRun) -> list[str]:
    urls = []
    for candidate in [scan_run.final_url, scan_run.requested_url]:
        if candidate and candidate not in urls:
            urls.append(candidate)
    for issue in scan_run.issues:
        if issue.page_url and issue.page_url not in urls:
            urls.append(issue.page_url)
    return urls


def _unique_urls(urls: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for url in urls:
        if not url or url in seen:
            continue
        seen.add(url)
        unique.append(url)
    return unique


def _duration_seconds(started_at: datetime, completed_at: datetime) -> int:
    if started_at.tzinfo is None and completed_at.tzinfo is not None:
        completed_at = completed_at.replace(tzinfo=None)
    elif started_at.tzinfo is not None and completed_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=None)
    return max(int((completed_at - started_at).total_seconds()), 0)
