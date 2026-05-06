"""add page_url to scan issues

Revision ID: 9848b576f061
Revises: 9848b576f060
Create Date: 2026-04-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9848b576f061"
down_revision: Union[str, Sequence[str], None] = "9848b576f060"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scan_issues", sa.Column("page_url", sa.Text(), nullable=True))
    op.execute(
        "UPDATE app_preferences "
        "SET default_page_limit = 5 "
        "WHERE default_page_limit IS NULL OR default_page_limit > 5"
    )


def downgrade() -> None:
    op.execute("UPDATE app_preferences SET default_page_limit = 20 WHERE default_page_limit = 5")
    op.drop_column("scan_issues", "page_url")
