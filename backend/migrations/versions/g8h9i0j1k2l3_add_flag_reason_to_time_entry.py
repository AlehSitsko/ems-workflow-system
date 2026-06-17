"""add flag_reason to time_entry

Revision ID: g8h9i0j1k2l3
Revises: f7a8b9c0d1e2
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'g8h9i0j1k2l3'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('time_entry') as batch_op:
        batch_op.add_column(sa.Column('flag_reason', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('time_entry') as batch_op:
        batch_op.drop_column('flag_reason')
