"""add night crew fields to daily_crew_unit

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'f7a8b9c0d1e2'
down_revision = 'e6f7a8b9c0d1'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('daily_crew_unit') as batch_op:
        batch_op.add_column(sa.Column('end_time', sa.String(20), nullable=True))
        batch_op.add_column(sa.Column('end_date', sa.String(20), nullable=True))
        batch_op.add_column(sa.Column('shift_type', sa.String(10), nullable=True, server_default='day'))


def downgrade():
    with op.batch_alter_table('daily_crew_unit') as batch_op:
        batch_op.drop_column('shift_type')
        batch_op.drop_column('end_date')
        batch_op.drop_column('end_time')
