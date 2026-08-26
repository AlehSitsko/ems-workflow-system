"""Backend enforcement of the Planning / Live / History operational date modes.

These are backend rules, not frontend affordances — every test here drives the
API directly, bypassing any disabled button.
"""

from datetime import date, timedelta

import pytest

from models import db, Call, DailyCrewUnit, CallAssignment
from utils.operational_dates import (
    parse_operational_date, operational_mode, PLANNING, LIVE, HISTORY,
)

TODAY = date.today().isoformat()
FUTURE = (date.today() + timedelta(days=7)).isoformat()
FUTURE2 = (date.today() + timedelta(days=8)).isoformat()
PAST = (date.today() - timedelta(days=7)).isoformat()


@pytest.fixture()
def roles(app, request):
    """A signed-in client per role.

    Identity is a session cookie now, so a test signs in for real rather than
    asserting a role in a header — which means these tests also exercise the
    authentication path itself.
    """
    from conftest import make_user, login

    out = {}
    prefix = request.node.module.__name__.rsplit(".", 1)[-1]
    for role in ("admin", "supervisor", "dispatcher", "hr"):
        user = make_user(role, username=f"{prefix}_{role}")
        c = app.test_client()
        login(c, user.username)
        out[role] = c
    return out


def mk_call(trip_date, status="new", service_level="BLS", pickup_time="10:00"):
    c = Call(trip_date=trip_date, status=status, service_level=service_level,
             pickup_time=pickup_time, call_type="scheduled")
    db.session.add(c)
    db.session.commit()
    return c


def mk_unit(shift_date, truck_number="10"):
    u = DailyCrewUnit(shift_date=shift_date, unit_type="BLS", truck_number=truck_number,
                      start_time="08:00", end_time="20:00")
    db.session.add(u)
    db.session.commit()
    return u


def mk_assignment(call, unit, active=True):
    """Insert an assignment directly — used to stage history the API won't create."""
    a = CallAssignment(call_id=call.id, unit_id=unit.id, is_active=active, assigned_at="2026-01-01T00:00:00")
    db.session.add(a)
    db.session.commit()
    return a


def assign(client, roles, call, unit):
    return roles["dispatcher"].post("/api/dispatch/assign",
                       json={"call_id": call.id, "unit_id": unit.id})


# ── Helper unit tests ────────────────────────────────────────────────────────

def test_parse_operational_date_rejects_impossible_dates():
    assert parse_operational_date("2026-99-99") is None
    assert parse_operational_date("2026-02-30") is None
    assert parse_operational_date("not-a-date") is None
    assert parse_operational_date("") is None
    assert parse_operational_date(None) is None


def test_parse_operational_date_accepts_leap_day():
    assert parse_operational_date("2028-02-29") == date(2028, 2, 29)
    assert parse_operational_date("2027-02-29") is None  # not a leap year


def test_operational_mode_classifies_relative_to_local_today():
    ref = date(2026, 7, 14)
    assert operational_mode("2026-07-14", ref) == LIVE
    assert operational_mode("2026-07-15", ref) == PLANNING
    assert operational_mode("2026-07-13", ref) == HISTORY
    assert operational_mode("2026-99-99", ref) is None


# ── Board date validation ────────────────────────────────────────────────────

def test_invalid_board_date_rejected(roles):
    dispatcher = roles["dispatcher"]
    assert dispatcher.get("/api/dispatch/board?date=2026-99-99").status_code == 400
    assert dispatcher.get("/api/dispatch/board?date=2026-02-30").status_code == 400
    assert dispatcher.get("/api/dispatch/board?date=garbage").status_code == 400


def test_leap_day_board_accepted(client, roles):
    resp = roles["dispatcher"].get("/api/dispatch/board?date=2028-02-29")
    assert resp.status_code == 200
    assert resp.get_json()["date"] == "2028-02-29"


# ── Assignment rules ─────────────────────────────────────────────────────────

def test_future_planning_assignment_allowed(client, roles):
    resp = assign(client, roles, mk_call(FUTURE), mk_unit(FUTURE))
    assert resp.status_code == 201


def test_past_assignment_rejected(client, roles):
    resp = assign(client, roles, mk_call(PAST), mk_unit(PAST))
    assert resp.status_code == 409
    assert "past" in resp.get_json()["error"].lower()


def test_cross_date_assignment_rejected(client, roles):
    resp = assign(client, roles, mk_call(FUTURE), mk_unit(FUTURE2, truck_number="11"))
    assert resp.status_code == 409
    assert "cross-date" in resp.get_json()["error"].lower()


def test_completed_call_cannot_be_assigned(client, roles):
    resp = assign(client, roles, mk_call(FUTURE, status="completed"), mk_unit(FUTURE))
    assert resp.status_code == 409
    assert "completed" in resp.get_json()["error"].lower()


def test_cancelled_call_cannot_be_assigned(client, roles):
    resp = assign(client, roles, mk_call(FUTURE, status="cancelled"), mk_unit(FUTURE))
    assert resp.status_code == 409


