"""add cancel fields to call

Revision ID: 1ecedad874dd
Revises: 2e6d88e66490
Create Date: 2026-06-18 14:45:34.973131

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1ecedad874dd'
down_revision = '2e6d88e66490'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('call', schema=None) as batch_op:
        batch_op.add_column(sa.Column('cancel_reason', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('cancelled_at', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('cancelled_by', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('call', schema=None) as batch_op:
        batch_op.drop_column('cancelled_by')
        batch_op.drop_column('cancelled_at')
        batch_op.drop_column('cancel_reason')
