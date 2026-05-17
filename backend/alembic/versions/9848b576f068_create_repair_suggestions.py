"""create repair suggestions

Revision ID: 9848b576f068
Revises: 9848b576f067
Create Date: 2026-05-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9848b576f068"
down_revision: Union[str, Sequence[str], None] = "9848b576f067"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "repair_suggestions",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("scan_run_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("group_key", sa.String(length=64), nullable=False),
        sa.Column("rule_id", sa.String(length=128), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("affected_count", sa.Integer(), nullable=False),
        sa.Column("affected_pages", sa.JSON(), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("impact", sa.Text(), nullable=False),
        sa.Column("recommended_fix", sa.Text(), nullable=False),
        sa.Column("before_code", sa.Text(), nullable=True),
        sa.Column("after_code", sa.Text(), nullable=True),
        sa.Column("confidence", sa.String(length=32), nullable=False),
        sa.Column("limitations", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["scan_run_id"], ["scan_runs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "group_key", name="uq_repair_suggestions_user_group"),
    )
    op.create_index("ix_repair_suggestions_scan_run_id", "repair_suggestions", ["scan_run_id"], unique=False)
    op.create_index("ix_repair_suggestions_user_id", "repair_suggestions", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_repair_suggestions_user_id", table_name="repair_suggestions")
    op.drop_index("ix_repair_suggestions_scan_run_id", table_name="repair_suggestions")
    op.drop_table("repair_suggestions")
