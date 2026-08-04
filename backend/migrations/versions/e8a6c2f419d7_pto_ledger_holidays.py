"""PTO ledger + holidays + employee annual allotment

Adds the PTO balance system: a per-employee annual allotment, a ledger whose sum is
the balance (accruals, used, carryover, adjustments), and a per-org holiday calendar
that PTO deductions exclude. All org-scoped; no backfill (balances start empty and
are built by the accrual run).

Revision ID: e8a6c2f419d7
Revises: d9f4a2c81e60
"""
from alembic import op
import sqlalchemy as sa


revision = "e8a6c2f419d7"
down_revision = "d9f4a2c81e60"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("employee", schema=None) as batch_op:
        batch_op.add_column(sa.Column("pto_annual_days", sa.Float(), nullable=True))

    op.create_table(
        "pto_ledger_entry",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("effective_date", sa.String(length=20), nullable=False),
        sa.Column("delta_days", sa.Float(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("leave_request_id", sa.Integer(), nullable=True),
        sa.Column("period", sa.String(length=7), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.String(length=50), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employee.id"]),
        sa.ForeignKeyConstraint(["leave_request_id"], ["employee_leave_request.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"]),
    )
    with op.batch_alter_table("pto_ledger_entry", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_pto_ledger_entry_employee_id"), ["employee_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_pto_ledger_entry_leave_request_id"), ["leave_request_id"], unique=False)

    op.create_table(
        "holiday",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("created_at", sa.String(length=50), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"]),
        sa.UniqueConstraint("org_id", "date", name="uq_holiday_org_date"),
    )
    with op.batch_alter_table("holiday", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_holiday_date"), ["date"], unique=False)


def downgrade():
    with op.batch_alter_table("holiday", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_holiday_date"))
    op.drop_table("holiday")

    with op.batch_alter_table("pto_ledger_entry", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_pto_ledger_entry_leave_request_id"))
        batch_op.drop_index(batch_op.f("ix_pto_ledger_entry_employee_id"))
    op.drop_table("pto_ledger_entry")

    with op.batch_alter_table("employee", schema=None) as batch_op:
        batch_op.drop_column("pto_annual_days")
