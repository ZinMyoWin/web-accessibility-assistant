"""persist issue screenshots

Revision ID: 9848b576f070
Revises: 9848b576f069
Create Date: 2026-05-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "9848b576f070"
down_revision: Union[str, Sequence[str], None] = "9848b576f069"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scan_issues", sa.Column("screenshot_data_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("scan_issues", "screenshot_data_url")
