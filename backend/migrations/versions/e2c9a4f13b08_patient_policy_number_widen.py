"""patient.policy_number: widen to Text for ciphertext

Revision ID: e2c9a4f13b08
Revises: d4b8f60c1a97
Create Date: 2026-08-14

policy_number joins member_id and insurance_notes as an encrypted-at-rest field;
widen it to Text so it can hold ciphertext. insurance_notes is already Text.
Schema-only — existing values stay plaintext until encrypt-existing-fields runs.
"""
from alembic import op
import sqlalchemy as sa


revision = "e2c9a4f13b08"
down_revision = "d4b8f60c1a97"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("patient", schema=None) as batch_op:
        batch_op.alter_column("policy_number", existing_type=sa.String(length=100),
                              type_=sa.Text(), existing_nullable=True)


def downgrade():
    with op.batch_alter_table("patient", schema=None) as batch_op:
        batch_op.alter_column("policy_number", existing_type=sa.Text(),
                              type_=sa.String(length=100), existing_nullable=True)
