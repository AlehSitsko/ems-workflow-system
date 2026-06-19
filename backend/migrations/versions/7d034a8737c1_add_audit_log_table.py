"""add audit_log table

Revision ID: 7d034a8737c1
Revises: 1ecedad874dd
Create Date: 2026-06-19 10:43:59.901473

"""
from alembic import op
import sqlalchemy as sa

revision = '7d034a8737c1'
down_revision = '1ecedad874dd'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'audit_log',
        sa.Column('id',           sa.Integer(),      nullable=False),
        sa.Column('timestamp',    sa.String(50),     nullable=False),
        sa.Column('user_id',      sa.Integer(),      nullable=True),
        sa.Column('user_name',    sa.String(150),    nullable=True),
        sa.Column('action',       sa.String(100),    nullable=False),
        sa.Column('entity_type',  sa.String(50),     nullable=True),
        sa.Column('entity_id',    sa.Integer(),      nullable=True),
        sa.Column('entity_label', sa.String(255),    nullable=True),
        sa.Column('details',      sa.Text(),         nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('audit_log')
