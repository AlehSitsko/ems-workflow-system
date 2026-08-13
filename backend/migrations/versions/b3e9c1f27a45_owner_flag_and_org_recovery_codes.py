"""owner flag + org recovery codes

Revision ID: b3e9c1f27a45
Revises: 89934d8d6997
Create Date: 2026-08-13

"""
from alembic import op
import sqlalchemy as sa


revision = "b3e9c1f27a45"
down_revision = "89934d8d6997"
branch_labels = None
depends_on = None


def upgrade():
    # user.is_owner (NOT NULL) — added with a server default so existing rows get
    # a value; the model default keeps new rows consistent.
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.add_column(sa.Column("is_owner", sa.Boolean(), nullable=False,
                                      server_default=sa.false()))

    op.create_table(
        "org_recovery_code",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.String(length=50), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("used_at", sa.String(length=50), nullable=True),
        sa.Column("used_note", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("org_recovery_code", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_org_recovery_code_code_hash"),
                              ["code_hash"], unique=True)

    # Backfill: mark the earliest active admin of each org as its Owner, so every
    # existing organisation has an ownership anchor. `is_active` is used as a
    # truthy expression so it works on both SQLite (0/1) and PostgreSQL (bool).
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        'SELECT org_id, MIN(id) AS uid FROM "user" '
        "WHERE role='admin' AND is_active AND org_id IS NOT NULL GROUP BY org_id"
    )).fetchall()
    for row in rows:
        conn.execute(sa.text('UPDATE "user" SET is_owner = true WHERE id = :uid'),
                     {"uid": row.uid})


def downgrade():
    with op.batch_alter_table("org_recovery_code", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_org_recovery_code_code_hash"))
    op.drop_table("org_recovery_code")
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_column("is_owner")
