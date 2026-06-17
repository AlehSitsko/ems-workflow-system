"""add pay_period table

Revision ID: e6f7a8b9c0d1
Revises: c4d2e5f6a7b8
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'e6f7a8b9c0d1'
down_revision = 'c4d2e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'pay_period',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.String(20), nullable=False),
        sa.Column('end_date', sa.String(20), nullable=False),
        sa.Column('period_type', sa.String(20), nullable=True),
        sa.Column('status', sa.String(20), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('created_at', sa.String(50), nullable=True),
        sa.Column('exported_at', sa.String(50), nullable=True),
        sa.Column('exported_to', sa.String(50), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('pay_period')
