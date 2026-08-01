"""Add user_session registry for per-device session revocation

Each login gets a row keyed by a random `sid` (also stored in the session cookie);
the auth guard validates the sid every request, so revoking a row signs that one
device out without disturbing the user's other sessions. Existing cookie sessions
predate this table and carry no sid, so they fail validation and are asked to sign
in again once — a one-time effect of the upgrade.

Revision ID: c5e1a83d6b47
Revises: b7c2e94f10a8
"""
from alembic import op
import sqlalchemy as sa


revision = "c5e1a83d6b47"
down_revision = "b7c2e94f10a8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_session",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sid", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.String(length=50), nullable=False),
        sa.Column("last_seen_at", sa.String(length=50), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
    )
    with op.batch_alter_table("user_session", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_user_session_sid"), ["sid"], unique=True)
        batch_op.create_index(batch_op.f("ix_user_session_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_user_session_revoked"), ["revoked"], unique=False)


def downgrade():
    with op.batch_alter_table("user_session", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_user_session_revoked"))
        batch_op.drop_index(batch_op.f("ix_user_session_user_id"))
        batch_op.drop_index(batch_op.f("ix_user_session_sid"))
    op.drop_table("user_session")
