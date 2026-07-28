"""Employment history — a per-employee timeline of hire / position / status events

The Employee row keeps the *current* position and status; this table records how
it got there (hires, position changes, terminations, rehires, notes). Append-only
by intent — corrections delete the wrong entry rather than editing history — so
there is nothing here to update in place.

Revision ID: c4d9f2a17b60
Revises: b8e17d3c94af
"""
from alembic import op
import sqlalchemy as sa


revision = "c4d9f2a17b60"
down_revision = "b8e17d3c94af"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "employment_event",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=30), nullable=False),
        sa.Column("effective_date", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=True),
        sa.Column("employment_type", sa.String(length=30), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_by_name", sa.String(length=150), nullable=True),
        sa.Column("created_at", sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employee.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("employment_event", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_employment_event_employee_id"), ["employee_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_employment_event_effective_date"), ["effective_date"], unique=False
        )


def downgrade():
    with op.batch_alter_table("employment_event", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_employment_event_effective_date"))
        batch_op.drop_index(batch_op.f("ix_employment_event_employee_id"))
    op.drop_table("employment_event")
