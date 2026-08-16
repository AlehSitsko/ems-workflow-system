"""hash Employee.kiosk_pin (add kiosk_pin_hash, backfill, drop plaintext)

Revision ID: b2f8d4a16c93
Revises: a7c3e1f95d24
Create Date: 2026-08-16

The kiosk clock-in PIN was stored plaintext (and returned by the employee API).
Move to a one-way hash: add kiosk_pin_hash, hash any existing plaintext PIN into it,
then drop the plaintext column so it is gone from the database. Verification is
per-employee (no lookup-by-PIN), so no blind index is needed.
"""
from alembic import op
import sqlalchemy as sa


revision = "b2f8d4a16c93"
down_revision = "a7c3e1f95d24"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("employee", sa.Column("kiosk_pin_hash", sa.Text(), nullable=True))

    conn = op.get_bind()
    from werkzeug.security import generate_password_hash
    rows = conn.execute(
        sa.text("SELECT id, kiosk_pin FROM employee WHERE kiosk_pin IS NOT NULL")
    ).fetchall()
    for rid, pin in rows:
        pin = (pin or "").strip()
        if pin:
            conn.execute(
                sa.text("UPDATE employee SET kiosk_pin_hash = :h WHERE id = :id"),
                {"h": generate_password_hash(pin), "id": rid},
            )

    with op.batch_alter_table("employee", schema=None) as batch_op:
        batch_op.drop_column("kiosk_pin")


def downgrade():
    # The plaintext PIN cannot be recovered from the hash; the column returns empty.
    op.add_column("employee", sa.Column("kiosk_pin", sa.String(length=10), nullable=True))
    with op.batch_alter_table("employee", schema=None) as batch_op:
        batch_op.drop_column("kiosk_pin_hash")
