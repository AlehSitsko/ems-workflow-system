"""employee_document.document_number: widen to Text for ciphertext

Revision ID: c8b1e6a34f27
Revises: b2f8d4a16c93
Create Date: 2026-08-16

document_number (a licence/certificate identifier) joins the encrypted-at-rest set,
so it must hold ciphertext (longer than the plaintext). Widen it to Text. Schema-only
— existing values stay plaintext until encrypt-existing-fields runs. VARCHAR -> TEXT
is a safe implicit cast on PostgreSQL.
"""
from alembic import op
import sqlalchemy as sa


revision = "c8b1e6a34f27"
down_revision = "b2f8d4a16c93"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("employee_document", schema=None) as batch_op:
        batch_op.alter_column("document_number", existing_type=sa.String(length=100),
                              type_=sa.Text(), existing_nullable=True)


def downgrade():
    with op.batch_alter_table("employee_document", schema=None) as batch_op:
        batch_op.alter_column("document_number", existing_type=sa.Text(),
                              type_=sa.String(length=100), existing_nullable=True)
