"""Launcher for a DISPOSABLE QA / stress backend.

Builds the app against a throwaway SQLite database (never the dev or production
DB), seeds the four role users with known passwords, and serves on 127.0.0.1 so
the live ``qa_test.py`` / ``stress_test.py`` runners have a real HTTP server they
can safely write to and then discard.

Normally started by ``qa_harness.QaHarness`` rather than by hand:

    EMS_QA=1 python qa_server.py --port 5099 --db C:/temp/qa.sqlite

The server always reports ``qa_mode: true`` on ``/api/health`` (Config.QA_MODE),
which is how the runners confirm they are talking to a disposable backend before
they write anything.
"""

import argparse
import os


# Known QA credentials — only ever seeded into a disposable database.
QA_USERS = [
    {"username": "admin", "password": "admin", "display_name": "QA Admin", "role": "admin"},
    {"username": "supervisor", "password": "supervisor", "display_name": "QA Supervisor", "role": "supervisor"},
    {"username": "dispatcher", "password": "dispatcher", "display_name": "QA Dispatcher", "role": "dispatcher"},
    {"username": "hr", "password": "hr", "display_name": "QA HR", "role": "hr"},
]


def build_qa_app(db_path):
    """Create the app against a disposable SQLite file and seed the role users."""
    # Mark the process as QA before Config is read, and force it in the override
    # too, so /api/health reports qa_mode=true regardless of the ambient env.
    os.environ["EMS_QA"] = "1"

    from app import create_app
    from models import db, User
    from werkzeug.security import generate_password_hash

    app = create_app({
        "QA_MODE": True,
        "RATELIMIT_ENABLED": False,
        # The disposable DB override wins over any DATABASE_URL in .env, so the
        # runner physically cannot be aimed at the real database.
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
        # The runner talks plain HTTP on loopback; a Secure cookie would never be
        # sent and every login would appear to fail.
        "SESSION_COOKIE_SECURE": False,
    })

    with app.app_context():
        db.create_all()
        # Give the seeded users an org_id (the write-stamp needs a current org),
        # matching how the seed-demo CLI binds to the default organisation.
        from tenant import ensure_default_org, set_current_org
        set_current_org(ensure_default_org())
        for spec in QA_USERS:
            if not User.query.filter_by(username=spec["username"]).first():
                db.session.add(User(
                    username=spec["username"],
                    # A fast KDF: this is a throwaway DB and the point under test is
                    # the session mechanism, not the password hash work factor.
                    password_hash=generate_password_hash(spec["password"], method="pbkdf2:sha256:1"),
                    display_name=spec["display_name"],
                    role=spec["role"],
                    is_active=True,
                ))
        db.session.commit()

    return app


def main():
    parser = argparse.ArgumentParser(description="Disposable QA/stress backend.")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--db", required=True, help="Path to the throwaway SQLite file.")
    args = parser.parse_args()

    app = build_qa_app(args.db)
    # threaded=True so the concurrent-load sections get real parallelism;
    # use_reloader=False so there is exactly one child process to manage.
    app.run(host="127.0.0.1", port=args.port, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
