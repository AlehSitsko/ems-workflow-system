"""call.caller_phone: widen to Text for ciphertext

Revision ID: e5f2c8b41a09
Revises: d3e5b7a19f42
Create Date: 2026-08-16

caller_phone joins caller_note as an encrypted-at-rest field, so it must hold
ciphertext (longer than the plaintext); widen it to Text. caller_note is already
Text. Schema-only — existing values stay plaintext until encrypt-existing-fields
runs. VARCHAR -> TEXT is a safe implicit cast on PostgreSQL.
"""
from alembic import op
import sqlalchemy as sa


revision = "e5f2c8b41a09"
down_revision = "d3e5b7a19f42"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("call", schema=None) as batch_op:
        batch_op.alter_column("caller_phone", existing_type=sa.String(length=30),
                              type_=sa.Text(), existing_nullable=True)


def downgrade():
    with op.batch_alter_table("call", schema=None) as batch_op:
        batch_op.alter_column("caller_phone", existing_type=sa.Text(),
                              type_=sa.String(length=30), existing_nullable=True)
