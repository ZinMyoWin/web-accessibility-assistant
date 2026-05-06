"""add scan worker queue state

Revision ID: 9848b576f065
Revises: 9848b576f064
Create Date: 2026-05-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9848b576f065"
down_revision: Union[str, Sequence[str], None] = "9848b576f064"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scan_runs", sa.Column("queued_page_urls", sa.JSON(), nullable=True))
    op.add_column("scan_runs", sa.Column("excluded_page_urls", sa.JSON(), nullable=True))
    op.add_column("scan_runs", sa.Column("current_page_url", sa.Text(), nullable=True))
    op.add_column(
        "scan_runs",
        sa.Column("worker_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "scan_runs",
        sa.Column("max_worker_attempts", sa.Integer(), nullable=False, server_default="3"),
    )
    op.add_column("scan_runs", sa.Column("worker_id", sa.String(length=128), nullable=True))
    op.add_column("scan_runs", sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("scan_runs", sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("scan_runs", sa.Column("last_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("scan_runs", "last_error")
    op.drop_column("scan_runs", "heartbeat_at")
    op.drop_column("scan_runs", "locked_at")
    op.drop_column("scan_runs", "worker_id")
    op.drop_column("scan_runs", "max_worker_attempts")
    op.drop_column("scan_runs", "worker_attempts")
    op.drop_column("scan_runs", "current_page_url")
    op.drop_column("scan_runs", "excluded_page_urls")
    op.drop_column("scan_runs", "queued_page_urls")
