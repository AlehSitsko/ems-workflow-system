"""CalendarEvent recurrence — simple repeating manual events

Adds `recurrence` (none/daily/weekly/monthly) and `recurrence_until`. The event
stays one row; the calendar expands it into occurrences within the window it
renders. Editing or deleting the row changes the whole series.

Revision ID: c1a5e9f34d82
Revises: c9a4e7b21f38
"""
from alembic import op
import sqlalchemy as sa


revision = "c1a5e9f34d82"
down_revision = "c9a4e7b21f38"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("calendar_event", schema=None) as batch_op:
        batch_op.add_column(sa.Column("recurrence", sa.String(length=20),
                                      nullable=False, server_default="none"))
        batch_op.add_column(sa.Column("recurrence_until", sa.String(length=20), nullable=True))


def downgrade():
    with op.batch_alter_table("calendar_event", schema=None) as batch_op:
        batch_op.drop_column("recurrence_until")
        batch_op.drop_column("recurrence")
