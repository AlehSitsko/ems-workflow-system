"""Copy all application data from one database to another — the one-off step for
carrying an existing SQLite deployment onto the Postgres stack.

The app itself needs no code change to run on Postgres (the URL drives everything);
this only moves the *data* across. It is schema-driven: every table the models
declare is copied in foreign-key dependency order, at the SQLAlchemy Core level, so
the ORM's tenant events never fire and nothing is re-filtered or re-stamped — the
rows land exactly as they are, org_id and all.

Prerequisites:
  * The target already has the schema. Create it the same way production does —
    `DATABASE_URL=<target> flask db upgrade` — so its `alembic_version` matches the
    migration chain. This script does not create tables and does not touch
    `alembic_version`.
  * The target is empty (a fresh migrate). It refuses a non-empty target unless
    `--force` is given, so it cannot silently double-load.

Run from the backend/ directory:

    python scripts/copy_sqlite_to_postgres.py \
        --source sqlite:///database.db \
        --target "postgresql+psycopg://ems:PASS@localhost:5432/ems"

`--source` defaults to the app's configured database; `--target` may instead come
from the TARGET_DATABASE_URL environment variable.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine, func, select

from models import db  # noqa: E402  (path set above)
# Import the models module so every table is registered on db.metadata before we
# read sorted_tables — importing the classes triggers their table definitions.
import models  # noqa: F401,E402


def _row_count(conn, table):
    return conn.execute(select(func.count()).select_from(table)).scalar() or 0


def copy_data(source_engine, target_engine, force=False, progress=None):
    """Copy every declared table from source to target in FK-dependency order.

    Returns a dict of {table_name: rows_copied}. Raises RuntimeError if the target
    already holds data in any table and `force` is not set; with `force` the target
    tables are emptied first (a clean reload) rather than appended to, since the
    copied rows carry their original primary keys and would otherwise collide. The
    whole copy runs in one target transaction, so a failure rolls the target back.
    """
    metadata = db.metadata
    tables = metadata.sorted_tables  # parents before children (FK order)

    with source_engine.connect() as src, target_engine.begin() as dst:
        non_empty = [t.name for t in tables if _row_count(dst, t) > 0]
        if non_empty and not force:
            raise RuntimeError(
                "target is not empty (tables: " + ", ".join(non_empty) +
                "). Refusing to copy without --force."
            )
        if non_empty:
            # Clean reload: clear children before parents (reverse FK order).
            for table in reversed(tables):
                dst.execute(table.delete())

        counts = {}
        for table in tables:
            rows = [dict(r) for r in src.execute(table.select()).mappings()]
            if rows:
                dst.execute(table.insert(), rows)
            counts[table.name] = len(rows)
            if progress:
                progress(table.name, len(rows))

        # Postgres keeps its own sequence for a SERIAL/IDENTITY primary key; after a
        # bulk insert of explicit ids it still points at 1, so the next ORM insert
        # would collide. Fast-forward each sequence past the copied maximum.
        if target_engine.dialect.name == "postgresql":
            _reset_postgres_sequences(dst, tables)

    return counts


def _reset_postgres_sequences(conn, tables):
    from sqlalchemy import text
    for table in tables:
        pk_cols = [c.name for c in table.primary_key.columns]
        if pk_cols != ["id"]:
            continue  # only the single integer `id` surrogate keys use a sequence
        conn.execute(text(
            "SELECT setval("
            "  pg_get_serial_sequence(:tbl, 'id'),"
            "  COALESCE((SELECT MAX(id) FROM " + table.name + "), 1),"
            "  (SELECT MAX(id) IS NOT NULL FROM " + table.name + ")"
            ")"
        ), {"tbl": table.name})


def _parse_args(argv):
    from config import Config

    parser = argparse.ArgumentParser(description="Copy app data between databases.")
    parser.add_argument(
        "--source",
        default=Config.SQLALCHEMY_DATABASE_URI,
        help="Source SQLAlchemy URL (default: the app's configured database).",
    )
    parser.add_argument(
        "--target",
        default=os.environ.get("TARGET_DATABASE_URL"),
        help="Target SQLAlchemy URL (or set TARGET_DATABASE_URL).",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Copy even if the target already holds data.",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = _parse_args(argv or sys.argv[1:])
    if not args.target:
        print("error: no target given (use --target or TARGET_DATABASE_URL).", file=sys.stderr)
        return 2
    if args.source == args.target:
        print("error: source and target are the same database.", file=sys.stderr)
        return 2

    source_engine = create_engine(args.source)
    target_engine = create_engine(args.target)

    print(f"Copying {args.source}\n     -> {args.target}\n")
    try:
        counts = copy_data(
            source_engine, target_engine, force=args.force,
            progress=lambda name, n: print(f"  {name:<28} {n:>7} rows"),
        )
    except RuntimeError as e:
        print(f"\naborted: {e}", file=sys.stderr)
        return 1

    total = sum(counts.values())
    print(f"\nDone — {total} rows across {len(counts)} tables.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
