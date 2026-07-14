"""Tests for the unified calendar events API and the Dispatch Board date-mode
guard (planning/live/history)."""

from datetime import date, datetime, timedelta

import pytest
from werkzeug.security import generate_password_hash

from models import db, User, Employee, Patient, Call, DailyCrewUnit, CallAssignment


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture()
def employees(app):
    emps = []
    for i in range(3):
        e = Employee(first_name=f"Crew{i}", last_name=f"Member{i}", role="EMT")
        db.session.add(e)
        emps.append(e)
    db.session.commit()
    return emps


@pytest.fixture()
def roles(app):
    """One User per role → ready-to-send auth header dicts."""
    headers = {}
    for role in ("admin", "supervisor", "dispatcher", "hr"):
        user = User(
            username=f"test_{role}",
            password_hash=generate_password_hash("pw"),
            display_name=f"Test {role.title()}",
            role=role,
            is_active=True,
        )
        db.session.add(user)
        db.session.flush()
        headers[role] = {"X-User-Id": str(user.id), "X-User-Role": role, "X-User-Name": user.display_name}
    db.session.commit()
    return headers


TODAY = date.today().isoformat()
FUTURE = (date.today() + timedelta(days=7)).isoformat()
PAST = (date.today() - timedelta(days=7)).isoformat()


def mk_patient(first="John", last="Doe"):
    p = Patient(first_name=first, last_name=last)
    db.session.add(p)
    db.session.commit()
    return p


def mk_call(trip_date=FUTURE, status="new", service_level="BLS",
            pickup_time="10:00", call_type="scheduled", patient_id=None):
    c = Call(
        trip_date=trip_date, status=status, service_level=service_level,
        pickup_time=pickup_time, call_type=call_type, patient_id=patient_id,
    )
    db.session.add(c)
    db.session.commit()
    return c


def mk_unit(shift_date=FUTURE, unit_type="BLS", truck_number="12",
            start_time="08:00", end_time="20:00", crew=None):
    u = DailyCrewUnit(
        shift_date=shift_date, unit_type=unit_type, truck_number=truck_number,
        start_time=start_time, end_time=end_time,
    )
    crew = crew or []
    slots = ["driver_id", "medical_id", "assist1_id", "assist2_id"]
    for slot, emp in zip(slots, crew):
        setattr(u, slot, emp.id)
    db.session.add(u)
    db.session.commit()
    return u


def events_of_type(payload, type_):
    return [e for e in payload["events"] if e["type"] == type_]


# ── Range validation ─────────────────────────────────────────────────────────

def test_missing_range_returns_400(client, roles):
    assert client.get("/api/calendar/events", headers=roles["admin"]).status_code == 400
    assert client.get(f"/api/calendar/events?start={TODAY}", headers=roles["admin"]).status_code == 400


def test_invalid_dates_return_400(client, roles):
    resp = client.get("/api/calendar/events?start=2026-13-40&end=2026-13-41", headers=roles["admin"])
    assert resp.status_code == 400


def test_reversed_range_returns_400(client, roles):
    resp = client.get(f"/api/calendar/events?start={FUTURE}&end={TODAY}", headers=roles["admin"])
    assert resp.status_code == 400


def test_excessive_range_returns_400(client, roles):
    far = (date.today() + timedelta(days=200)).isoformat()
    resp = client.get(f"/api/calendar/events?start={TODAY}&end={far}", headers=roles["admin"])
    assert resp.status_code == 400


def test_empty_range_returns_empty_payload(client, roles):
    resp = client.get(f"/api/calendar/events?start={TODAY}&end={TODAY}", headers=roles["admin"])
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["events"] == []
    assert body["days"] == {}


# ── Calls & crew units in range ──────────────────────────────────────────────

def test_calls_in_range_returned_outside_excluded(client, roles):
    mk_call(trip_date=FUTURE)
    mk_call(trip_date=(date.today() + timedelta(days=60)).isoformat())  # outside a tight window
    resp = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["admin"])
    calls = events_of_type(resp.get_json(), "scheduled_call")
    assert len(calls) == 1
    assert calls[0]["date"] == FUTURE


def test_crew_units_returned(client, roles, employees):
    mk_unit(shift_date=FUTURE, crew=employees[:2])
    resp = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["admin"])
    crew = events_of_type(resp.get_json(), "crew_shift")
    assert len(crew) == 1
    assert crew[0]["title"].startswith("Unit 12")
    assert crew[0]["metadata"]["crewComplete"] is True


def test_cancelled_and_completed_statuses(client, roles):
    mk_call(trip_date=FUTURE, status="cancelled")
    mk_call(trip_date=FUTURE, status="completed")
    resp = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["admin"])
    statuses = {e["status"] for e in events_of_type(resp.get_json(), "scheduled_call")}
    assert statuses == {"cancelled", "completed"}


def test_assignment_information_present(client, roles):
    call = mk_call(trip_date=FUTURE, status="assigned")
    unit = mk_unit(shift_date=FUTURE, truck_number="7")
    db.session.add(CallAssignment(call_id=call.id, unit_id=unit.id, is_active=True))
    db.session.commit()
    resp = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["admin"])
    ev = events_of_type(resp.get_json(), "scheduled_call")[0]
    assert ev["status"] == "assigned"
    assert ev["assignedUnitId"] == unit.id
    assert ev["assignedUnitNumber"] == "7"
    assert ev["metadata"]["isAssigned"] is True


# ── Day summaries ────────────────────────────────────────────────────────────

