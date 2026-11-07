"""Add explicitly linked MCP identities and shared per-user request limits.

Revision ID: 9848b576f076
Revises: 9848b576f075
"""
from alembic import op
import sqlalchemy as sa

revision = "9848b576f076"
down_revision = "9848b576f075"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mcp_account_links",
        sa.Column("identity_key", sa.String(64), primary_key=True),
        sa.Column("oauth_issuer", sa.Text(), nullable=False),
        sa.Column("oauth_subject", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    )
    op.create_index("ix_mcp_account_links_user_id", "mcp_account_links", ["user_id"])
    op.create_table(
        "mcp_rate_limits",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("window_start", sa.BigInteger(), nullable=False),
        sa.Column("requests", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("mcp_rate_limits")
    op.drop_index("ix_mcp_account_links_user_id", table_name="mcp_account_links")
    op.drop_table("mcp_account_links")
