"""add scan performance indexes

Revision ID: 9848b576f075
Revises: 9848b576f074
Create Date: 2026-11-03 00:00:00.000000

Composite indexes for the hot scan-queue and history query paths measured by
the performance baseline:

* ``ix_scan_runs_user_id_started_at`` -- saved-scan history pagination
  (``WHERE user_id = ? ORDER BY started_at DESC``) and the crawl-memory
  lookup (``WHERE user_id = ? AND status = 'complete'``).
* ``ix_scan_runs_status_started_at`` -- worker claim query
  (``WHERE status = 'queued' ORDER BY started_at LIMIT 1``) and metrics
  queue-depth counting.
* ``ix_scan_runs_status_heartbeat_at`` -- stale-running-scan recovery
  (``WHERE status = 'running' AND heartbeat_at < ?``).
* ``ix_scan_issues_scan_run_id_position`` -- ordered issue loads
  (``WHERE scan_run_id = ? ORDER BY position``); the plain
  ``ix_scan_issues_scan_run_id`` index from 9848b576f059 is kept.

All indexes are non-unique. A plain index on
``scan_issues.scan_run_id`` already exists, but the composite adds the
ordered column so SQLite/PostgreSQL can return issue pages already sorted.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "9848b576f075"
down_revision: Union[str, Sequence[str], None] = "9848b576f074"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_scan_runs_user_id_started_at",
        "scan_runs",
        ["user_id", "started_at"],
        unique=False,
    )
    op.create_index(
        "ix_scan_runs_status_started_at",
        "scan_runs",
        ["status", "started_at"],
        unique=False,
    )
    op.create_index(
        "ix_scan_runs_status_heartbeat_at",
        "scan_runs",
        ["status", "heartbeat_at"],
        unique=False,
    )
    op.create_index(
        "ix_scan_issues_scan_run_id_position",
        "scan_issues",
        ["scan_run_id", "position"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_scan_issues_scan_run_id_position",
        table_name="scan_issues",
    )
    op.drop_index(
        "ix_scan_runs_status_heartbeat_at",
        table_name="scan_runs",
    )
    op.drop_index(
        "ix_scan_runs_status_started_at",
        table_name="scan_runs",
    )
    op.drop_index(
        "ix_scan_runs_user_id_started_at",
        table_name="scan_runs",
    )
