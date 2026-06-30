"""add vehicle registry table

Revision ID: f9e100716754
Revises: a1b2c3d4e5f7
Create Date: 2026-06-29 18:59:02.528542

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f9e100716754'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('vehicle',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('unit_name', sa.String(length=50), nullable=False),
    sa.Column('unit_number', sa.String(length=50), nullable=False),
    sa.Column('unit_type', sa.String(length=50), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.String(length=50), nullable=True),
    sa.Column('updated_at', sa.String(length=50), nullable=True),
    sa.Column('org_id', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['org_id'], ['organization.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('vehicle')
