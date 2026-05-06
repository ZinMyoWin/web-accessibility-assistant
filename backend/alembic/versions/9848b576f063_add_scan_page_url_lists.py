"""add scan page url lists

Revision ID: 9848b576f063
Revises: 9848b576f062
Create Date: 2026-05-05 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9848b576f063"
down_revision: Union[str, Sequence[str], None] = "9848b576f062"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scan_runs", sa.Column("scanned_page_urls", sa.JSON(), nullable=True))
    op.add_column("scan_runs", sa.Column("skipped_page_urls", sa.JSON(), nullable=True))
    op.execute(
        "UPDATE scan_runs "
        "SET scanned_page_urls = json_build_array(COALESCE(final_url, requested_url)) "
        "WHERE scanned_page_urls IS NULL"
    )
    op.execute(
        "UPDATE scan_runs "
        "SET skipped_page_urls = '[]'::json "
        "WHERE skipped_page_urls IS NULL"
    )


def downgrade() -> None:
    op.drop_column("scan_runs", "skipped_page_urls")
    op.drop_column("scan_runs", "scanned_page_urls")
