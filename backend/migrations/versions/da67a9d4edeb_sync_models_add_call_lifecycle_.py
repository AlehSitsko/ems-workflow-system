"""sync models: add call lifecycle timestamps, patient_order, first_patient nullable

Revision ID: da67a9d4edeb
Revises: 5bc98c53acf8
Create Date: 2026-07-01 12:31:05.082320

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'da67a9d4edeb'
down_revision = '5bc98c53acf8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('call', schema=None) as batch_op:
        batch_op.add_column(sa.Column('dispatched_at', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('arrived_pickup_at', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('patient_loaded_at', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('arrived_dest_at', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('completed_at', sa.String(length=50), nullable=True))

    with op.batch_alter_table('daily_crew_unit', schema=None) as batch_op:
        batch_op.add_column(sa.Column('patient_order', sa.Text(), nullable=True))
        batch_op.alter_column('first_patient',
               existing_type=sa.VARCHAR(length=255),
               nullable=True)


def downgrade():
    with op.batch_alter_table('daily_crew_unit', schema=None) as batch_op:
        batch_op.alter_column('first_patient',
               existing_type=sa.VARCHAR(length=255),
               nullable=False)
        batch_op.drop_column('patient_order')

    with op.batch_alter_table('call', schema=None) as batch_op:
        batch_op.drop_column('completed_at')
        batch_op.drop_column('arrived_dest_at')
        batch_op.drop_column('patient_loaded_at')
        batch_op.drop_column('arrived_pickup_at')
        batch_op.drop_column('dispatched_at')
