"""Operational day closure (roadmap Phase 4)

Records that a human reviewed and signed off a day, together with a snapshot of
what it looked like at that moment. Past dates are already read-only, so this is
not a lock — it is the difference between assuming yesterday is finished and
knowing who checked it.

The counts are stored rather than recomputed: a later edit to a call must not
silently rewrite what the handoff said.

Revision ID: a4d92b6f318c
Revises: f3a81c05d7e2
"""
from alembic import op
import sqlalchemy as sa


revision = "a4d92b6f318c"
down_revision = "f3a81c05d7e2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "operational_day_closure",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("day", sa.String(length=20), nullable=False),
        sa.Column("closed_at", sa.String(length=50), nullable=False),
        sa.Column("closed_by", sa.Integer(), nullable=True),
        sa.Column("closed_by_name", sa.String(length=150), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("calls_total", sa.Integer(), nullable=True),
        sa.Column("calls_completed", sa.Integer(), nullable=True),
        sa.Column("calls_cancelled", sa.Integer(), nullable=True),
        sa.Column("calls_unfinished", sa.Integer(), nullable=True),
        sa.Column("units_total", sa.Integer(), nullable=True),
        sa.Column("units_unfinished", sa.Integer(), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["closed_by"], ["user.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    # unique=True matches the model (`unique=True, index=True` is one unique
    # index, not a constraint plus a plain index) — otherwise db check drifts.
    op.create_index("ix_operational_day_closure_day", "operational_day_closure", ["day"], unique=True)


def downgrade():
    op.drop_index("ix_operational_day_closure_day", "operational_day_closure")
    op.drop_table("operational_day_closure")
