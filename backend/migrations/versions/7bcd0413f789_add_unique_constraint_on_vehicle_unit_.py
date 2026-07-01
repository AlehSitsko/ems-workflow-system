"""add unique constraint on vehicle.unit_number

Revision ID: 7bcd0413f789
Revises: da67a9d4edeb
Create Date: 2026-07-01 12:35:48.624482

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7bcd0413f789'
down_revision = 'da67a9d4edeb'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('vehicle', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_vehicle_unit_number', ['unit_number'])


def downgrade():
    with op.batch_alter_table('vehicle', schema=None) as batch_op:
        batch_op.drop_constraint('uq_vehicle_unit_number', type_='unique')