def test_cancelling_assigned_call_releases_its_unit_assignment(client, roles):
    """D1 regression: cancelling a dispatched call must deactivate its active
    assignment, so the crew unit stops carrying the cancelled trip (it belongs in
    the cancelled bucket only, not on the unit)."""
    call, unit = mk_call(TODAY), mk_unit(TODAY)
    aid = assign(client, roles, call, unit).get_json()["id"]
    assert CallAssignment.query.filter_by(call_id=call.id, is_active=True).count() == 1

    resp = roles["dispatcher"].patch(f"/api/calls/{call.id}/cancel",
                                     json={"cancel_reason": "Patient admitted overnight"})
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "cancelled"

    # Assignment is released (deactivated, not deleted — the row stays for history).
    assert CallAssignment.query.filter_by(call_id=call.id, is_active=True).count() == 0
    assert CallAssignment.query.filter_by(id=aid).one().is_active is False

    # And the board reflects it: the unit no longer lists the call; it appears
    # only in the cancelled bucket.
    board = roles["dispatcher"].get(f"/api/dispatch/board?date={TODAY}").get_json()
    row = next(u for u in board["units"] if u["id"] == unit.id)
    assert call.id not in [c["id"] for c in row["assignedCalls"]]
    assert call.id in [c["id"] for c in board["cancelledCalls"]]


def test_completed_list_dedupes_a_call_assigned_more_than_once(client, roles):
    """D4 regression: a call with several historical assignments on one unit (it
    was reassigned before completion) is listed once in the unit's completedCalls,
    not once per assignment row — keeping the latest assignment."""
    call, unit = mk_call(TODAY), mk_unit(TODAY)
    # Two prior inactive assignments + one active, all on the same unit.
    mk_assignment(call, unit, active=False)
    mk_assignment(call, unit, active=False)
    aid = assign(client, roles, call, unit).get_json()["id"]

    # Complete via the active assignment → call.status becomes "completed".
    assert roles["dispatcher"].patch(
        f"/api/dispatch/assign/{aid}/complete").status_code == 200

    board = roles["dispatcher"].get(f"/api/dispatch/board?date={TODAY}").get_json()
    row = next(u for u in board["units"] if u["id"] == unit.id)
    completed_ids = [c["id"] for c in row["completedCalls"]]
    assert completed_ids.count(call.id) == 1
    # The surviving entry is the latest assignment.
    entry = next(c for c in row["completedCalls"] if c["id"] == call.id)
    assert entry["assignment_id"] == aid


# ── Live lifecycle is today-only ─────────────────────────────────────────────

def test_future_completion_rejected(client, roles):
    aid = assign(client, roles, mk_call(FUTURE), mk_unit(FUTURE)).get_json()["id"]
    resp = roles["dispatcher"].patch(f"/api/dispatch/assign/{aid}/complete")
    assert resp.status_code == 409


def test_future_reopen_rejected(client, roles):
    aid = assign(client, roles, mk_call(FUTURE), mk_unit(FUTURE)).get_json()["id"]
    resp = roles["dispatcher"].patch(f"/api/dispatch/assign/{aid}/reopen")
    assert resp.status_code == 409


def test_past_complete_reopen_unassign_rejected(client, roles):
    call, unit = mk_call(PAST), mk_unit(PAST)
    a = mk_assignment(call, unit)
    assert roles["dispatcher"].patch(f"/api/dispatch/assign/{a.id}/complete").status_code == 409
    assert roles["dispatcher"].patch(f"/api/dispatch/assign/{a.id}/reopen").status_code == 409
    assert roles["dispatcher"].delete(f"/api/dispatch/assign/{a.id}").status_code == 409


def test_past_queue_update_rejected(client, roles):
    unit = mk_unit(PAST)
    resp = roles["dispatcher"].patch(f"/api/dispatch/units/{unit.id}/call-order",
                        json={"callIds": [1, 2]})
    assert resp.status_code == 409


def test_past_unit_status_rejected(client, roles):
    unit = mk_unit(PAST)
    resp = roles["dispatcher"].patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"})
    assert resp.status_code == 409


def test_future_unit_status_rejected(client, roles):
    unit = mk_unit(FUTURE)
    resp = roles["dispatcher"].patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"})
    assert resp.status_code == 409


# ── Crew shifts + pickup time ────────────────────────────────────────────────

def test_past_crew_shift_create_rejected(client, roles):
    resp = roles["dispatcher"].post("/api/crew-units",  json={
        "shiftDate": PAST, "unitType": "BLS", "truckNumber": "77", "startTime": "08:00",
    })
    assert resp.status_code == 409


def test_past_crew_shift_update_and_delete_rejected(client, roles):
    unit = mk_unit(PAST, truck_number="78")
    upd = roles["dispatcher"].put(f"/api/crew-units/{unit.id}",  json={
        "shiftDate": PAST, "unitType": "BLS", "truckNumber": "78", "startTime": "09:00",
    })
    assert upd.status_code == 409
    assert roles["dispatcher"].delete(f"/api/crew-units/{unit.id}").status_code == 409


