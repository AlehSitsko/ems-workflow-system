"""Confirmation call state on Call (roadmap Phase 4)

Dispatchers ring patients the day before to confirm tomorrow's trips. Four
states are stored rather than a confirmed yes/no flag, because "nobody answered"
and "not called yet" are indistinguishable on a board yet mean opposite things
to whoever is working the call list.

Existing calls default to "not_called", which is the truth about them: nobody
has rung yet.

Revision ID: f3a81c05d7e2
Revises: e7c2a94f16bd
"""
from alembic import op
import sqlalchemy as sa


revision = "f3a81c05d7e2"
down_revision = "e7c2a94f16bd"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("call") as batch:
        batch.add_column(sa.Column("confirmation_status", sa.String(length=20),
                                   nullable=True, server_default="not_called"))
        batch.add_column(sa.Column("confirmation_note", sa.Text(), nullable=True))
        batch.add_column(sa.Column("confirmed_at", sa.String(length=50), nullable=True))
        batch.add_column(sa.Column("confirmed_by", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("confirmed_by_name", sa.String(length=150), nullable=True))
        # Declared on the model, so create it here too — the reconciliation
        # migration (c9e4a7b21d38) exists precisely because earlier columns
        # skipped this and left the schema drifting from the models.
        batch.create_foreign_key("fk_call_confirmed_by_user", "user", ["confirmed_by"], ["id"])

    # The confirmation list is filtered by this column every time a dispatcher
    # works tomorrow's calls.
    op.create_index("ix_call_confirmation_status", "call", ["confirmation_status"])


def downgrade():
    op.drop_index("ix_call_confirmation_status", "call")
    with op.batch_alter_table("call") as batch:
        batch.drop_constraint("fk_call_confirmed_by_user", type_="foreignkey")
        batch.drop_column("confirmed_by_name")
        batch.drop_column("confirmed_by")
        batch.drop_column("confirmed_at")
        batch.drop_column("confirmation_note")
        batch.drop_column("confirmation_status")
