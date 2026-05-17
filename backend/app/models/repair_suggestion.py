from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RepairSuggestion(Base):
    __tablename__ = "repair_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    scan_run_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("scan_runs.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    group_key: Mapped[str] = mapped_column(sa.String(64))
    rule_id: Mapped[str] = mapped_column(sa.String(128))
    title: Mapped[str] = mapped_column(sa.Text)
    severity: Mapped[str] = mapped_column(sa.String(32))
    affected_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    affected_pages: Mapped[list[str]] = mapped_column(sa.JSON, default=list)
    provider: Mapped[str] = mapped_column(sa.String(64))
    model: Mapped[str] = mapped_column(sa.String(128))
    explanation: Mapped[str] = mapped_column(sa.Text)
    impact: Mapped[str] = mapped_column(sa.Text)
    recommended_fix: Mapped[str] = mapped_column(sa.Text)
    before_code: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    after_code: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    confidence: Mapped[str] = mapped_column(sa.String(32), default="medium")
    limitations: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "user_id",
            "group_key",
            name="uq_repair_suggestions_user_group",
        ),
    )
