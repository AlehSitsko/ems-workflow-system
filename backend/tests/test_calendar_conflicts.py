"""Calendar readiness conflicts: shift time-overlap and vehicle availability.

Double-booking used to be measured by sharing a date, which flagged a day shift
followed by a night shift — normal operations. These tests pin that conflicts
are measured by overlapping time, and that a shift on a truck that cannot roll
drags the day's readiness down.
"""

from datetime import date, timedelta

import pytest
from werkzeug.security import generate_password_hash

from models import db, User, Employee, DailyCrewUnit, Vehicle


DAY = (date.today() + timedelta(days=3)).isoformat()
NEXT_DAY = (date.today() + timedelta(days=4)).isoformat()


@pytest.fixture()
def admin(app):
    user = User(username="cal_admin", password_hash=generate_password_hash("pw"),
                display_name="Cal Admin", role="admin", is_active=True)
    db.session.add(user)
    db.session.commit()
    return {"X-User-Id": str(user.id), "X-User-Role": "admin", "X-User-Name": user.display_name}


@pytest.fixture()
def crew(app):
    emps = [Employee(first_name=f"C{i}", last_name=f"M{i}", role="EMT") for i in range(4)]
    db.session.add_all(emps)
    db.session.commit()
    return emps


def mk_unit(shift_date=DAY, start="08:00", end="20:00", end_date=None,
            driver=None, medical=None, vehicle_id=None, status="scheduled",
            truck="101", unit_type="BLS"):
    u = DailyCrewUnit(
        shift_date=shift_date, unit_type=unit_type, truck_number=truck,
        start_time=start, end_time=end, end_date=end_date,
        vehicle_id=vehicle_id, shift_status=status,
        driver_id=driver.id if driver else None,
        medical_id=medical.id if medical else None,
    )
    db.session.add(u)
    db.session.commit()
    return u


def day_summary(client, admin, day=DAY, start=None, end=None):
    resp = client.get(f"/api/calendar/events?start={start or day}&end={end or day}", headers=admin)
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()["days"].get(day, {})


# ── Shift time-overlap ──────────────────────────────────────────────────────

def test_back_to_back_shifts_are_not_a_conflict(client, admin, crew):
    """The regression this replaces: same person, same day, no shared time."""
    mk_unit(start="08:00", end="20:00", driver=crew[0], medical=crew[1])
    mk_unit(start="20:00", end="23:59", driver=crew[0], medical=crew[2], truck="102")

    assert day_summary(client, admin)["criticalCount"] == 0


def test_overlapping_shifts_for_one_person_are_critical(client, admin, crew):
    mk_unit(start="08:00", end="20:00", driver=crew[0], medical=crew[1])
    mk_unit(start="18:00", end="23:00", driver=crew[0], medical=crew[2], truck="102")

    assert day_summary(client, admin)["criticalCount"] == 1


def test_same_vehicle_at_the_same_time_is_critical(client, admin, crew):
    v = Vehicle(unit_name="Ambu-1", unit_number="101", unit_type="BLS")
    db.session.add(v)
    db.session.commit()

    mk_unit(start="08:00", end="20:00", driver=crew[0], medical=crew[1], vehicle_id=v.id)
    mk_unit(start="12:00", end="22:00", driver=crew[2], medical=crew[3], vehicle_id=v.id)

    assert day_summary(client, admin)["criticalCount"] == 1


def test_same_vehicle_back_to_back_is_fine(client, admin, crew):
    v = Vehicle(unit_name="Ambu-1", unit_number="101", unit_type="BLS")
    db.session.add(v)
    db.session.commit()

    mk_unit(start="08:00", end="20:00", driver=crew[0], medical=crew[1], vehicle_id=v.id)
    mk_unit(start="20:00", end="23:00", driver=crew[2], medical=crew[3], vehicle_id=v.id)

    assert day_summary(client, admin)["criticalCount"] == 0


def test_a_night_shift_crossing_midnight_conflicts_with_the_next_morning(client, admin, crew):
    # 20:00 → 08:00 next day, then that same person starts again at 06:00.
    mk_unit(shift_date=DAY, start="20:00", end="08:00", driver=crew[0], medical=crew[1])
    mk_unit(shift_date=NEXT_DAY, start="06:00", end="14:00", driver=crew[0], medical=crew[2], truck="102")

    # Charged to the day the later shift starts.
    summary = day_summary(client, admin, day=NEXT_DAY, start=DAY, end=NEXT_DAY)
    assert summary["criticalCount"] == 1


def test_a_night_shift_from_before_the_range_is_still_checked(client, admin, crew):
    """The window starts on NEXT_DAY, so the conflicting shift is outside it."""
    mk_unit(shift_date=DAY, start="20:00", end="08:00", driver=crew[0], medical=crew[1])
    mk_unit(shift_date=NEXT_DAY, start="06:00", end="14:00", driver=crew[0], medical=crew[2], truck="102")

    summary = day_summary(client, admin, day=NEXT_DAY, start=NEXT_DAY, end=NEXT_DAY)
    assert summary["criticalCount"] == 1


def test_cancelled_and_completed_shifts_never_conflict(client, admin, crew):
    mk_unit(start="08:00", end="20:00", driver=crew[0], medical=crew[1])
    mk_unit(start="09:00", end="21:00", driver=crew[0], medical=crew[2],
            truck="102", status="cancelled")

    assert day_summary(client, admin)["criticalCount"] == 0


