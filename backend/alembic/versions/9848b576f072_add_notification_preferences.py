"""add notification preferences

Revision ID: 9848b576f072
Revises: 9848b576f071
Create Date: 2026-06-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "9848b576f072"
down_revision: Union[str, Sequence[str], None] = "9848b576f071"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "app_preferences",
        sa.Column(
            "notify_score_threshold_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "app_preferences",
        sa.Column(
            "notify_score_threshold",
            sa.Integer(),
            nullable=False,
            server_default="70",
        ),
    )
    op.add_column(
        "app_preferences",
        sa.Column(
            "notify_severities",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[\"high\"]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("app_preferences", "notify_severities")
    op.drop_column("app_preferences", "notify_score_threshold")
    op.drop_column("app_preferences", "notify_score_threshold_enabled")
