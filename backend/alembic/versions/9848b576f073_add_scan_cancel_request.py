"""add scan cancel request flag

Revision ID: 9848b576f073
Revises: 9848b576f072
Create Date: 2026-06-01 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9848b576f073"
down_revision: Union[str, Sequence[str], None] = "9848b576f072"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scan_runs",
        sa.Column("cancel_requested_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scan_runs", "cancel_requested_at")
