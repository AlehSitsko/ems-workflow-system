"""call_note: append-only call communication log

Revision ID: f1a2b3c4d5e6
Revises: e5f2c8b41a09
Create Date: 2026-08-21

A per-call, append-only notes/communication log (who said/did what, when) for
dispatch handoffs. Org-scoped like the rest. Plain create_table — Postgres-safe.
"""
from alembic import op
import sqlalchemy as sa


revision = "f1a2b3c4d5e6"
down_revision = "e5f2c8b41a09"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "call_note",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("call_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("user_name", sa.String(length=150), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(length=50), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["call_id"], ["call.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_call_note_call_id", "call_note", ["call_id"])


def downgrade():
    op.drop_index("ix_call_note_call_id", table_name="call_note")
    op.drop_table("call_note")
