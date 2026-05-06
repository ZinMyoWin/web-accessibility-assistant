"""add crawl memory preferences

Revision ID: 9848b576f062
Revises: 9848b576f061
Create Date: 2026-05-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9848b576f062"
down_revision: Union[str, Sequence[str], None] = "9848b576f061"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "app_preferences",
        sa.Column("skip_previously_scanned_pages", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "scan_runs",
        sa.Column("pages_skipped", sa.Integer(), nullable=True),
    )
    op.execute(
        "UPDATE app_preferences "
        "SET skip_previously_scanned_pages = TRUE "
        "WHERE skip_previously_scanned_pages IS NULL"
    )
    op.execute(
        "UPDATE scan_runs "
        "SET pages_skipped = 0 "
        "WHERE pages_skipped IS NULL"
    )


def downgrade() -> None:
    op.drop_column("scan_runs", "pages_skipped")
    op.drop_column("app_preferences", "skip_previously_scanned_pages")
