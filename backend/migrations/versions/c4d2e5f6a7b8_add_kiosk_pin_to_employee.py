"""add kiosk_pin to employee

Revision ID: c4d2e5f6a7b8
Revises: b3c1d2e4f5a6
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'c4d2e5f6a7b8'
down_revision = 'b3c1d2e4f5a6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('employee') as batch_op:
        batch_op.add_column(sa.Column('kiosk_pin', sa.String(10), nullable=True))


def downgrade():
    with op.batch_alter_table('employee') as batch_op:
        batch_op.drop_column('kiosk_pin')
