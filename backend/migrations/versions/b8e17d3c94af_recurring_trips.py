"""Recurring transport orders (roadmap Phase 4)

A standing order — dialysis every Mon/Wed/Fri — materialises real Call rows a few
weeks ahead rather than being computed on the fly. Every generated trip is an
ordinary call, so the board, the calendar, the confirmation round and
cancellation all keep working without knowing recurrence exists.

Call gains three columns:
  * recurring_trip_id — which standing order produced it
  * recurrence_locked — raised as soon as a human edits a generated call, after
    which the template stops rewriting it: a schedule change must never quietly
    undo a dispatcher's correction
  * linked_call_id    — the other leg of an outbound/return pair

Revision ID: b8e17d3c94af
Revises: a4d92b6f318c
"""
from alembic import op
import sqlalchemy as sa


revision = "b8e17d3c94af"
down_revision = "a4d92b6f318c"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "recurring_trip",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("service_level", sa.String(length=50), nullable=True),
        sa.Column("call_type", sa.String(length=50), nullable=True),
        sa.Column("pickup_time", sa.String(length=20), nullable=True),
        sa.Column("pickup_address", sa.String(length=500), nullable=True),
        sa.Column("dropoff_address", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("weekdays", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("start_date", sa.String(length=20), nullable=False),
        sa.Column("end_date", sa.String(length=20), nullable=True),
        sa.Column("horizon_weeks", sa.Integer(), nullable=True, server_default="4"),
        sa.Column("return_pickup_time", sa.String(length=20), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("created_at", sa.String(length=50), nullable=True),
        sa.Column("created_by_name", sa.String(length=150), nullable=True),
        sa.Column("updated_at", sa.String(length=50), nullable=True),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["patient_id"], ["patient.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recurring_trip_patient_id", "recurring_trip", ["patient_id"])
    op.create_index("ix_recurring_trip_start_date", "recurring_trip", ["start_date"])
    op.create_index("ix_recurring_trip_is_active", "recurring_trip", ["is_active"])

    with op.batch_alter_table("call") as batch:
        batch.add_column(sa.Column("recurring_trip_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("recurrence_locked", sa.Boolean(),
                                   nullable=True, server_default=sa.false()))
        batch.add_column(sa.Column("linked_call_id", sa.Integer(), nullable=True))
        # Declared on the model, so created here as well — the reconciliation
        # migration (c9e4a7b21d38) exists because earlier columns skipped this.
        batch.create_foreign_key("fk_call_recurring_trip", "recurring_trip",
                                 ["recurring_trip_id"], ["id"])
        batch.create_foreign_key("fk_call_linked_call", "call", ["linked_call_id"], ["id"])

    op.create_index("ix_call_recurring_trip_id", "call", ["recurring_trip_id"])


def downgrade():
    op.drop_index("ix_call_recurring_trip_id", "call")
    with op.batch_alter_table("call") as batch:
        batch.drop_constraint("fk_call_linked_call", type_="foreignkey")
        batch.drop_constraint("fk_call_recurring_trip", type_="foreignkey")
        batch.drop_column("linked_call_id")
        batch.drop_column("recurrence_locked")
        batch.drop_column("recurring_trip_id")

    op.drop_index("ix_recurring_trip_is_active", "recurring_trip")
    op.drop_index("ix_recurring_trip_start_date", "recurring_trip")
    op.drop_index("ix_recurring_trip_patient_id", "recurring_trip")
    op.drop_table("recurring_trip")
