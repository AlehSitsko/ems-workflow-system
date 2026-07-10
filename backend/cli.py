"""Custom Flask CLI commands.

`seed-demo` replaces the old import-time `create_default_users()` call. Demo
users are created explicitly, never on normal app startup, so importing or
serving the app has no side effects on the database.
"""

import click
from flask.cli import with_appcontext
from werkzeug.security import generate_password_hash

from models import db, User


# Demo credentials — for local/demo environments only. Never seed these in a
# production deployment (see docs/PRODUCTION_READINESS.md).
DEMO_USERS = [
    {"username": "admin",      "password": "admin",      "display_name": "Admin User",      "role": "admin"},
    {"username": "supervisor", "password": "supervisor", "display_name": "Supervisor User", "role": "supervisor"},
    {"username": "dispatcher", "password": "dispatcher", "display_name": "Dispatcher User", "role": "dispatcher"},
    {"username": "hr",         "password": "hr",         "display_name": "HR User",         "role": "hr"},
]


@click.command("seed-demo")
@with_appcontext
def seed_demo_command():
    """Create demo users (idempotent). Requires migrations to be applied first.

    Safe to re-run: existing usernames are skipped, not duplicated or updated.
    Errors are not swallowed — if the schema is missing, run `flask db upgrade`.
    """
    created, skipped = [], []
    for user_data in DEMO_USERS:
        if User.query.filter_by(username=user_data["username"]).first():
            skipped.append(user_data["username"])
            continue
        db.session.add(User(
            username=user_data["username"],
            password_hash=generate_password_hash(user_data["password"]),
            display_name=user_data["display_name"],
            role=user_data["role"],
            is_active=True,
        ))
        created.append(user_data["username"])

    db.session.commit()
    click.echo(f"seed-demo: created={created or 'none'} | skipped_existing={skipped or 'none'}")


def register_cli_commands(app):
    """Attach custom CLI commands to the given app instance."""
    app.cli.add_command(seed_demo_command)
