"""The startup schema-drift guard: warn (never fail) when the DB's alembic
revision is behind the migration head, so a stale DB stops surfacing as opaque
500s. Silent at head and for uninitialised DBs."""

import os
import sqlite3

import app as app_module
from app import create_app, _warn_if_schema_behind


def _head_revision():
    from alembic.script import ScriptDirectory
    from alembic.config import Config as AlembicConfig
    migrations_dir = os.path.join(os.path.dirname(os.path.abspath(app_module.__file__)), "migrations")
    cfg = AlembicConfig()
    cfg.set_main_option("script_location", migrations_dir)
    return ScriptDirectory.from_config(cfg).get_heads()[0]


def _db_at(tmp_path, revision):
    """A throwaway SQLite file whose only content is an alembic_version row."""
    p = tmp_path / "drift.sqlite"
    conn = sqlite3.connect(p)
    conn.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
    if revision:
        conn.execute("INSERT INTO alembic_version VALUES (?)", (revision,))
    conn.commit()
    conn.close()
    return f"sqlite:///{p.as_posix()}"


def _behind(records):
    return any("schema is behind" in r.getMessage().lower() for r in records)


def test_warns_when_the_db_is_behind_head(tmp_path, caplog):
    app = create_app({"SQLALCHEMY_DATABASE_URI": _db_at(tmp_path, "0000deadbeef")})
    caplog.clear()
    with caplog.at_level("WARNING", logger="app"):
        _warn_if_schema_behind(app)
    assert _behind(caplog.records)


def test_silent_when_the_db_is_at_head(tmp_path, caplog):
    app = create_app({"SQLALCHEMY_DATABASE_URI": _db_at(tmp_path, _head_revision())})
    caplog.clear()
    with caplog.at_level("WARNING", logger="app"):
        _warn_if_schema_behind(app)
    assert not _behind(caplog.records)


def test_silent_for_uninitialised_db(tmp_path, caplog):
    # No alembic_version table at all (a fresh create_all DB, like the test suite).
    p = tmp_path / "empty.sqlite"
    sqlite3.connect(p).close()
    app = create_app({"SQLALCHEMY_DATABASE_URI": f"sqlite:///{p.as_posix()}"})
    caplog.clear()
    with caplog.at_level("WARNING", logger="app"):
        _warn_if_schema_behind(app)
    assert not _behind(caplog.records)
