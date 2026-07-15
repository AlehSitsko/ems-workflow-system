"""Backend enforcement of the Planning / Live / History operational date modes.

These are backend rules, not frontend affordances — every test here drives the
API directly, bypassing any disabled button.
"""

from datetime import date, timedelta

import pytest
from werkzeug.security import generate_password_hash

from models import db, User, Call, DailyCrewUnit, CallAssignment
from utils.operational_dates import (
    parse_operational_date, operational_mode, PLANNING, LIVE, HISTORY,
)

TODAY = date.today().isoformat()
FUTURE = (date.today() + timedelta(days=7)).isoformat()
FUTURE2 = (date.today() + timedelta(days=8)).isoformat()
PAST = (date.today() - timedelta(days=7)).isoformat()


@pytest.fixture()
def roles(app):
    headers = {}
    for role in ("admin", "supervisor", "dispatcher", "hr"):
        user = User(username=f"dm_{role}", password_hash=generate_password_hash("pw"),
                    display_name=f"DM {role}", role=role, is_active=True)
        db.session.add(user)
        db.session.flush()
        headers[role] = {"X-User-Id": str(user.id), "X-User-Role": role, "X-User-Name": user.display_name}
    db.session.commit()
    return headers


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
    return client.post("/api/dispatch/assign",
                       json={"call_id": call.id, "unit_id": unit.id},
                       headers=roles["dispatcher"])


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

def test_invalid_board_date_rejected(client):
    assert client.get("/api/dispatch/board?date=2026-99-99").status_code == 400
    assert client.get("/api/dispatch/board?date=2026-02-30").status_code == 400
    assert client.get("/api/dispatch/board?date=garbage").status_code == 400


def test_leap_day_board_accepted(client):
    resp = client.get("/api/dispatch/board?date=2028-02-29")
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


# ── Live lifecycle is today-only ─────────────────────────────────────────────

def test_future_completion_rejected(client, roles):
    aid = assign(client, roles, mk_call(FUTURE), mk_unit(FUTURE)).get_json()["id"]
    resp = client.patch(f"/api/dispatch/assign/{aid}/complete", headers=roles["dispatcher"])
    assert resp.status_code == 409


def test_future_reopen_rejected(client, roles):
    aid = assign(client, roles, mk_call(FUTURE), mk_unit(FUTURE)).get_json()["id"]
    resp = client.patch(f"/api/dispatch/assign/{aid}/reopen", headers=roles["dispatcher"])
    assert resp.status_code == 409


def test_past_complete_reopen_unassign_rejected(client, roles):
    call, unit = mk_call(PAST), mk_unit(PAST)
    a = mk_assignment(call, unit)
    assert client.patch(f"/api/dispatch/assign/{a.id}/complete", headers=roles["dispatcher"]).status_code == 409
    assert client.patch(f"/api/dispatch/assign/{a.id}/reopen", headers=roles["dispatcher"]).status_code == 409
    assert client.delete(f"/api/dispatch/assign/{a.id}", headers=roles["dispatcher"]).status_code == 409


def test_past_queue_update_rejected(client, roles):
    unit = mk_unit(PAST)
    resp = client.patch(f"/api/dispatch/units/{unit.id}/call-order",
                        json={"callIds": [1, 2]}, headers=roles["dispatcher"])
    assert resp.status_code == 409


def test_past_unit_status_rejected(client, roles):
    unit = mk_unit(PAST)
    resp = client.patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"}, headers=roles["dispatcher"])
    assert resp.status_code == 409


def test_future_unit_status_rejected(client, roles):
    unit = mk_unit(FUTURE)
    resp = client.patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"}, headers=roles["dispatcher"])
    assert resp.status_code == 409


# ── Crew shifts + pickup time ────────────────────────────────────────────────

def test_past_crew_shift_create_rejected(client, roles):
    resp = client.post("/api/crew-units", headers=roles["dispatcher"], json={
        "shiftDate": PAST, "unitType": "BLS", "truckNumber": "77", "startTime": "08:00",
    })
    assert resp.status_code == 409


def test_past_crew_shift_update_and_delete_rejected(client, roles):
    unit = mk_unit(PAST, truck_number="78")
    upd = client.put(f"/api/crew-units/{unit.id}", headers=roles["dispatcher"], json={
        "shiftDate": PAST, "unitType": "BLS", "truckNumber": "78", "startTime": "09:00",
    })
    assert upd.status_code == 409
    assert client.delete(f"/api/crew-units/{unit.id}", headers=roles["dispatcher"]).status_code == 409


def test_past_make_night_rejected(client, roles):
    unit = mk_unit(PAST, truck_number="79")
    resp = client.post(f"/api/crew-units/{unit.id}/make-night", headers=roles["dispatcher"], json={})
    assert resp.status_code == 409


def test_past_pickup_time_change_rejected(client, roles):
    call = mk_call(PAST)
    resp = client.patch(f"/api/calls/{call.id}/pickup-time",
                        json={"pickup_time": "11:00"}, headers=roles["dispatcher"])
    assert resp.status_code == 409


def test_future_crew_shift_create_allowed(client, roles):
    resp = client.post("/api/crew-units", headers=roles["dispatcher"], json={
        "shiftDate": FUTURE, "unitType": "BLS", "truckNumber": "80", "startTime": "08:00",
    })
    assert resp.status_code == 201


# ── Live workflow regression — the whole loop still works today ──────────────

def test_live_workflow_unchanged(client, roles):
    call, unit = mk_call(TODAY), mk_unit(TODAY, truck_number="12")

    created = assign(client, roles, call, unit)
    assert created.status_code == 201
    aid = created.get_json()["id"]

    assert client.patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"}, headers=roles["dispatcher"]).status_code == 200
    assert client.patch(f"/api/dispatch/units/{unit.id}/call-order",
                        json={"callIds": [call.id]}, headers=roles["dispatcher"]).status_code == 200
    assert client.patch(f"/api/calls/{call.id}/pickup-time",
                        json={"pickup_time": "11:30"}, headers=roles["dispatcher"]).status_code == 200
    assert client.patch(f"/api/dispatch/assign/{aid}/complete", headers=roles["dispatcher"]).status_code == 200
    assert db.session.get(Call, call.id).status == "completed"
    assert client.patch(f"/api/dispatch/assign/{aid}/reopen", headers=roles["dispatcher"]).status_code == 200
    assert client.delete(f"/api/dispatch/assign/{aid}", headers=roles["dispatcher"]).status_code == 200
