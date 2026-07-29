"""The demo dataset builder — that it produces a coherent world and its guard."""

from models import (
    db, Patient, Employee, Vehicle, DailyCrewUnit, Call, CallAssignment,
    Task, CalendarEvent,
)


def test_guard_detects_existing_data(app):
    from demo_data import has_demo_data
    assert has_demo_data() is False
    db.session.add(Patient(first_name="Test", last_name="Patient"))
    db.session.commit()
    assert has_demo_data() is True


def test_build_demo_dataset_is_coherent(app):
    from conftest import make_user
    make_user("admin", username="admin")   # the builder attributes tasks / the event to admin

    from demo_data import build_demo_dataset, has_demo_data
    assert has_demo_data() is False

    summary = build_demo_dataset()

    # Headline counts match what it reports.
    assert summary == {
        "employees": 8, "patients": 6, "vehicles": 4,
        "units_today": 3, "calls": summary["calls"], "tasks": 4,
    }
    assert Employee.query.count() == 8
    assert Patient.query.count() == 6
    assert Vehicle.query.count() == 4
    assert Task.query.count() == 4
    assert Call.query.count() == summary["calls"] > 40

    # Coherence, not just volume:
    # today's units are crewed,
    assert DailyCrewUnit.query.filter(DailyCrewUnit.driver_id.isnot(None)).count() == 3
    # some calls are assigned to those units,
    assert CallAssignment.query.filter_by(is_active=True).count() >= 2
    # history has completed calls with lifecycle timestamps (for Reports / Timeline),
    assert Call.query.filter(Call.completed_at.isnot(None)).count() >= 5
    # some trips still need a date (Scheduling Inbox),
    assert Call.query.filter(db.or_(Call.trip_date.is_(None), Call.trip_date == "")).count() >= 1
    # a couple of certs land in the expiring window (Compliance colour),
    from datetime import date, timedelta
    soon = (date.today() + timedelta(days=30)).isoformat()
    assert Employee.query.filter(Employee.cpr_expiration_date <= soon,
                                 Employee.cpr_expiration_date >= date.today().isoformat()).count() >= 1
    # and one recurring staff meeting.
    assert CalendarEvent.query.filter_by(recurrence="weekly").count() == 1

    assert has_demo_data() is True


def test_build_is_guarded_against_double_seeding(app):
    from conftest import make_user
    make_user("admin", username="admin")
    from demo_data import build_demo_dataset, has_demo_data
    build_demo_dataset()
    # The CLI checks has_demo_data() before calling build again; assert the guard
    # reports truthy so a second run is skipped rather than doubling everything.
    assert has_demo_data() is True
