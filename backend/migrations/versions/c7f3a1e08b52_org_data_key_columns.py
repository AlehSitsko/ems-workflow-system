"""organization data key (wrapped DEK) columns

Revision ID: c7f3a1e08b52
Revises: b3e9c1f27a45
Create Date: 2026-08-14

"""
from alembic import op
import sqlalchemy as sa


revision = "c7f3a1e08b52"
down_revision = "b3e9c1f27a45"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("organization", schema=None) as batch_op:
        batch_op.add_column(sa.Column("data_key_wrapped", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("data_key_version", sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table("organization", schema=None) as batch_op:
        batch_op.drop_column("data_key_version")
        batch_op.drop_column("data_key_wrapped")
