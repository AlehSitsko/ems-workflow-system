"""Per-org usernames + platform super-admin flag

Multi-tenancy v2: usernames become unique *per organisation* rather than globally
(the same "admin" can exist in two orgs), and a `is_platform_admin` flag marks the
cross-org operator. Existing users are all in the default org, so swapping the
constraint cannot collide.

The old constraint is the anonymous ``UNIQUE (username)`` from the initial schema;
a batch `naming_convention` gives it a deterministic name so it can be dropped
portably (the standard Alembic + SQLite recipe, which also works on Postgres).

Revision ID: d9f4a2c81e60
Revises: c5e1a83d6b47
"""
from alembic import op
import sqlalchemy as sa


revision = "d9f4a2c81e60"
down_revision = "c5e1a83d6b47"
branch_labels = None
depends_on = None

_NAMING = {"uq": "uq_%(table_name)s_%(column_0_name)s"}


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # The initial schema declared UNIQUE(username) inline, which PostgreSQL
        # auto-names (e.g. user_username_key) — not uq_user_username, so a literal
        # drop by that name fails. The SQLite batch recipe only renames the
        # constraint because it *rebuilds* the table; PostgreSQL alters in place,
        # so drop the constraint by its real, reflected name instead.
        op.add_column("user", sa.Column(
            "is_platform_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
        old = next((u["name"] for u in sa.inspect(bind).get_unique_constraints("user")
                    if u["column_names"] == ["username"]), None)
        if old:
            op.drop_constraint(old, "user", type_="unique")
        op.create_unique_constraint("uq_user_org_username", "user", ["org_id", "username"])
    else:
        with op.batch_alter_table("user", schema=None, naming_convention=_NAMING) as batch_op:
            batch_op.add_column(sa.Column(
                "is_platform_admin", sa.Boolean(), nullable=False, server_default=sa.false()
            ))
            batch_op.drop_constraint("uq_user_username", type_="unique")
            batch_op.create_unique_constraint("uq_user_org_username", ["org_id", "username"])


def downgrade():
    with op.batch_alter_table("user", schema=None, naming_convention=_NAMING) as batch_op:
        batch_op.drop_constraint("uq_user_org_username", type_="unique")
        batch_op.create_unique_constraint("uq_user_username", ["username"])
        batch_op.drop_column("is_platform_admin")
