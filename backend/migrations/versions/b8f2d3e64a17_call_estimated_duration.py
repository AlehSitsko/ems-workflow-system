"""Call.estimated_duration_minutes — for a planned trip end time

Optional per-call estimate; the app derives a planned end time (pickup_time +
this) so a scheduler sees when the unit is expected free.

Revision ID: b8f2d3e64a17
Revises: a7e3f1c92d48
"""
from alembic import op
import sqlalchemy as sa


revision = "b8f2d3e64a17"
down_revision = "a7e3f1c92d48"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("call", schema=None) as batch_op:
        batch_op.add_column(sa.Column("estimated_duration_minutes", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("call", schema=None) as batch_op:
        batch_op.drop_column("estimated_duration_minutes")
