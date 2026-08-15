"""Activate tenant isolation: task.org_id, a default org, and backfill

Adds org_id to `task` (the one top-level tenant entity that lacked it), creates a
"Default Organization", and backfills every org-owned table's NULL org_id to it so
all existing data belongs to that one tenant. Idempotent: the default org is keyed
by its slug and reused on re-run.

Revision ID: d2f7a13e8c95
Revises: c1a5e9f34d82
"""
from alembic import op
import sqlalchemy as sa


revision = "d2f7a13e8c95"
down_revision = "c1a5e9f34d82"
branch_labels = None
depends_on = None

# Every table with an org_id column (task included, added below).
_ORG_TABLES = [
    "user", "employee", "vehicle", "daily_crew_unit", "crew_preset", "patient",
    "call", "notification_event", "pay_period", "employee_leave_request",
    "operational_day_closure", "recurring_trip", "calendar_event", "task",
]


def upgrade():
    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.add_column(sa.Column("org_id", sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f("ix_task_org_id"), ["org_id"], unique=False)

    conn = op.get_bind()

    # A single default organisation that owns all existing data.
    org_id = conn.execute(
        sa.text("SELECT id FROM organization WHERE slug = 'default'")
    ).scalar()
    if org_id is None:
        # `true`, not the integer 1: PostgreSQL rejects an integer for a boolean
        # column (SQLite would coerce it). SQLite 3.23+ accepts the TRUE keyword.
        conn.execute(sa.text(
            "INSERT INTO organization (name, slug, is_active, created_at) "
            "VALUES ('Default Organization', 'default', true, :now)"
        ), {"now": "2026-01-01T00:00:00"})
        org_id = conn.execute(
            sa.text("SELECT id FROM organization WHERE slug = 'default'")
        ).scalar()

    for table in _ORG_TABLES:
        conn.execute(sa.text(
            f"UPDATE {table} SET org_id = :org WHERE org_id IS NULL"
        ), {"org": org_id})


def downgrade():
    # Leave the org rows in place (harmless); just drop task.org_id.
    with op.batch_alter_table("task", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_task_org_id"))
        batch_op.drop_column("org_id")
