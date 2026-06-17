"""add TimeEntry and EmployeePayConfig

Revision ID: b3c1d2e4f5a6
Revises: 4ad0f24009a3
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'b3c1d2e4f5a6'
down_revision = '4ad0f24009a3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'time_entry',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employee.id'), nullable=False),
        sa.Column('clock_in', sa.String(50), nullable=False),
        sa.Column('clock_out', sa.String(50), nullable=True),
        sa.Column('break_minutes', sa.Integer(), nullable=True),
        sa.Column('entry_type', sa.String(20), nullable=True),
        sa.Column('status', sa.String(20), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('approved_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('approved_at', sa.String(50), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'employee_pay_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employee.id'), nullable=False),
        sa.Column('pay_type', sa.String(20), nullable=True),
        sa.Column('hourly_rate', sa.Float(), nullable=True),
        sa.Column('overtime_rate', sa.Float(), nullable=True),
        sa.Column('overtime_after', sa.Integer(), nullable=True),
        sa.Column('effective_from', sa.String(20), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('employee_pay_config')
    op.drop_table('time_entry')
