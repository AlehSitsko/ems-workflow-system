"""Add password_history for refusing reuse of recent passwords

Records past password hashes per user so a rotation can reject reuse of the last N
(see Config.PASSWORD_HISTORY_DEPTH). Existing users are backfilled with their
current hash as a single history row (dated from password_changed_at when known),
so the check has data the moment the depth is raised above zero.

Revision ID: b7c2e94f10a8
Revises: a4d8b1f0c273
"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "b7c2e94f10a8"
down_revision = "a4d8b1f0c273"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "password_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
    )
    with op.batch_alter_table("password_history", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_password_history_user_id"), ["user_id"], unique=False)

    # Seed each existing user's current password as their first history entry.
    conn = op.get_bind()
    now = datetime.now().isoformat(timespec="seconds")
    rows = conn.execute(sa.text(
        'SELECT id, password_hash, password_changed_at FROM "user"'
    )).fetchall()
    for user_id, password_hash, changed_at in rows:
        conn.execute(
            sa.text(
                "INSERT INTO password_history (user_id, password_hash, created_at) "
                "VALUES (:uid, :ph, :ts)"
            ),
            {"uid": user_id, "ph": password_hash, "ts": changed_at or now},
        )


def downgrade():
    with op.batch_alter_table("password_history", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_password_history_user_id"))
    op.drop_table("password_history")
