"""Closing the operational day.

Past dates are already read-only, so closing is not a lock — it is the handoff.
The valuable part is the loose ends: a call still sitting as "assigned" on a day
that has ended either never happened or never got recorded, and a shift with no
actual end time cannot be paid accurately. Neither is visible on a board that
only shows today, which is how they survive into next week.
"""

from datetime import date, timedelta

import pytest
from werkzeug.security import generate_password_hash

from models import db, User, Call, DailyCrewUnit, CallAssignment, OperationalDayClosure


YESTERDAY = (date.today() - timedelta(days=1)).isoformat()
TODAY = date.today().isoformat()
TOMORROW = (date.today() + timedelta(days=1)).isoformat()


@pytest.fixture()
def roles(app):
    headers = {}
    for role in ("admin", "supervisor", "dispatcher", "hr"):
        user = User(username=f"close_{role}", password_hash=generate_password_hash("pw"),
                    display_name=f"Close {role.title()}", role=role, is_active=True)
        db.session.add(user)
        db.session.flush()
        headers[role] = {"X-User-Id": str(user.id), "X-User-Role": role, "X-User-Name": user.display_name}
    db.session.commit()
    return headers


def mk_call(day=YESTERDAY, status="completed", pickup_time="09:00"):
    c = Call(trip_date=day, status=status, pickup_time=pickup_time, service_level="BLS")
    db.session.add(c)
    db.session.commit()
    return c


def mk_unit(day=YESTERDAY, shift_status="completed", actual_end="20:05"):
    u = DailyCrewUnit(shift_date=day, unit_type="BLS", truck_number="101",
                      start_time="08:00", end_time="20:00",
                      shift_status=shift_status, actual_end_time=actual_end)
    db.session.add(u)
    db.session.commit()
    return u


def report(client, headers, day=YESTERDAY):
    resp = client.get(f"/api/operations/days/{day}", headers=headers)
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()


def close(client, headers, day=YESTERDAY, **body):
    return client.post(f"/api/operations/days/{day}/close", headers=headers, json=body)


# ── The report ──────────────────────────────────────────────────────────────

def test_a_tidy_day_has_no_loose_ends(client, roles):
    mk_call(status="completed")
    mk_call(status="cancelled")
    mk_unit()

    body = report(client, roles["supervisor"])
    assert body["summary"]["callsTotal"] == 2
    assert body["summary"]["callsCompleted"] == 1
    assert body["summary"]["callsCancelled"] == 1
    assert body["summary"]["callsUnfinished"] == 0
    assert body["looseEnds"]["calls"] == []
    assert body["looseEnds"]["units"] == []


def test_a_call_left_assigned_is_a_loose_end(client, roles):
    """It either never happened or never got recorded — both need a human."""
    call = mk_call(status="assigned")
    unit = mk_unit()
    db.session.add(CallAssignment(call_id=call.id, unit_id=unit.id, is_active=True))
    db.session.commit()

    loose = report(client, roles["supervisor"])["looseEnds"]["calls"]
    assert len(loose) == 1
    assert loose[0]["id"] == call.id
    assert loose[0]["reason"] == "Assigned but never completed"


def test_a_call_nobody_ever_took_is_a_loose_end(client, roles):
    mk_call(status="new")
    loose = report(client, roles["supervisor"])["looseEnds"]["calls"]
    assert loose[0]["reason"] == "Never assigned to a unit"


def test_an_assigned_status_with_no_assignment_row_is_named_as_the_contradiction(client, roles):
    """Saying "never assigned" about a call marked assigned reads as though the
    status were simply wrong; the point is that the two disagree."""
    mk_call(status="assigned")
    loose = report(client, roles["supervisor"])["looseEnds"]["calls"]
    assert loose[0]["reason"] == "Marked assigned but no unit is linked"


def test_a_shift_never_marked_complete_is_a_loose_end(client, roles):
    mk_unit(shift_status="active", actual_end=None)
    loose = report(client, roles["supervisor"])["looseEnds"]["units"]
    assert len(loose) == 1
    assert loose[0]["reason"] == "Shift never marked complete"


def test_a_completed_shift_with_no_actual_end_time_is_still_a_loose_end(client, roles):
    """It cannot be paid accurately, so completed is not enough on its own."""
    mk_unit(shift_status="completed", actual_end=None)
    loose = report(client, roles["supervisor"])["looseEnds"]["units"]
    assert loose[0]["reason"] == "No actual end time recorded"


