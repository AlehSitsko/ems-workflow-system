"""encrypt dob: widen + blind index (patient) + derived month-day (patient, employee)

Revision ID: d3e5b7a19f42
Revises: c8b1e6a34f27
Create Date: 2026-08-16

dob (patient + employee) becomes encrypted-at-rest (Text). Patient dob gains a blind
index (dob_bidx) for exact search / duplicate detection, replacing the plaintext dob
index. Both gain a non-identifying dob_month_day ("MM-DD"), which the birthday
calendar filters on. Backfill dob_month_day from the (still-plaintext) dob; encrypting
the dob value itself and populating dob_bidx is done afterwards by
`flask encrypt-existing-fields`. See docs/design/DOB_LASTNAME_ENCRYPTION.md.
"""
from alembic import op
import sqlalchemy as sa


revision = "d3e5b7a19f42"
down_revision = "c8b1e6a34f27"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("patient", schema=None) as batch:
        batch.drop_index("ix_patient_dob")   # plaintext-equality index; search moves to the blind index
        batch.alter_column("dob", existing_type=sa.String(length=20),
                           type_=sa.Text(), existing_nullable=True)
        batch.add_column(sa.Column("dob_bidx", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("dob_month_day", sa.String(length=5), nullable=True))
        batch.create_index("ix_patient_dob_bidx", ["dob_bidx"])
        batch.create_index("ix_patient_dob_month_day", ["dob_month_day"])

    with op.batch_alter_table("employee", schema=None) as batch:
        batch.alter_column("dob", existing_type=sa.String(length=20),
                           type_=sa.Text(), existing_nullable=True)
        batch.add_column(sa.Column("dob_month_day", sa.String(length=5), nullable=True))
        batch.create_index("ix_employee_dob_month_day", ["dob_month_day"])

    # Derive dob_month_day ("MM-DD") from the plaintext dob (YYYY-MM-DD → chars 6..10).
    conn = op.get_bind()
    for table in ("patient", "employee"):
        conn.execute(sa.text(
            f'UPDATE "{table}" SET dob_month_day = substr(dob, 6, 5) '
            "WHERE dob IS NOT NULL AND length(dob) >= 10"
        ))


def downgrade():
    with op.batch_alter_table("employee", schema=None) as batch:
        batch.drop_index("ix_employee_dob_month_day")
        batch.drop_column("dob_month_day")
        batch.alter_column("dob", existing_type=sa.Text(),
                           type_=sa.String(length=20), existing_nullable=True)

    with op.batch_alter_table("patient", schema=None) as batch:
        batch.drop_index("ix_patient_dob_month_day")
        batch.drop_index("ix_patient_dob_bidx")
        batch.drop_column("dob_month_day")
        batch.drop_column("dob_bidx")
        batch.alter_column("dob", existing_type=sa.Text(),
                           type_=sa.String(length=20), existing_nullable=True)
        batch.create_index("ix_patient_dob", ["dob"])
