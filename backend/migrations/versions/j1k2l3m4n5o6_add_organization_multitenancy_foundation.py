"""add organization multi-tenancy foundation

Revision ID: j1k2l3m4n5o6
Revises: i0j1k2l3m4n5
Create Date: 2026-06-17

Creates the organization table and adds a nullable org_id FK to all
tenant-scoped tables. Existing rows are assigned to the default org (id=1).
No application logic changes — org_id is unused until the full tenant
isolation phase (Tier 3).
"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa

revision = 'j1k2l3m4n5o6'
down_revision = 'i0j1k2l3m4n5'
branch_labels = None
depends_on = None

# Tables that need org_id
TENANT_TABLES = [
    "user",
    "employee",
    "patient",
    "call",
    "daily_crew_unit",
    "crew_preset",
    "notification_event",
    "pay_period",
    "employee_document",
]


def upgrade():
    # 1. Create organization table
    op.create_table(
        "organization",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("created_at", sa.String(50)),
        sa.Column("settings_json", sa.Text()),
        sa.PrimaryKeyConstraint("id"),
    )

    # 2. Seed the default organization for all existing data
    now = datetime.utcnow().isoformat()
    op.execute(
        f"INSERT INTO organization (id, name, slug, is_active, created_at) "
        f"VALUES (1, 'Default Organization', 'default', 1, '{now}')"
    )

    # 3. Add org_id to every tenant-scoped table, default to org 1
    # SQLite requires batch mode for column additions with constraints.
    for table in TENANT_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column("org_id", sa.Integer(), nullable=True))
        op.execute(f'UPDATE "{table}" SET org_id = 1')


def downgrade():
    for table in TENANT_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column("org_id")

    op.drop_table("organization")
