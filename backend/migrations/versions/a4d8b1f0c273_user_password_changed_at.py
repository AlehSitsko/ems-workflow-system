"""Add user.password_changed_at for optional password rotation

Records when each user's password was last set, so the app can force a change once
it passes Config.PASSWORD_MAX_AGE_DAYS. Existing rows are backfilled to the moment
of the migration, so the rotation clock starts now rather than treating every
current password as instantly expired.

Revision ID: a4d8b1f0c273
Revises: f1a9c3e57b02
"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "a4d8b1f0c273"
down_revision = "f1a9c3e57b02"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.add_column(sa.Column("password_changed_at", sa.String(length=50), nullable=True))

    now = datetime.now().isoformat(timespec="seconds")
    op.get_bind().execute(
        sa.text("UPDATE \"user\" SET password_changed_at = :now WHERE password_changed_at IS NULL"),
        {"now": now},
    )


def downgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_column("password_changed_at")
