"""Optimistic-concurrency invariant on dispatch assignment.

The assign endpoint takes an optional `expected_assignment_id` (compare-and-swap): if
the call's current active assignment no longer matches what the caller's screen showed,
the write is refused with `409 assignment_conflict` instead of silently overwriting
another dispatcher's assignment (a lost update). Reproducible without threads or
PostgreSQL — the "stale view" is simulated by sending a now-wrong expected id.
The end-to-end version lives in e2e/dispatch.spec.js; this pins the server contract.
"""
import json
from datetime import datetime


def _today():
    return datetime.now().strftime("%Y-%m-%d")


def _vehicle(number):
    from models import db, Vehicle
    v = Vehicle(unit_name=f"Ambu {number}", unit_number=number, unit_type="ALS",
                is_retired=False, capabilities=json.dumps(["ALS", "BLS"]))
    db.session.add(v)
    db.session.commit()
    return v


def _unit(vehicle, truck):
    from models import db, DailyCrewUnit
    u = DailyCrewUnit(shift_date=_today(), unit_type="ALS", truck_number=truck,
                      start_time="08:00", end_time="20:00", vehicle_id=vehicle.id)
    db.session.add(u)
    db.session.commit()
    return u


def _call():
    from models import db, Call
    c = Call(trip_date=_today(), service_level="ALS", status="new",
             pickup_time="10:00", call_type="scheduled")
    db.session.add(c)
    db.session.commit()
    return c


def test_stale_reassignment_is_rejected_and_the_original_survives(clients):
    api = clients["dispatcher"]
    call = _call()
    unit1 = _unit(_vehicle("V1"), "10")
    unit2 = _unit(_vehicle("V2"), "20")

    # A assigns the call to unit1.
    a = api.post("/api/dispatch/assign", json={"call_id": call.id, "unit_id": unit1.id})
    assert a.status_code == 201
    a_id = a.get_json()["id"]

    # B still sees the call as unassigned and tries to grab it for unit2 with
    # expected_assignment_id=None -> conflict, not a silent overwrite.
    b = api.post("/api/dispatch/assign",
                 json={"call_id": call.id, "unit_id": unit2.id, "expected_assignment_id": None})
    assert b.status_code == 409
    assert b.get_json().get("code") == "assignment_conflict"

    # A's assignment is untouched.
    board = api.get(f"/api/dispatch/board?date={_today()}").get_json()
    u1 = next(u for u in board["units"] if u["id"] == unit1.id)
    assert any(c["id"] == call.id for c in u1["assignedCalls"])

    # B reloads (now sees the real assignment) and reassigns with the correct expected
    # id -> succeeds. A's old expected id is now stale, so A cannot overwrite either.
    b2 = api.post("/api/dispatch/assign",
                  json={"call_id": call.id, "unit_id": unit2.id, "expected_assignment_id": a_id})
    assert b2.status_code == 201

    a2 = api.post("/api/dispatch/assign",
                  json={"call_id": call.id, "unit_id": unit1.id, "expected_assignment_id": a_id})
    assert a2.status_code == 409


def test_assign_without_expected_id_stays_backward_compatible(clients):
    """Callers that omit expected_assignment_id keep last-writer-wins (unchanged API)."""
    api = clients["dispatcher"]
    call = _call()
    unit1 = _unit(_vehicle("W1"), "30")
    unit2 = _unit(_vehicle("W2"), "40")

    assert api.post("/api/dispatch/assign", json={"call_id": call.id, "unit_id": unit1.id}).status_code == 201
    # No expected id -> allowed to reassign (no optimistic check requested).
    assert api.post("/api/dispatch/assign", json={"call_id": call.id, "unit_id": unit2.id}).status_code == 201
