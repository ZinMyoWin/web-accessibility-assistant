from __future__ import annotations

import uuid

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class McpAccountLink(Base):
    __tablename__ = "mcp_account_links"

    identity_key: Mapped[str] = mapped_column(sa.String(64), primary_key=True)
    oauth_issuer: Mapped[str] = mapped_column(sa.Text)
    oauth_subject: Mapped[str] = mapped_column(sa.Text)
    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), index=True
    )


class McpRateLimit(Base):
    __tablename__ = "mcp_rate_limits"

    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    window_start: Mapped[int] = mapped_column(sa.BigInteger)
    requests: Mapped[int] = mapped_column(sa.Integer)
