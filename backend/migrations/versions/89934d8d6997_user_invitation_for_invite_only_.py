"""user_invitation for invite-only onboarding

Revision ID: 89934d8d6997
Revises: e8a6c2f419d7
Create Date: 2026-08-13 19:18:48.353107

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '89934d8d6997'
down_revision = 'e8a6c2f419d7'
branch_labels = None
depends_on = None


def upgrade():
    # Only the new user_invitation table. Alembic also proposed adding org_id
    # foreign keys on audit_log and task, but those are the pre-existing dev-DB
    # drift documented in TODO (harmless on SQLite) — not part of this change —
    # so they are intentionally excluded to keep this migration minimal.
    op.create_table('user_invitation',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('org_id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('role', sa.String(length=50), nullable=False),
    sa.Column('display_name', sa.String(length=150), nullable=True),
    sa.Column('employee_id', sa.Integer(), nullable=True),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.String(length=50), nullable=False),
    sa.Column('expires_at', sa.String(length=50), nullable=False),
    sa.Column('accepted_at', sa.String(length=50), nullable=True),
    sa.Column('revoked_at', sa.String(length=50), nullable=True),
    sa.ForeignKeyConstraint(['employee_id'], ['employee.id'], ),
    sa.ForeignKeyConstraint(['org_id'], ['organization.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('user_invitation', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_user_invitation_token_hash'), ['token_hash'], unique=True)


def downgrade():
    with op.batch_alter_table('user_invitation', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_user_invitation_token_hash'))

    op.drop_table('user_invitation')
