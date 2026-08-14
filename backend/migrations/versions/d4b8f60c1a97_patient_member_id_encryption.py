"""patient.member_id: widen for ciphertext + blind index

Revision ID: d4b8f60c1a97
Revises: c7f3a1e08b52
Create Date: 2026-08-14

Adds the storage for encrypting the sensitive Patient.member_id: widen the column
to Text (ciphertext is longer than the plaintext id) and add a blind-index column
for exact-match search. This migration only changes the schema — existing values
stay plaintext until the encrypt-existing-fields command runs (after a backup and
after org keys are provisioned).
"""
from alembic import op
import sqlalchemy as sa


revision = "d4b8f60c1a97"
down_revision = "c7f3a1e08b52"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("patient", schema=None) as batch_op:
        batch_op.alter_column("member_id", existing_type=sa.String(length=100),
                              type_=sa.Text(), existing_nullable=True)
        batch_op.add_column(sa.Column("member_id_bidx", sa.String(length=64), nullable=True))
        batch_op.create_index(batch_op.f("ix_patient_member_id_bidx"),
                              ["member_id_bidx"], unique=False)


def downgrade():
    with op.batch_alter_table("patient", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_patient_member_id_bidx"))
        batch_op.drop_column("member_id_bidx")
        batch_op.alter_column("member_id", existing_type=sa.Text(),
                              type_=sa.String(length=100), existing_nullable=True)
