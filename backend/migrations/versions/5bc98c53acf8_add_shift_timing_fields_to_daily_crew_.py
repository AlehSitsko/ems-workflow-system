"""add shift timing fields to daily_crew_unit

Revision ID: 5bc98c53acf8
Revises: f9e100716754
Create Date: 2026-06-29 19:11:00.000930

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5bc98c53acf8'
down_revision = 'f9e100716754'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('daily_crew_unit') as batch_op:
        batch_op.add_column(sa.Column('shift_duration_hours', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('shift_status', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('actual_end_time', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('delay_reason', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('daily_crew_unit') as batch_op:
        batch_op.drop_column('delay_reason')
        batch_op.drop_column('actual_end_time')
        batch_op.drop_column('shift_status')
        batch_op.drop_column('shift_duration_hours')