def test_day_summary_counts(client, roles):
    call = mk_call(trip_date=FUTURE, status="assigned")
    unit = mk_unit(shift_date=FUTURE, truck_number="7")
    db.session.add(CallAssignment(call_id=call.id, unit_id=unit.id, is_active=True))
    mk_call(trip_date=FUTURE, status="new")  # unassigned
    db.session.commit()
    body = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["admin"]).get_json()
    day = body["days"][FUTURE]
    assert day["callsTotal"] == 2
    assert day["callsAssigned"] == 1
    assert day["callsUnassigned"] == 1
    assert day["unitsTotal"] == 1


def test_unassigned_call_marks_day_warning(client, roles):
    mk_call(trip_date=FUTURE, status="new")
    body = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["admin"]).get_json()
    day = body["days"][FUTURE]
    assert day["callsUnassigned"] == 1
    assert day["warningCount"] >= 1
    assert day["readiness"] == "warning"


def test_incomplete_unit_marks_day_warning(client, roles, employees):
    mk_unit(shift_date=FUTURE, crew=employees[:1])  # only 1 of 2 required
    body = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["admin"]).get_json()
    day = body["days"][FUTURE]
    assert day["unitsIncomplete"] == 1
    assert day["readiness"] == "warning"


def test_als_call_on_bls_unit_is_critical(client, roles):
    call = mk_call(trip_date=FUTURE, status="assigned", service_level="ALS")
    unit = mk_unit(shift_date=FUTURE, unit_type="BLS")
    db.session.add(CallAssignment(call_id=call.id, unit_id=unit.id, is_active=True))
    db.session.commit()
    body = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["admin"]).get_json()
    day = body["days"][FUTURE]
    assert day["criticalCount"] >= 1
    assert day["readiness"] == "critical"


def test_ready_day_has_ready_readiness(client, roles, employees):
    call = mk_call(trip_date=FUTURE, status="assigned")
    unit = mk_unit(shift_date=FUTURE, crew=employees[:2])
    db.session.add(CallAssignment(call_id=call.id, unit_id=unit.id, is_active=True))
    db.session.commit()
    body = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["admin"]).get_json()
    assert body["days"][FUTURE]["readiness"] == "ready"


# ── Role filtering ───────────────────────────────────────────────────────────

def test_unknown_role_is_forbidden(client):
    resp = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers={"X-User-Role": "ghost"})
    assert resp.status_code == 403


def test_hr_gets_no_call_events_or_phi(client, roles, employees):
    p = mk_patient("Jane", "Smith")
    mk_call(trip_date=FUTURE, status="new", patient_id=p.id)
    mk_unit(shift_date=FUTURE, crew=employees[:2])
    body = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["hr"]).get_json()
    assert events_of_type(body, "scheduled_call") == []          # no operational calls
    assert len(events_of_type(body, "crew_shift")) == 1          # crew visible
    day = body["days"][FUTURE]
    assert day["callsTotal"] == 0                                # call ops not surfaced to HR
    # No PHI anywhere in the serialized payload.
    import json
    assert "Jane" not in json.dumps(body) and "Smith" not in json.dumps(body)


def test_dispatcher_gets_minimized_patient_label(client, roles):
    p = mk_patient("John", "Doe")
    mk_call(trip_date=FUTURE, status="new", patient_id=p.id)
    body = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["dispatcher"]).get_json()
    ev = events_of_type(body, "scheduled_call")[0]
    assert ev["metadata"]["patientLabel"] == "John D."   # minimized, never full last name


def test_call_event_contract_is_stable(client, roles):
    mk_call(trip_date=FUTURE, status="new")
    body = client.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}", headers=roles["admin"]).get_json()
    ev = events_of_type(body, "scheduled_call")[0]
    for key in ("id", "type", "title", "date", "start", "end", "allDay", "status",
                "severity", "source", "sourceId", "assignedUnitId", "assignedUnitNumber",
                "link", "metadata"):
        assert key in ev
    assert ev["id"] == f"call:{ev['sourceId']}"
    assert ev["link"].startswith("/dispatch?date=")


# ── Dispatch Board date modes (planning / live / history) ────────────────────

def _mk_today_unit(truck="99"):
    return mk_unit(shift_date=TODAY, truck_number=truck)


def test_future_date_allows_planning_assignment(client, roles):
    call = mk_call(trip_date=FUTURE, status="new")
    unit = mk_unit(shift_date=FUTURE, truck_number="21")
    resp = client.post("/api/dispatch/assign",
                       json={"call_id": call.id, "unit_id": unit.id},
                       headers=roles["dispatcher"])
    assert resp.status_code == 201
    assert db.session.get(Call, call.id).status == "assigned"


def test_future_date_rejects_live_status_transition(client, roles):
    unit = mk_unit(shift_date=FUTURE, truck_number="22")
    resp = client.patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"}, headers=roles["dispatcher"])
    assert resp.status_code == 409
    assert db.session.get(DailyCrewUnit, unit.id).dispatch_status == "available"


def test_today_allows_live_status_transition(client, roles):
    unit = _mk_today_unit()
    resp = client.patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"}, headers=roles["dispatcher"])
    assert resp.status_code == 200
    assert db.session.get(DailyCrewUnit, unit.id).dispatch_status == "en_route"


def test_past_date_rejects_status_transition(client, roles):
    unit = mk_unit(shift_date=PAST, truck_number="23")
    resp = client.patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"}, headers=roles["dispatcher"])
    assert resp.status_code == 409


def test_existing_board_endpoint_unchanged(client, roles):
    mk_call(trip_date=TODAY, status="new")
    _mk_today_unit(truck="50")
    body = client.get(f"/api/dispatch/board?date={TODAY}").get_json()
    assert "openCalls" in body and "units" in body
    assert body["date"] == TODAY
    assert len(body["units"]) == 1
