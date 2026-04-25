from __future__ import annotations

from datetime import datetime
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
    requested_url: str,
    result: ScanPageResponse,
    started_at: datetime,
    completed_at: datetime,
    mode: str = "single",
    page_limit: int | None = None,
) -> ScanRun:
    duration_seconds = max(int((completed_at - started_at).total_seconds()), 0)

    scan_run = ScanRun(
        requested_url=requested_url,
        final_url=result.url,
        status="complete",
        mode=mode,
        page_limit=page_limit,
        pages_scanned=1,
        started_at=started_at,
        completed_at=completed_at,
        duration_seconds=duration_seconds,
        total_issues=result.summary.total_issues,
        high_count=result.summary.high,
        medium_count=result.summary.medium,
        low_count=result.summary.low,
        score=None,
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
                wcag_criteria=issue.wcag_criteria,
                source=issue.source,
            )
            for index, issue in enumerate(result.issues, start=1)
        ]
    )
    session.commit()
    session.refresh(scan_run)
    return scan_run


def save_failed_scan(
    session: Session,
    *,
    requested_url: str,
    error_message: str,
    started_at: datetime,
    completed_at: datetime,
    mode: str = "single",
    page_limit: int | None = None,
) -> ScanRun:
    duration_seconds = max(int((completed_at - started_at).total_seconds()), 0)

    scan_run = ScanRun(
        requested_url=requested_url,
        final_url=None,
        status="error",
        mode=mode,
        page_limit=page_limit,
        pages_scanned=0,
        started_at=started_at,
        completed_at=completed_at,
        duration_seconds=duration_seconds,
        total_issues=0,
        high_count=0,
        medium_count=0,
        low_count=0,
        score=None,
        error_message=error_message,
    )
    session.add(scan_run)
    session.commit()
    session.refresh(scan_run)
    return scan_run


def list_saved_scans(
    session: Session,
    *,
    limit: int,
    offset: int,
    status: str | None = None,
    mode: str | None = None,
    q: str | None = None,
) -> SavedScanListResponse:
    base_query = select(ScanRun)

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


def get_saved_scan(session: Session, scan_id: UUID) -> ScanRun | None:
    statement: Select[tuple[ScanRun]] = (
        select(ScanRun)
        .options(selectinload(ScanRun.issues))
        .where(ScanRun.id == scan_id)
    )
    return session.scalar(statement)


def clear_saved_scans(session: Session) -> int:
    deleted_count = session.query(ScanRun).delete(synchronize_session=False)
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
                wcag_criteria=issue.wcag_criteria,
                source=issue.source,
            )
            for issue in scan_run.issues
        ],
    )
