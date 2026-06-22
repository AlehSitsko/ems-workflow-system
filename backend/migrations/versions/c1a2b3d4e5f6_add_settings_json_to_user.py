"""add settings_json to user

Revision ID: c1a2b3d4e5f6
Revises: b503a3d060ac
Create Date: 2026-06-22 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'c1a2b3d4e5f6'
down_revision = 'b503a3d060ac'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('settings_json', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('settings_json')
