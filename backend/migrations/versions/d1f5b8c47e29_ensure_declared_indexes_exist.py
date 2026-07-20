"""Recreate performance indexes that earlier table rebuilds dropped

SQLite has no ALTER for constraints, so a batch migration rebuilds the table:
copy, drop, rename. Any index on the original is lost unless the rebuild
recreates it, and several earlier migrations did not. The development database
ended up missing six indexes that `a1b2c3d4e5f7_add_performance_indexes` and
`d4f8a1c2e3b9_add_task_management_tables` had created — silently, since a
missing index changes no result, only the time it takes to get it.

This migration is a repair, so it is idempotent: it creates only what the
database is actually missing and does nothing on a database built cleanly from
the full migration chain. Its downgrade is deliberately empty — these indexes
belong to earlier migrations, and dropping them here would undo work this
revision never did.

Revision ID: d1f5b8c47e29
Revises: c9e4a7b21d38
"""
from alembic import op
import sqlalchemy as sa


revision = "d1f5b8c47e29"
down_revision = "c9e4a7b21d38"
branch_labels = None
depends_on = None


# Every index declared on the models, as (name, table, columns). Frozen here so
# the repair is reproducible even if the models change later.
_INDEXES = [
    ("ix_audit_log_entity_type", "audit_log", ["entity_type"]),
    ("ix_audit_log_timestamp", "audit_log", ["timestamp"]),
    ("ix_call_patient_id", "call", ["patient_id"]),
    ("ix_call_status", "call", ["status"]),
    ("ix_call_trip_date", "call", ["trip_date"]),
    ("ix_call_assignment_call_id", "call_assignment", ["call_id"]),
    ("ix_call_assignment_is_active", "call_assignment", ["is_active"]),
    ("ix_call_assignment_unit_id", "call_assignment", ["unit_id"]),
    ("ix_daily_crew_unit_shift_date", "daily_crew_unit", ["shift_date"]),
    ("ix_employee_document_employee_id", "employee_document", ["employee_id"]),
    ("ix_employee_document_expiry_date", "employee_document", ["expiry_date"]),
    ("ix_notification_event_created_at", "notification_event", ["created_at"]),
    ("ix_patient_dob", "patient", ["dob"]),
    ("ix_patient_last_name", "patient", ["last_name"]),
    ("ix_task_assigned_to_employee_id", "task", ["assigned_to_employee_id"]),
    ("ix_task_due_date", "task", ["due_date"]),
    ("ix_task_status", "task", ["status"]),
    ("ix_task_activity_log_task_id", "task_activity_log", ["task_id"]),
    ("ix_task_comment_task_id", "task_comment", ["task_id"]),
    ("ix_time_entry_employee_id", "time_entry", ["employee_id"]),
    ("ix_user_notification_is_read", "user_notification", ["is_read"]),
    ("ix_user_notification_user_id", "user_notification", ["user_id"]),
    ("ix_vehicle_maintenance_record_scheduled_date", "vehicle_maintenance_record", ["scheduled_date"]),
    ("ix_vehicle_maintenance_record_vehicle_id", "vehicle_maintenance_record", ["vehicle_id"]),
    ("ix_vehicle_odometer_entry_vehicle_id", "vehicle_odometer_entry", ["vehicle_id"]),
]


def upgrade():
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    for name, table, columns in _INDEXES:
        if table not in tables:
            continue
        existing = {idx["name"] for idx in inspector.get_indexes(table)}
        if name not in existing:
            op.create_index(name, table, columns)


def downgrade():
    # Intentionally empty: see the module docstring.
    pass
