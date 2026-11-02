"""default wcag standard to wcag21aa

Revision ID: 9848b576f074
Revises: 9848b576f073
Create Date: 2026-06-02 00:00:00.000000

The product targets WCAG 2.1 AA and keeps the previously hardcoded 2.1 rule
coverage by default. The preferences UI only offers 2.1/2.2 standards, and 2.0
is only ever a parse fallback, so rows still holding the old 'wcag2aa' default
are safely backfilled.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9848b576f074"
down_revision: Union[str, Sequence[str], None] = "9848b576f073"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "app_preferences",
        "wcag_standard",
        existing_type=sa.String(),
        existing_nullable=True,
        server_default="wcag21aa",
    )
    op.execute(
        "UPDATE app_preferences SET wcag_standard = 'wcag21aa' "
        "WHERE wcag_standard = 'wcag2aa'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE app_preferences SET wcag_standard = 'wcag2aa' "
        "WHERE wcag_standard = 'wcag21aa'"
    )
    # The column had no server default before revision 9848b576f074.
    op.alter_column(
        "app_preferences",
        "wcag_standard",
        existing_type=sa.String(),
        existing_nullable=True,
        server_default=None,
    )
