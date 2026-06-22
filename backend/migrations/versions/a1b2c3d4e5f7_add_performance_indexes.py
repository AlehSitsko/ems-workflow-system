"""Add performance indexes to all hot query columns

Revision ID: a1b2c3d4e5f7
Revises: c1a2b3d4e5f6
Create Date: 2026-06-22

Covers every column identified by stress testing as a full-table-scan hotspot.
"""

from alembic import op

revision = 'a1b2c3d4e5f7'
down_revision = 'c1a2b3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    # call — dispatch board queries filter by trip_date, status, patient_id
    op.create_index('ix_call_trip_date',   'call', ['trip_date'])
    op.create_index('ix_call_status',      'call', ['status'])
    op.create_index('ix_call_patient_id',  'call', ['patient_id'])

    # patient — search by last_name (ilike) and dob equality
    op.create_index('ix_patient_last_name', 'patient', ['last_name'])
    op.create_index('ix_patient_dob',       'patient', ['dob'])

    # call_assignment — board query filters by unit_id + is_active; call_id for lookups
    op.create_index('ix_call_assignment_unit_id',  'call_assignment', ['unit_id'])
    op.create_index('ix_call_assignment_call_id',  'call_assignment', ['call_id'])
    op.create_index('ix_call_assignment_is_active', 'call_assignment', ['is_active'])

    # daily_crew_unit — every board load filters by shift_date
    op.create_index('ix_daily_crew_unit_shift_date', 'daily_crew_unit', ['shift_date'])

    # notification_event — polled every 10s filtered by created_at window
    op.create_index('ix_notification_event_created_at', 'notification_event', ['created_at'])

    # user_notification — polled per user_id + is_read filter
    op.create_index('ix_user_notification_user_id', 'user_notification', ['user_id'])
    op.create_index('ix_user_notification_is_read', 'user_notification', ['is_read'])

    # time_entry — payroll and HR views filter by employee_id
    op.create_index('ix_time_entry_employee_id', 'time_entry', ['employee_id'])

    # audit_log — filtered by entity_type and timestamp in viewer
    op.create_index('ix_audit_log_entity_type', 'audit_log', ['entity_type'])
    op.create_index('ix_audit_log_timestamp',   'audit_log', ['timestamp'])

    # employee_document — compliance grid and per-employee queries
    op.create_index('ix_employee_document_employee_id', 'employee_document', ['employee_id'])
    op.create_index('ix_employee_document_expiry_date', 'employee_document', ['expiry_date'])


def downgrade():
    op.drop_index('ix_call_trip_date',   'call')
    op.drop_index('ix_call_status',      'call')
    op.drop_index('ix_call_patient_id',  'call')
    op.drop_index('ix_patient_last_name', 'patient')
    op.drop_index('ix_patient_dob',       'patient')
    op.drop_index('ix_call_assignment_unit_id',   'call_assignment')
    op.drop_index('ix_call_assignment_call_id',   'call_assignment')
    op.drop_index('ix_call_assignment_is_active', 'call_assignment')
    op.drop_index('ix_daily_crew_unit_shift_date', 'daily_crew_unit')
    op.drop_index('ix_notification_event_created_at', 'notification_event')
    op.drop_index('ix_user_notification_user_id', 'user_notification')
    op.drop_index('ix_user_notification_is_read', 'user_notification')
    op.drop_index('ix_time_entry_employee_id', 'time_entry')
    op.drop_index('ix_audit_log_entity_type', 'audit_log')
    op.drop_index('ix_audit_log_timestamp',   'audit_log')
    op.drop_index('ix_employee_document_employee_id', 'employee_document')
    op.drop_index('ix_employee_document_expiry_date', 'employee_document')
