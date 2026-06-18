"""scope repair suggestions to scan runs

Revision ID: 9848b576f069
Revises: 9848b576f068
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "9848b576f069"
down_revision: Union[str, Sequence[str], None] = "9848b576f068"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "uq_repair_suggestions_user_group",
        "repair_suggestions",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_repair_suggestions_user_scan_group",
        "repair_suggestions",
        ["user_id", "scan_run_id", "group_key"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_repair_suggestions_user_scan_group",
        "repair_suggestions",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_repair_suggestions_user_group",
        "repair_suggestions",
        ["user_id", "group_key"],
    )
