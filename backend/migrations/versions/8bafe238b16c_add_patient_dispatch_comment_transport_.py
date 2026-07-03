"""add patient dispatch comment, transport defaults, archive, alerts, contacts

Revision ID: 8bafe238b16c
Revises: 7bcd0413f789
Create Date: 2026-07-02 19:49:21.751696

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8bafe238b16c'
down_revision = '7bcd0413f789'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('patient_alert',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('patient_id', sa.Integer(), nullable=False),
    sa.Column('category', sa.String(length=30), nullable=False),
    sa.Column('severity', sa.String(length=20), nullable=False),
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('expires_at', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.String(length=50), nullable=True),
    sa.Column('created_by', sa.String(length=150), nullable=True),
    sa.Column('updated_at', sa.String(length=50), nullable=True),
    sa.Column('resolved_at', sa.String(length=50), nullable=True),
    sa.Column('resolved_by', sa.String(length=150), nullable=True),
    sa.Column('resolved_reason', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['patient_id'], ['patient.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('patient_contact',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('patient_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('relationship_label', sa.String(length=100), nullable=True),
    sa.Column('phone', sa.String(length=30), nullable=True),
    sa.Column('email', sa.String(length=150), nullable=True),
    sa.Column('is_primary', sa.Boolean(), nullable=True),
    sa.Column('can_authorize_transport', sa.Boolean(), nullable=True),
    sa.Column('preferred_contact_method', sa.String(length=30), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.String(length=50), nullable=True),
    sa.Column('updated_at', sa.String(length=50), nullable=True),
    sa.ForeignKeyConstraint(['patient_id'], ['patient.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.add_column(sa.Column('dispatch_comment', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('default_mobility_level', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('transport_instructions', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('access_instructions', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('preferred_language', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('requires_interpreter', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('is_sensitive', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('is_archived', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('archived_at', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('archived_by', sa.String(length=150), nullable=True))
        batch_op.add_column(sa.Column('archived_reason', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.drop_column('archived_reason')
        batch_op.drop_column('archived_by')
        batch_op.drop_column('archived_at')
        batch_op.drop_column('is_archived')
        batch_op.drop_column('is_sensitive')
        batch_op.drop_column('requires_interpreter')
        batch_op.drop_column('preferred_language')
        batch_op.drop_column('access_instructions')
        batch_op.drop_column('transport_instructions')
        batch_op.drop_column('default_mobility_level')
        batch_op.drop_column('dispatch_comment')

    op.drop_table('patient_contact')
    op.drop_table('patient_alert')
