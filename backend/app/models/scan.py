from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ScanRun(Base):
    __tablename__ = "scan_runs"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requested_url: Mapped[str] = mapped_column(sa.Text)
    final_url: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    status: Mapped[str] = mapped_column(sa.String(32))
    mode: Mapped[str] = mapped_column(sa.String(32), default="single")
    page_limit: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    pages_scanned: Mapped[int] = mapped_column(sa.Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    duration_seconds: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    total_issues: Mapped[int] = mapped_column(sa.Integer, default=0)
    high_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    medium_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    low_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    score: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    issues: Mapped[list["ScanIssueRecord"]] = relationship(
        back_populates="scan_run",
        cascade="all, delete-orphan",
        order_by="ScanIssueRecord.position",
    )


class ScanIssueRecord(Base):
    __tablename__ = "scan_issues"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_run_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("scan_runs.id", ondelete="CASCADE")
    )
    position: Mapped[int] = mapped_column(sa.Integer)
    rule_id: Mapped[str] = mapped_column(sa.String(128))
    severity: Mapped[str] = mapped_column(sa.String(32))
    element: Mapped[str] = mapped_column(sa.Text)
    message: Mapped[str] = mapped_column(sa.Text)
    recommendation: Mapped[str] = mapped_column(sa.Text)
    line: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    column: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    source_hint: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    dom_path: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    text_preview: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    wcag_criteria: Mapped[list[str] | None] = mapped_column(sa.JSON, nullable=True)
    source: Mapped[str | None] = mapped_column(sa.String(32), nullable=True)

    scan_run: Mapped[ScanRun] = relationship(back_populates="issues")
