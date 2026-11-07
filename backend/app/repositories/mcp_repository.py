from __future__ import annotations

import os
import time
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import case, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models.mcp import McpRateLimit
from app.models.scan import ScanIssueRecord, ScanRun


def dialect_insert(db: Session, model):
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        return pg_insert(model)
    if dialect == "sqlite":
        return sqlite_insert(model)
    raise HTTPException(status_code=503, detail="Unsupported MCP database.")


def enforce_mcp_rate_limit(db: Session, user_id: UUID) -> None:
    try:
        limit = int(os.getenv("MCP_RATE_LIMIT_PER_MINUTE", "60"))
        if not 1 <= limit <= 10000:
            raise ValueError("invalid limit")
    except ValueError:
        raise HTTPException(status_code=503, detail="MCP rate limit is not configured correctly.") from None
    now = int(time.time())
    window = now // 60 * 60
    stale = McpRateLimit.window_start != window
    statement = dialect_insert(db, McpRateLimit).values(
        user_id=user_id, window_start=window, requests=1
    ).on_conflict_do_update(
        index_elements=[McpRateLimit.user_id],
        set_={
            "window_start": window,
            "requests": case((stale, 1), else_=McpRateLimit.requests + 1),
        },
        where=or_(stale, McpRateLimit.requests < limit),
    ).returning(McpRateLimit.requests)
    accepted = db.scalar(statement)
    db.commit()
    if accepted is None:
        raise HTTPException(
            status_code=429,
            detail="Too many MCP requests.",
            headers={"Retry-After": str(60 - now % 60)},
        )


_SCAN_COLUMNS = (
    ScanRun.id,
    func.substr(ScanRun.requested_url, 1, 2048).label("requested_url"),
    func.substr(ScanRun.final_url, 1, 2048).label("final_url"), ScanRun.status,
    ScanRun.mode, ScanRun.pages_scanned, ScanRun.started_at, ScanRun.completed_at,
    ScanRun.score, ScanRun.total_issues, ScanRun.high_count, ScanRun.medium_count,
    ScanRun.low_count,
)


def _summary(row) -> dict[str, object]:
    return {
        "id": str(row.id),
        "url": (row.final_url or row.requested_url)[:2048],
        "status": row.status,
        "mode": row.mode,
        "pages_scanned": row.pages_scanned,
        "started_at": row.started_at.isoformat(),
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        "score": row.score,
        "summary": {
            "total_issues": row.total_issues, "high": row.high_count,
            "medium": row.medium_count, "low": row.low_count,
        },
    }


def list_mcp_scans(
    db: Session, user_id: UUID, *, limit: int, offset: int,
    status: str | None = None, q: str | None = None,
) -> dict[str, object]:
    filters = [ScanRun.user_id == user_id]
    if status:
        filters.append(ScanRun.status == status)
    if q:
        filters.append(or_(ScanRun.requested_url.ilike(f"%{q}%"), ScanRun.final_url.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(ScanRun).where(*filters)) or 0
    rows = db.execute(
        select(*_SCAN_COLUMNS).where(*filters)
        .order_by(ScanRun.started_at.desc(), ScanRun.id)
        .limit(limit).offset(offset)
    ).all()
    return {"total": total, "limit": limit, "offset": offset, "items": [_summary(row) for row in rows]}


def get_mcp_scan(db: Session, user_id: UUID, scan_id: UUID) -> dict[str, object]:
    row = db.execute(select(*_SCAN_COLUMNS).where(ScanRun.id == scan_id, ScanRun.user_id == user_id)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Scan not found.")
    return _summary(row)


def list_mcp_issues(
    db: Session, user_id: UUID, scan_id: UUID, *, limit: int,
    offset: int, severity: str | None = None,
) -> dict[str, object]:
    if db.scalar(select(ScanRun.id).where(ScanRun.id == scan_id, ScanRun.user_id == user_id)) is None:
        raise HTTPException(status_code=404, detail="Scan not found.")
    filters = [ScanIssueRecord.scan_run_id == scan_id]
    if severity:
        filters.append(ScanIssueRecord.severity == severity)
    total = db.scalar(select(func.count()).select_from(ScanIssueRecord).where(*filters)) or 0
    rows = db.execute(select(
        ScanIssueRecord.rule_id, ScanIssueRecord.severity,
        func.substr(ScanIssueRecord.element, 1, 2000).label("element"),
        func.substr(ScanIssueRecord.message, 1, 2000).label("message"),
        func.substr(ScanIssueRecord.recommendation, 1, 2000).label("recommendation"),
        func.substr(ScanIssueRecord.page_url, 1, 2048).label("page_url"),
        ScanIssueRecord.wcag_criteria,
    ).where(*filters).order_by(ScanIssueRecord.position, ScanIssueRecord.id).limit(limit).offset(offset)).all()
    return {
        "scan_id": str(scan_id), "total": total, "limit": limit, "offset": offset,
        "items": [{
            "rule_id": row.rule_id, "severity": row.severity,
            "element": row.element, "message": row.message,
            "recommendation": row.recommendation, "page_url": row.page_url,
            "wcag_criteria": [str(value)[:100] for value in (row.wcag_criteria or [])[:20]],
        } for row in rows],
    }
