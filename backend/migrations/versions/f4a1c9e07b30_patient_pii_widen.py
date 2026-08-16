"""patient contact/facility PII: widen to Text for ciphertext

Revision ID: f4a1c9e07b30
Revises: e2c9a4f13b08
Create Date: 2026-08-16

phone, secondary_phone, facility_name, room_number, emergency_contact_name and
emergency_contact_phone join the encrypted-at-rest set, so they must hold ciphertext
(longer than the plaintext). Widen them to Text. address, notes, dispatch_comment,
transport_instructions, access_instructions and special_equipment_notes are already
Text. Schema-only — existing values stay plaintext until encrypt-existing-fields runs.
VARCHAR -> TEXT is a safe implicit cast on PostgreSQL.
"""
from alembic import op
import sqlalchemy as sa


revision = "f4a1c9e07b30"
down_revision = "e2c9a4f13b08"
branch_labels = None
depends_on = None

_WIDEN = [
    ("phone", 20),
    ("secondary_phone", 20),
    ("facility_name", 150),
    ("room_number", 50),
    ("emergency_contact_name", 150),
    ("emergency_contact_phone", 20),
]


def upgrade():
    with op.batch_alter_table("patient", schema=None) as batch_op:
        for name, length in _WIDEN:
            batch_op.alter_column(name, existing_type=sa.String(length=length),
                                  type_=sa.Text(), existing_nullable=True)


def downgrade():
    with op.batch_alter_table("patient", schema=None) as batch_op:
        for name, length in _WIDEN:
            batch_op.alter_column(name, existing_type=sa.Text(),
                                  type_=sa.String(length=length), existing_nullable=True)
