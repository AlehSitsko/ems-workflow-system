"""Calendar events: participants join table + reminder lead time

Adds `calendar_event.reminder_minutes` (0 = no reminder) and the
`calendar_event_participant` table (event_id, employee_id, unique per pair), so a
manual event can invite named people who then see it and receive its invite +
reminder notifications. The participant table is a child of calendar_event — no
org_id, it inherits the tenant through its parent event.

Revision ID: f1a9c3e57b02
Revises: e3b7c94a12d6
"""
from alembic import op
import sqlalchemy as sa


revision = "f1a9c3e57b02"
down_revision = "e3b7c94a12d6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("calendar_event", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("reminder_minutes", sa.Integer(), nullable=False, server_default="0")
        )

    op.create_table(
        "calendar_event_participant",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["calendar_event.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["employee.id"]),
        sa.UniqueConstraint("event_id", "employee_id", name="uq_calendar_event_participant"),
    )
    with op.batch_alter_table("calendar_event_participant", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_calendar_event_participant_event_id"), ["event_id"], unique=False
        )


def downgrade():
    with op.batch_alter_table("calendar_event_participant", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_calendar_event_participant_event_id"))
    op.drop_table("calendar_event_participant")

    with op.batch_alter_table("calendar_event", schema=None) as batch_op:
        batch_op.drop_column("reminder_minutes")
