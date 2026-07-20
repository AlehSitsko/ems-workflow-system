"""Reconcile the three foreign keys that existed only on the models

`flask db check` reported these as drift: the FK is declared in models.py — which
is what SQLAlchemy uses for relationships and joins — but was never created in
the database, so nothing stopped a row from pointing at a deleted user or a
vehicle that does not exist. `daily_crew_unit.vehicle_id` matters most now that
crew shifts pick a fleet vehicle and Fleet reporting is driven by that link.

  * audit_log.user_id            -> user.id
  * call.cancelled_by            -> user.id
  * daily_crew_unit.vehicle_id   -> vehicle.id

SQLite cannot ALTER a table to add a constraint, so each one goes through
batch_alter_table, which rebuilds the table and copies the rows. All three
columns stay NULLABLE: an audit entry outlives the user who caused it, and a
legacy shift may carry only a free-text truck number.

The constraints are named explicitly. An unnamed constraint in SQLite cannot be
dropped again, which would make the downgrade a lie.

Checked before writing this: the development database has zero orphan rows in
all three columns, so the rebuild cannot fail on existing data. A deployment
with orphans must clean them first — the migration deliberately does not delete
or blank anything on its own.

Revision ID: c9e4a7b21d38
Revises: b7d3f8c1a2e4
"""
from alembic import op
import sqlalchemy as sa


revision = "c9e4a7b21d38"
down_revision = "b7d3f8c1a2e4"
branch_labels = None
depends_on = None


# (table, constraint name, local column, target table, target column)
_FOREIGN_KEYS = [
    ("audit_log", "fk_audit_log_user_id_user", "user_id", "user", "id"),
    ("call", "fk_call_cancelled_by_user", "cancelled_by", "user", "id"),
    ("daily_crew_unit", "fk_daily_crew_unit_vehicle_id_vehicle", "vehicle_id", "vehicle", "id"),
]


def _orphan_count(bind, table, column, target_table, target_column):
    return bind.execute(sa.text(
        f'SELECT COUNT(*) FROM "{table}" t '
        f'WHERE t."{column}" IS NOT NULL AND NOT EXISTS ('
        f'  SELECT 1 FROM "{target_table}" r WHERE r."{target_column}" = t."{column}")'
    )).scalar()


def upgrade():
    bind = op.get_bind()

    # Fail with an explanation rather than an opaque IntegrityError mid-rebuild.
    for table, _name, column, target_table, target_column in _FOREIGN_KEYS:
        orphans = _orphan_count(bind, table, column, target_table, target_column)
        if orphans:
            raise RuntimeError(
                f"Cannot add the {table}.{column} foreign key: {orphans} row(s) reference "
                f"a missing {target_table}. Resolve those rows (set the column to NULL or "
                f"restore the {target_table}) and run the migration again."
            )

    for table, name, column, target_table, target_column in _FOREIGN_KEYS:
        with op.batch_alter_table(table) as batch_op:
            batch_op.create_foreign_key(name, target_table, [column], [target_column])


def downgrade():
    for table, name, _column, _target_table, _target_column in _FOREIGN_KEYS:
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_constraint(name, type_="foreignkey")
