"""employee contact PII: widen phone/email to Text for ciphertext

Revision ID: a7c3e1f95d24
Revises: f4a1c9e07b30
Create Date: 2026-08-16

Employee.phone and Employee.email join the encrypted-at-rest set, so they must hold
ciphertext (longer than the plaintext). Widen them to Text. Schema-only — existing
values stay plaintext until encrypt-existing-fields runs. VARCHAR -> TEXT is a safe
implicit cast on PostgreSQL.
"""
from alembic import op
import sqlalchemy as sa


revision = "a7c3e1f95d24"
down_revision = "f4a1c9e07b30"
branch_labels = None
depends_on = None

_WIDEN = [("phone", 30), ("email", 150)]


def upgrade():
    with op.batch_alter_table("employee", schema=None) as batch_op:
        for name, length in _WIDEN:
            batch_op.alter_column(name, existing_type=sa.String(length=length),
                                  type_=sa.Text(), existing_nullable=True)


def downgrade():
    with op.batch_alter_table("employee", schema=None) as batch_op:
        for name, length in _WIDEN:
            batch_op.alter_column(name, existing_type=sa.Text(),
                                  type_=sa.String(length=length), existing_nullable=True)