def test_an_empty_day_reports_cleanly(client, roles):
    body = report(client, roles["supervisor"])
    assert body["summary"]["callsTotal"] == 0
    assert body["closure"] is None


# ── Closing ─────────────────────────────────────────────────────────────────

def test_closing_a_tidy_day_records_who_and_a_snapshot(client, roles):
    mk_call(status="completed")
    mk_unit()

    resp = close(client, roles["supervisor"], notes="Quiet day")
    assert resp.status_code == 201

    body = resp.get_json()
    assert body["closedByName"] == "Close Supervisor"
    assert body["notes"] == "Quiet day"
    assert body["snapshot"]["callsCompleted"] == 1
    assert body["closedAt"]


def test_a_day_with_loose_ends_is_not_closed_by_accident(client, roles):
    mk_call(status="assigned")

    resp = close(client, roles["supervisor"])
    assert resp.status_code == 409
    assert resp.get_json()["requiresAcknowledgement"] is True
    assert resp.get_json()["looseEnds"]["calls"]


def test_loose_ends_can_be_closed_over_deliberately(client, roles):
    """Sometimes the answer really is: the crew went home, reconcile on Monday."""
    mk_call(status="assigned")

    resp = close(client, roles["supervisor"], acknowledgeLooseEnds=True,
                 notes="Crew went home, reconciling Monday")
    assert resp.status_code == 201
    # The snapshot preserves that it was closed with something outstanding.
    assert resp.get_json()["snapshot"]["callsUnfinished"] == 1


def test_the_snapshot_does_not_change_when_the_day_is_edited_afterwards(client, roles):
    """The handoff has to keep saying what was true when it was signed."""
    call = mk_call(status="completed")
    close(client, roles["supervisor"])

    call.status = "cancelled"
    db.session.commit()

    body = report(client, roles["supervisor"])["closure"]
    assert body["snapshot"]["callsCompleted"] == 1
    assert body["snapshot"]["callsCancelled"] == 0


def test_a_day_cannot_be_closed_twice(client, roles):
    close(client, roles["supervisor"])
    assert close(client, roles["supervisor"]).status_code == 409


def test_a_future_day_cannot_be_closed(client, roles):
    resp = close(client, roles["supervisor"], day=TOMORROW)
    assert resp.status_code == 409
    assert "has not started yet" in resp.get_json()["error"]


def test_today_can_be_closed_at_the_end_of_the_shift(client, roles):
    assert close(client, roles["supervisor"], day=TODAY).status_code == 201


def test_an_impossible_date_is_rejected(client, roles):
    assert close(client, roles["supervisor"], day="2026-02-30").status_code == 400


# ── Permissions ─────────────────────────────────────────────────────────────

def test_a_dispatcher_can_read_the_report_but_not_close(client, roles):
    assert client.get(f"/api/operations/days/{YESTERDAY}", headers=roles["dispatcher"]).status_code == 200
    assert close(client, roles["dispatcher"]).status_code == 403


def test_hr_has_no_access_to_operational_days(client, roles):
    assert client.get(f"/api/operations/days/{YESTERDAY}", headers=roles["hr"]).status_code == 403


def test_only_an_admin_can_reopen_a_day(client, roles):
    close(client, roles["supervisor"])

    assert client.delete(f"/api/operations/days/{YESTERDAY}/close",
                         headers=roles["supervisor"]).status_code == 403
    assert client.delete(f"/api/operations/days/{YESTERDAY}/close",
                         headers=roles["admin"]).status_code == 200
    assert OperationalDayClosure.query.filter_by(day=YESTERDAY).first() is None


def test_reopening_a_day_that_is_not_closed_is_a_404(client, roles):
    assert client.delete(f"/api/operations/days/{YESTERDAY}/close",
                         headers=roles["admin"]).status_code == 404


def test_the_history_lists_closed_days_newest_first(client, roles):
    close(client, roles["supervisor"], day=YESTERDAY)
    close(client, roles["supervisor"], day=TODAY)

    days = [c["day"] for c in client.get("/api/operations/days", headers=roles["dispatcher"]).get_json()]
    assert days == [TODAY, YESTERDAY]