def test_past_make_night_rejected(client, roles):
    unit = mk_unit(PAST, truck_number="79")
    resp = roles["dispatcher"].post(f"/api/crew-units/{unit.id}/make-night",  json={})
    assert resp.status_code == 409


def test_past_pickup_time_change_rejected(client, roles):
    call = mk_call(PAST)
    resp = roles["dispatcher"].patch(f"/api/calls/{call.id}/pickup-time",
                        json={"pickup_time": "11:00"})
    assert resp.status_code == 409


def test_future_crew_shift_create_allowed(client, roles):
    resp = roles["dispatcher"].post("/api/crew-units",  json={
        "shiftDate": FUTURE, "unitType": "BLS", "truckNumber": "80", "startTime": "08:00",
    })
    assert resp.status_code == 201


# ── Live workflow regression — the whole loop still works today ──────────────

def test_live_workflow_unchanged(client, roles):
    call, unit = mk_call(TODAY), mk_unit(TODAY, truck_number="12")

    created = assign(client, roles, call, unit)
    assert created.status_code == 201
    aid = created.get_json()["id"]

    assert roles["dispatcher"].patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"}).status_code == 200
    assert roles["dispatcher"].patch(f"/api/dispatch/units/{unit.id}/call-order",
                        json={"callIds": [call.id]}).status_code == 200
    assert roles["dispatcher"].patch(f"/api/calls/{call.id}/pickup-time",
                        json={"pickup_time": "11:30"}).status_code == 200
    assert roles["dispatcher"].patch(f"/api/dispatch/assign/{aid}/complete").status_code == 200
    assert db.session.get(Call, call.id).status == "completed"
    assert roles["dispatcher"].patch(f"/api/dispatch/assign/{aid}/reopen").status_code == 200
    assert roles["dispatcher"].delete(f"/api/dispatch/assign/{aid}").status_code == 200


# ── Optimistic concurrency: no silent overwrite of another dispatcher's assign ──

def test_stale_assign_conflicts_instead_of_overwriting(client, roles):
    """Two dispatchers, one call. The first assigns it; the second, on a stale
    screen that still shows it unassigned, must get a 409 conflict — not a silent
    overwrite of the first assignment."""
    call = mk_call(TODAY)
    unit_a = mk_unit(TODAY, truck_number="A1")
    unit_b = mk_unit(TODAY, truck_number="B2")

    r1 = roles["dispatcher"].post("/api/dispatch/assign",
        json={"call_id": call.id, "unit_id": unit_a.id, "expected_assignment_id": None})
    assert r1.status_code == 201, r1.get_json()

    r2 = roles["supervisor"].post("/api/dispatch/assign",
        json={"call_id": call.id, "unit_id": unit_b.id, "expected_assignment_id": None})
    assert r2.status_code == 409, r2.get_json()
    body = r2.get_json()
    assert body.get("code") == "assignment_conflict"
    assert "someone else" in body.get("error", "").lower()

    active = CallAssignment.query.filter_by(call_id=call.id, is_active=True).all()
    assert len(active) == 1 and active[0].unit_id == unit_a.id


def test_deliberate_reassign_with_matching_expected_id_succeeds(client, roles):
    """A real reassignment that knows the current assignment is allowed."""
    call = mk_call(TODAY)
    unit_a = mk_unit(TODAY, truck_number="A1")
    unit_b = mk_unit(TODAY, truck_number="B2")

    r1 = roles["dispatcher"].post("/api/dispatch/assign",
        json={"call_id": call.id, "unit_id": unit_a.id, "expected_assignment_id": None})
    aid = r1.get_json()["id"]

    r2 = roles["dispatcher"].post("/api/dispatch/assign",
        json={"call_id": call.id, "unit_id": unit_b.id, "expected_assignment_id": aid})
    assert r2.status_code == 201, r2.get_json()

    active = CallAssignment.query.filter_by(call_id=call.id, is_active=True).all()
    assert len(active) == 1 and active[0].unit_id == unit_b.id


def test_assign_without_expected_id_is_backward_compatible(client, roles):
    """Omitting expected_assignment_id keeps the previous last-write-wins path, so
    existing callers and tests are unaffected."""
    call = mk_call(TODAY)
    unit_a = mk_unit(TODAY, truck_number="A1")
    unit_b = mk_unit(TODAY, truck_number="B2")

    assert roles["dispatcher"].post("/api/dispatch/assign",
        json={"call_id": call.id, "unit_id": unit_a.id}).status_code == 201
    assert roles["dispatcher"].post("/api/dispatch/assign",
        json={"call_id": call.id, "unit_id": unit_b.id}).status_code == 201

    active = CallAssignment.query.filter_by(call_id=call.id, is_active=True).all()
    assert len(active) == 1 and active[0].unit_id == unit_b.id
