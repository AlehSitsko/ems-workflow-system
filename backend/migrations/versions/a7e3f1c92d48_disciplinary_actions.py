"""Disciplinary actions — a per-employee HR record of warnings and actions

Parallel to employment history: an append-only log of verbal/written warnings,
suspensions, corrective actions and notes. One field changes after creation —
`acknowledged`, set when the employee signs off. Gated to admin/HR at the API.

Revision ID: a7e3f1c92d48
Revises: c4d9f2a17b60
"""
from alembic import op
import sqlalchemy as sa


revision = "a7e3f1c92d48"
down_revision = "c4d9f2a17b60"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "disciplinary_action",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("action_type", sa.String(length=30), nullable=False),
        sa.Column("action_date", sa.String(length=20), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=True),
        sa.Column("subject", sa.String(length=150), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("acknowledged", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_by_name", sa.String(length=150), nullable=True),
        sa.Column("created_at", sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employee.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("disciplinary_action", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_disciplinary_action_employee_id"), ["employee_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_disciplinary_action_action_date"), ["action_date"], unique=False
        )


def downgrade():
    with op.batch_alter_table("disciplinary_action", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_disciplinary_action_action_date"))
        batch_op.drop_index(batch_op.f("ix_disciplinary_action_employee_id"))
    op.drop_table("disciplinary_action")