def test_a_shift_without_an_end_time_is_not_guessed_at(client, admin, crew):
    """No measurable span means no provable overlap — never a false conflict."""
    mk_unit(start="08:00", end=None, driver=crew[0], medical=crew[1])
    mk_unit(start="09:00", end="21:00", driver=crew[0], medical=crew[2], truck="102")

    assert day_summary(client, admin)["criticalCount"] == 0


# ── Vehicle availability ────────────────────────────────────────────────────

@pytest.mark.parametrize("kwargs,expected_severity,reason", [
    ({"operational_status": "out_of_service"}, "critical", "out of service"),
    ({"is_retired": True}, "critical", "retired"),
    ({"is_active": False}, "critical", "inactive"),
    ({"operational_status": "maintenance"}, "warning", "in maintenance"),
])
def test_unavailable_vehicle_marks_the_shift(client, admin, crew, kwargs, expected_severity, reason):
    v = Vehicle(unit_name="Ambu-1", unit_number="101", unit_type="BLS", **kwargs)
    db.session.add(v)
    db.session.commit()

    mk_unit(driver=crew[0], medical=crew[1], vehicle_id=v.id)

    resp = client.get(f"/api/calendar/events?start={DAY}&end={DAY}", headers=admin)
    event = next(e for e in resp.get_json()["events"] if e["type"] == "crew_shift")
    assert event["severity"] == expected_severity
    assert event["metadata"]["vehicleIssue"] == reason

    summary = resp.get_json()["days"][DAY]
    counter = "criticalCount" if expected_severity == "critical" else "warningCount"
    assert summary[counter] >= 1


def test_in_service_vehicle_reports_no_issue(client, admin, crew):
    v = Vehicle(unit_name="Ambu-1", unit_number="101", unit_type="BLS")
    db.session.add(v)
    db.session.commit()

    mk_unit(driver=crew[0], medical=crew[1], vehicle_id=v.id)
    summary = day_summary(client, admin)

    assert summary["criticalCount"] == 0
    assert summary["readiness"] == "ready"


def test_legacy_shift_without_a_vehicle_link_reports_no_issue(client, admin, crew):
    """Free-text truck numbers have no fleet record to check — never invent one."""
    mk_unit(driver=crew[0], medical=crew[1], vehicle_id=None, truck="rental van")

    resp = client.get(f"/api/calendar/events?start={DAY}&end={DAY}", headers=admin)
    event = next(e for e in resp.get_json()["events"] if e["type"] == "crew_shift")
    assert event["metadata"]["vehicleIssue"] is None
    assert resp.get_json()["days"][DAY]["criticalCount"] == 0


def test_a_finished_shift_is_not_dragged_down_by_its_truck(client, admin, crew):
    v = Vehicle(unit_name="Ambu-1", unit_number="101", unit_type="BLS",
                operational_status="out_of_service")
    db.session.add(v)
    db.session.commit()

    mk_unit(driver=crew[0], medical=crew[1], vehicle_id=v.id, status="completed")

    resp = client.get(f"/api/calendar/events?start={DAY}&end={DAY}", headers=admin)
    event = next(e for e in resp.get_json()["events"] if e["type"] == "crew_shift")
    assert event["metadata"]["vehicleIssue"] is None
    assert resp.get_json()["days"][DAY]["criticalCount"] == 0


# ── Conflicts are explainable, not just counted ─────────────────────────────

def test_an_overlap_is_reported_on_both_shifts(client, admin, crew):
    """A readiness count the drawer cannot explain is worse than no count."""
    a = mk_unit(start="08:00", end="20:00", driver=crew[0], medical=crew[1])
    b = mk_unit(start="18:00", end="23:00", driver=crew[0], medical=crew[2], truck="102")

    resp = client.get(f"/api/calendar/events?start={DAY}&end={DAY}", headers=admin)
    shifts = {e["sourceId"]: e for e in resp.get_json()["events"] if e["type"] == "crew_shift"}

    for unit, other in ((a, b), (b, a)):
        conflicts = shifts[unit.id]["metadata"]["conflicts"]
        assert len(conflicts) == 1
        assert conflicts[0]["type"] == "crew_double_booked"
        assert conflicts[0]["withUnitId"] == other.id
        assert conflicts[0]["withUnitNumber"] == other.truck_number


def test_a_vehicle_overlap_is_labelled_as_such(client, admin, crew):
    v = Vehicle(unit_name="Ambu-1", unit_number="101", unit_type="BLS")
    db.session.add(v)
    db.session.commit()

    a = mk_unit(start="08:00", end="20:00", driver=crew[0], medical=crew[1], vehicle_id=v.id)
    mk_unit(start="12:00", end="22:00", driver=crew[2], medical=crew[3], vehicle_id=v.id)

    resp = client.get(f"/api/calendar/events?start={DAY}&end={DAY}", headers=admin)
    shifts = {e["sourceId"]: e for e in resp.get_json()["events"] if e["type"] == "crew_shift"}
    assert shifts[a.id]["metadata"]["conflicts"][0]["type"] == "vehicle_double_booked"


def test_shifts_without_conflicts_report_an_empty_list(client, admin, crew):
    u = mk_unit(driver=crew[0], medical=crew[1])

    resp = client.get(f"/api/calendar/events?start={DAY}&end={DAY}", headers=admin)
    shifts = {e["sourceId"]: e for e in resp.get_json()["events"] if e["type"] == "crew_shift"}
    assert shifts[u.id]["metadata"]["conflicts"] == []
