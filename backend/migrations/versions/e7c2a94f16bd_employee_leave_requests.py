"""Employee leave / absence requests (roadmap Phase 4d)

One row per request holding an inclusive date range, not one row per day: the
request is what gets approved, and per-day rows would turn a single approval or
cancellation into a multi-row edit that can half-fail.

The HR-only fields (reason, private_notes, the review trail) live in the same
table as the scheduling fields because they belong to the same request. The
privacy boundary is enforced where the payload is built — see
EmployeeLeaveRequest.to_dict — not by splitting the storage.

Revision ID: e7c2a94f16bd
Revises: d1f5b8c47e29
"""
from alembic import op
import sqlalchemy as sa


revision = "e7c2a94f16bd"
down_revision = "d1f5b8c47e29"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "employee_leave_request",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("leave_type", sa.String(length=30), nullable=False),
        sa.Column("start_date", sa.String(length=20), nullable=False),
        sa.Column("end_date", sa.String(length=20), nullable=False),
        sa.Column("start_time", sa.String(length=20), nullable=True),
        sa.Column("end_time", sa.String(length=20), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("private_notes", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.String(length=50), nullable=True),
        sa.Column("submitted_by", sa.Integer(), nullable=True),
        sa.Column("submitted_by_name", sa.String(length=150), nullable=True),
        sa.Column("reviewed_at", sa.String(length=50), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_by_name", sa.String(length=150), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(length=50), nullable=True),
        sa.Column("updated_at", sa.String(length=50), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employee.id"]),
        sa.ForeignKeyConstraint(["submitted_by"], ["user.id"]),
        sa.ForeignKeyConstraint(["reviewed_by"], ["user.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # The calendar and the crew planner both ask "who is away between these two
    # dates", which scans by employee and by range.
    op.create_index("ix_employee_leave_request_employee_id", "employee_leave_request", ["employee_id"])
    op.create_index("ix_employee_leave_request_start_date", "employee_leave_request", ["start_date"])
    op.create_index("ix_employee_leave_request_end_date", "employee_leave_request", ["end_date"])
    op.create_index("ix_employee_leave_request_status", "employee_leave_request", ["status"])


def downgrade():
    op.drop_index("ix_employee_leave_request_status", "employee_leave_request")
    op.drop_index("ix_employee_leave_request_end_date", "employee_leave_request")
    op.drop_index("ix_employee_leave_request_start_date", "employee_leave_request")
    op.drop_index("ix_employee_leave_request_employee_id", "employee_leave_request")
    op.drop_table("employee_leave_request")
