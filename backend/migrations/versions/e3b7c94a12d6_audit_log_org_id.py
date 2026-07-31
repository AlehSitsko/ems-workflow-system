"""Tenant-scope the audit log: add audit_log.org_id and backfill

The audit log was the last org-owned table without an org_id, so one organisation's
admin could read another's audit trail. Add the column and backfill existing rows
to the default organisation; new in-request entries are stamped automatically.

Revision ID: e3b7c94a12d6
Revises: d2f7a13e8c95
"""
from alembic import op
import sqlalchemy as sa


revision = "e3b7c94a12d6"
down_revision = "d2f7a13e8c95"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("audit_log", schema=None) as batch_op:
        batch_op.add_column(sa.Column("org_id", sa.Integer(), nullable=True))
        batch_op.create_index(batch_op.f("ix_audit_log_org_id"), ["org_id"], unique=False)

    conn = op.get_bind()
    org_id = conn.execute(sa.text("SELECT id FROM organization WHERE slug = 'default'")).scalar()
    if org_id is not None:
        conn.execute(sa.text("UPDATE audit_log SET org_id = :org WHERE org_id IS NULL"),
                     {"org": org_id})


def downgrade():
    with op.batch_alter_table("audit_log", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_audit_log_org_id"))
        batch_op.drop_column("org_id")
