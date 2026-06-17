"""add employee_id to user

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'h9i0j1k2l3m4'
down_revision = 'g8h9i0j1k2l3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user') as batch_op:
        batch_op.add_column(sa.Column('employee_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_user_employee_id', 'employee', ['employee_id'], ['id'])


def downgrade():
    with op.batch_alter_table('user') as batch_op:
        batch_op.drop_constraint('fk_user_employee_id', type_='foreignkey')
        batch_op.drop_column('employee_id')
