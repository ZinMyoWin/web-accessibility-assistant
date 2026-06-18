"""scope scans and preferences by user

Revision ID: 9848b576f067
Revises: 9848b576f066
Create Date: 2026-05-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9848b576f067"
down_revision: Union[str, Sequence[str], None] = "9848b576f066"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scan_runs", sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=True))
    op.create_index("ix_scan_runs_user_id", "scan_runs", ["user_id"], unique=False)
    op.create_foreign_key(
        "fk_scan_runs_user_id_users",
        "scan_runs",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.add_column("app_preferences", sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=True))
    op.create_index("ix_app_preferences_user_id", "app_preferences", ["user_id"], unique=True)
    op.create_foreign_key(
        "fk_app_preferences_user_id_users",
        "app_preferences",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_app_preferences_user_id_users", "app_preferences", type_="foreignkey")
    op.drop_index("ix_app_preferences_user_id", table_name="app_preferences")
    op.drop_column("app_preferences", "user_id")

    op.drop_constraint("fk_scan_runs_user_id_users", "scan_runs", type_="foreignkey")
    op.drop_index("ix_scan_runs_user_id", table_name="scan_runs")
    op.drop_column("scan_runs", "user_id")
