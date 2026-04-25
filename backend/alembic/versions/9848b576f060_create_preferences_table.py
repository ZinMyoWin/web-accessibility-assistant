"""create preferences table

Revision ID: 9848b576f060
Revises: 9848b576f059
Create Date: 2026-04-25 12:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "9848b576f060"
down_revision: Union[str, Sequence[str], None] = "9848b576f059"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ai_provider", sa.String(), nullable=True),
        sa.Column("encrypted_api_key", sa.Text(), nullable=True),
        sa.Column("ai_model", sa.String(), nullable=True),
        sa.Column("active_suggestion_provider", sa.String(), nullable=True),
        sa.Column("auto_generate_suggestions", sa.Boolean(), nullable=True),
        
        sa.Column("default_scan_mode", sa.String(), nullable=True),
        sa.Column("default_page_limit", sa.Integer(), nullable=True),
        sa.Column("crawl_depth", sa.Integer(), nullable=True),
        sa.Column("request_delay_ms", sa.Integer(), nullable=True),
        sa.Column("page_timeout_ms", sa.Integer(), nullable=True),
        sa.Column("ignored_url_patterns", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("stay_within_domain", sa.Boolean(), nullable=True),
        sa.Column("respect_robots_txt", sa.Boolean(), nullable=True),
        
        sa.Column("wcag_standard", sa.String(), nullable=True),
        sa.Column("include_best_practices", sa.Boolean(), nullable=True),
        sa.Column("fail_on_experimental", sa.Boolean(), nullable=True),
        
        sa.Column("email_notifications", sa.Boolean(), nullable=True),
        sa.Column("email_address", sa.String(), nullable=True),
        sa.Column("notify_on_scan_complete", sa.Boolean(), nullable=True),
        sa.Column("notify_on_scan_failed", sa.Boolean(), nullable=True),
        sa.Column("notify_on_high_severity", sa.Boolean(), nullable=True),
        sa.Column("weekly_summary", sa.Boolean(), nullable=True),
        
        sa.Column("theme", sa.String(), nullable=True),
        sa.Column("reduced_motion", sa.Boolean(), nullable=True),
        sa.Column("high_contrast", sa.Boolean(), nullable=True),
        sa.Column("density", sa.String(), nullable=True),
        
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("app_preferences")
