"""Split Employee.role into qualification + admin_role

`role` conflated a clinical/operational qualification (EMT, Paramedic, Driver,
Assist) with an organisational role (Supervisor, Manager, HR, ...). This adds
two authoritative columns and backfills them from the legacy single value; the
`role` column stays as a derived legacy mirror (maintained in app code).

The split mapping is inlined rather than imported from utils.taxonomy so this
migration is self-contained and won't drift if that module changes.

Revision ID: b7d3f8c1a2e4
Revises: f1b2c3d4e5a6
"""
from alembic import op
import sqlalchemy as sa


revision = "b7d3f8c1a2e4"
down_revision = "f1b2c3d4e5a6"
branch_labels = None
depends_on = None


# Frozen copies of the taxonomy split (see utils/taxonomy.py) so the backfill is
# reproducible regardless of later code changes.
_QUAL_ALIASES = {
    "driver": "driver_only", "driveronly": "driver_only",
    "emt": "emt", "emtb": "emt",
    "paramedic": "paramedic", "medic": "paramedic",
    "assist": "assist", "support": "assist",
}
_ADMIN_ROLES = {"supervisor", "manager", "admin", "dispatcher", "hr"}


def _alias_key(value):
    return "".join(ch for ch in str(value or "").strip().lower() if ch.isalnum())


def upgrade():
    with op.batch_alter_table("employee") as batch:
        batch.add_column(sa.Column("qualification", sa.String(length=30)))
        batch.add_column(sa.Column("admin_role", sa.String(length=30)))

    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, role FROM employee")).fetchall()
    for row in rows:
        key = _alias_key(row[1])
        if key in _ADMIN_ROLES:
            qualification, admin_role = None, key
        else:
            qualification, admin_role = _QUAL_ALIASES.get(key), None
        conn.execute(
            sa.text("UPDATE employee SET qualification = :q, admin_role = :a WHERE id = :id"),
            {"q": qualification, "a": admin_role, "id": row[0]},
        )


def downgrade():
    with op.batch_alter_table("employee") as batch:
        batch.drop_column("admin_role")
        batch.drop_column("qualification")
