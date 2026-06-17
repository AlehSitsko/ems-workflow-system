"""add employee_document table

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'i0j1k2l3m4n5'
down_revision = 'h9i0j1k2l3m4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'employee_document',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employee.id'), nullable=False),
        sa.Column('doc_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('file_path', sa.String(500)),
        sa.Column('file_name', sa.String(255)),
        sa.Column('file_size', sa.Integer()),
        sa.Column('mime_type', sa.String(100)),
        sa.Column('document_number', sa.String(100)),
        sa.Column('issuing_body', sa.String(200)),
        sa.Column('issued_date', sa.String(20)),
        sa.Column('expiry_date', sa.String(20)),
        sa.Column('notes', sa.Text()),
        sa.Column('uploaded_by', sa.Integer(), sa.ForeignKey('user.id')),
        sa.Column('uploaded_at', sa.String(50)),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('user.id')),
        sa.Column('updated_at', sa.String(50)),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('employee_document')
