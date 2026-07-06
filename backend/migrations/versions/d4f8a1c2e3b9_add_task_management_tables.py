"""Add task management tables (task, task_comment, task_activity_log)

Revision ID: d4f8a1c2e3b9
Revises: 8bafe238b16c
Create Date: 2026-07-06

New tables only — no batch_alter_table needed since nothing existing is altered.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4f8a1c2e3b9'
down_revision = '8bafe238b16c'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('task',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('task_type', sa.String(length=50), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('priority', sa.String(length=20), nullable=False),
    sa.Column('created_by_user_id', sa.Integer(), nullable=True),
    sa.Column('assigned_to_employee_id', sa.Integer(), nullable=True),
    sa.Column('assigned_by_user_id', sa.Integer(), nullable=True),
    sa.Column('related_module', sa.String(length=50), nullable=True),
    sa.Column('related_entity_id', sa.Integer(), nullable=True),
    sa.Column('due_date', sa.String(length=20), nullable=True),
    sa.Column('completed_at', sa.String(length=50), nullable=True),
    sa.Column('created_at', sa.String(length=50), nullable=False),
    sa.Column('updated_at', sa.String(length=50), nullable=False),
    sa.Column('is_archived', sa.Boolean(), nullable=True),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['user.id'], ),
    sa.ForeignKeyConstraint(['assigned_to_employee_id'], ['employee.id'], ),
    sa.ForeignKeyConstraint(['assigned_by_user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_task_status', 'task', ['status'])
    op.create_index('ix_task_assigned_to_employee_id', 'task', ['assigned_to_employee_id'])
    op.create_index('ix_task_due_date', 'task', ['due_date'])

    op.create_table('task_comment',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('task_id', sa.Integer(), nullable=False),
    sa.Column('author_user_id', sa.Integer(), nullable=True),
    sa.Column('author_name', sa.String(length=150), nullable=True),
    sa.Column('comment_text', sa.Text(), nullable=False),
    sa.Column('created_at', sa.String(length=50), nullable=False),
    sa.Column('updated_at', sa.String(length=50), nullable=False),
    sa.ForeignKeyConstraint(['task_id'], ['task.id'], ),
    sa.ForeignKeyConstraint(['author_user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_task_comment_task_id', 'task_comment', ['task_id'])

    op.create_table('task_activity_log',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('task_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('user_name', sa.String(length=150), nullable=True),
    sa.Column('action_type', sa.String(length=50), nullable=False),
    sa.Column('old_value', sa.Text(), nullable=True),
    sa.Column('new_value', sa.Text(), nullable=True),
    sa.Column('created_at', sa.String(length=50), nullable=False),
    sa.ForeignKeyConstraint(['task_id'], ['task.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_task_activity_log_task_id', 'task_activity_log', ['task_id'])


def downgrade():
    op.drop_index('ix_task_activity_log_task_id', 'task_activity_log')
    op.drop_table('task_activity_log')

    op.drop_index('ix_task_comment_task_id', 'task_comment')
    op.drop_table('task_comment')

    op.drop_index('ix_task_due_date', 'task')
    op.drop_index('ix_task_assigned_to_employee_id', 'task')
    op.drop_index('ix_task_status', 'task')
    op.drop_table('task')
