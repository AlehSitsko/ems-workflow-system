"""The SQLite→Postgres data-copy engine (scripts/copy_sqlite_to_postgres.py).

Exercised SQLite→SQLite: the Postgres driver is a different SQLAlchemy engine but
the copy is the same Core code path. The target enforces foreign keys, so a wrong
copy order (a child before its parent) would fail the insert — this pins the
FK-dependency ordering, the row fidelity, and the empty-target guard.
"""

import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from models import db, Organization, Employee, EmploymentEvent
from scripts.copy_sqlite_to_postgres import copy_data


def _fresh_engine(enforce_fk=False):
    """An isolated in-memory SQLite with the app schema (one shared connection so
    the schema survives across the copy's separate connect() calls)."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    if enforce_fk:
        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn, _rec):
            dbapi_conn.execute("PRAGMA foreign_keys=ON")
    db.metadata.create_all(engine)
    return engine


@pytest.fixture()
def source():
    """A source DB holding an org, an employee, and an employment event (a child
    row whose FK points back at the employee — so ordering matters)."""
    engine = _fresh_engine()
    with Session(engine) as s:
        org = Organization(name="Org A", slug="orga")
        s.add(org)
        s.flush()
        emp = Employee(first_name="Ann", last_name="A", role="EMT",
                       status="active", is_active=True, org_id=org.id)
        s.add(emp)
        s.flush()
        s.add(EmploymentEvent(employee_id=emp.id, event_type="hire",
                              effective_date="2026-01-01", created_at="2026-01-01T00:00:00"))
        s.commit()
    return engine


def _count(engine, model):
    with engine.connect() as c:
        return c.execute(select(func.count()).select_from(model.__table__)).scalar()


def test_copy_moves_every_row_in_fk_order(source):
    target = _fresh_engine(enforce_fk=True)  # a child before its parent would fail here
    counts = copy_data(source, target)

    assert counts["organization"] == 1
    assert counts["employee"] == 1
    assert counts["employment_event"] == 1
    assert _count(target, Employee) == 1
    assert _count(target, EmploymentEvent) == 1


def test_copied_rows_keep_their_values_including_org_id(source):
    target = _fresh_engine()
    copy_data(source, target)
    with Session(target) as s:
        emp = s.query(Employee).one()
        assert emp.first_name == "Ann" and emp.org_id is not None
        ev = s.query(EmploymentEvent).one()
        assert ev.employee_id == emp.id and ev.event_type == "hire"


def test_refuses_a_non_empty_target_without_force(source):
    target = _fresh_engine()
    copy_data(source, target)                 # first copy fills it
    with pytest.raises(RuntimeError, match="not empty"):
        copy_data(source, target)             # second copy is refused


def test_force_does_a_clean_reload_not_an_append(source):
    target = _fresh_engine(enforce_fk=True)
    copy_data(source, target)
    # Force wipes the target first, so re-copying the same source leaves one row,
    # not a primary-key collision or a duplicate.
    copy_data(source, target, force=True)
    assert _count(target, Employee) == 1
    assert _count(target, EmploymentEvent) == 1
