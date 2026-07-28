"""CalendarEvent — manually created calendar entries with visibility scopes

Meetings, reminders, training days, time-off markers. Visibility is personal /
role / company; the API enforces who may create and see each.

Revision ID: c9a4e7b21f38
Revises: b8f2d3e64a17
"""
from alembic import op
import sqlalchemy as sa


revision = "c9a4e7b21f38"
down_revision = "b8f2d3e64a17"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "calendar_event",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("event_date", sa.String(length=20), nullable=False),
        sa.Column("start_time", sa.String(length=20), nullable=True),
        sa.Column("end_time", sa.String(length=20), nullable=True),
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("category", sa.String(length=30), nullable=True),
        sa.Column("visibility", sa.String(length=20), nullable=False, server_default="personal"),
        sa.Column("visible_to_role", sa.String(length=30), nullable=True),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("owner_name", sa.String(length=150), nullable=True),
        sa.Column("created_at", sa.String(length=50), nullable=True),
        sa.Column("updated_at", sa.String(length=50), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["owner_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("calendar_event", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_calendar_event_event_date"), ["event_date"], unique=False)
        batch_op.create_index(batch_op.f("ix_calendar_event_owner_user_id"), ["owner_user_id"], unique=False)


def downgrade():
    with op.batch_alter_table("calendar_event", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_calendar_event_owner_user_id"))
        batch_op.drop_index(batch_op.f("ix_calendar_event_event_date"))
    op.drop_table("calendar_event")
