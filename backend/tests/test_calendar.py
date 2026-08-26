"""Tests for the unified calendar events API and the Dispatch Board date-mode
guard (planning/live/history)."""

from datetime import date, timedelta

import pytest

from models import db, Employee, Patient, Call, DailyCrewUnit, CallAssignment, Vehicle, Task


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


TODAY = date.today().isoformat()
FUTURE = (date.today() + timedelta(days=7)).isoformat()
PAST = (date.today() - timedelta(days=7)).isoformat()


def mk_patient(first="John", last="Doe", dob=None):
    p = Patient(first_name=first, last_name=last, dob=dob)
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
    assert roles["admin"].get("/api/calendar/events").status_code == 400
    assert roles["admin"].get(f"/api/calendar/events?start={TODAY}").status_code == 400


def test_invalid_dates_return_400(client, roles):
    resp = roles["admin"].get("/api/calendar/events?start=2026-13-40&end=2026-13-41")
    assert resp.status_code == 400


def test_reversed_range_returns_400(client, roles):
    resp = roles["admin"].get(f"/api/calendar/events?start={FUTURE}&end={TODAY}")
    assert resp.status_code == 400


def test_excessive_range_returns_400(client, roles):
    far = (date.today() + timedelta(days=200)).isoformat()
    resp = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={far}")
    assert resp.status_code == 400


def test_empty_range_returns_empty_payload(client, roles):
    resp = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={TODAY}")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["events"] == []
    assert body["days"] == {}


# ── Calls & crew units in range ──────────────────────────────────────────────

def test_calls_in_range_returned_outside_excluded(client, roles):
    mk_call(trip_date=FUTURE)
    mk_call(trip_date=(date.today() + timedelta(days=60)).isoformat())  # outside a tight window
    resp = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}")
    calls = events_of_type(resp.get_json(), "scheduled_call")
    assert len(calls) == 1
    assert calls[0]["date"] == FUTURE


def test_crew_units_returned(client, roles, employees):
    mk_unit(shift_date=FUTURE, crew=employees[:2])
    resp = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}")
    crew = events_of_type(resp.get_json(), "crew_shift")
    assert len(crew) == 1
    assert crew[0]["title"].startswith("Unit 12")
    assert crew[0]["metadata"]["crewComplete"] is True


def test_cancelled_and_completed_statuses(client, roles):
    mk_call(trip_date=FUTURE, status="cancelled")
    mk_call(trip_date=FUTURE, status="completed")
    resp = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}")
    statuses = {e["status"] for e in events_of_type(resp.get_json(), "scheduled_call")}
    assert statuses == {"cancelled", "completed"}


def test_assignment_information_present(client, roles):
    call = mk_call(trip_date=FUTURE, status="assigned")
    unit = mk_unit(shift_date=FUTURE, truck_number="7")
    db.session.add(CallAssignment(call_id=call.id, unit_id=unit.id, is_active=True))
    db.session.commit()
    resp = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}")
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
    body = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}").get_json()
    day = body["days"][FUTURE]
    assert day["callsTotal"] == 2
    assert day["callsAssigned"] == 1
    assert day["callsUnassigned"] == 1
    assert day["unitsTotal"] == 1


def test_unassigned_call_marks_day_warning(client, roles):
    mk_call(trip_date=FUTURE, status="new")
    body = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}").get_json()
    day = body["days"][FUTURE]
    assert day["callsUnassigned"] == 1
    assert day["warningCount"] >= 1
    assert day["readiness"] == "warning"


def test_incomplete_unit_marks_day_warning(client, roles, employees):
    mk_unit(shift_date=FUTURE, crew=employees[:1])  # only 1 of 2 required
    body = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}").get_json()
    day = body["days"][FUTURE]
    assert day["unitsIncomplete"] == 1
    assert day["readiness"] == "warning"


def test_als_call_on_bls_unit_is_critical(client, roles):
    call = mk_call(trip_date=FUTURE, status="assigned", service_level="ALS")
    unit = mk_unit(shift_date=FUTURE, unit_type="BLS")
    db.session.add(CallAssignment(call_id=call.id, unit_id=unit.id, is_active=True))
    db.session.commit()
    body = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}").get_json()
    day = body["days"][FUTURE]
    assert day["criticalCount"] >= 1
    assert day["readiness"] == "critical"


def test_capability_mismatch_from_the_vehicle_is_critical_with_a_reason(client, roles):
    import json
    v = Vehicle(unit_name="Van", unit_number="VC1", unit_type="ALS", is_retired=False,
                capabilities=json.dumps(["ALS", "BLS"]))   # capable, but not Bariatric
    db.session.add(v)
    db.session.commit()
    call = mk_call(trip_date=FUTURE, status="assigned", service_level="Bariatric")
    unit = mk_unit(shift_date=FUTURE, unit_type="ALS", truck_number="9")
    unit.vehicle_id = v.id
    db.session.add(CallAssignment(call_id=call.id, unit_id=unit.id, is_active=True))
    db.session.commit()

    body = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}").get_json()
    ev = next(e for e in body["events"]
              if e["type"] == "scheduled_call" and e["sourceId"] == call.id)
    assert ev["severity"] == "critical"
    assert ev["metadata"]["mismatchReason"] == "vehicle is not Bariatric-capable"


def test_ready_day_has_ready_readiness(client, roles, employees):
    call = mk_call(trip_date=FUTURE, status="assigned")
    unit = mk_unit(shift_date=FUTURE, crew=employees[:2])
    db.session.add(CallAssignment(call_id=call.id, unit_id=unit.id, is_active=True))
    db.session.commit()
    body = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}").get_json()
    assert body["days"][FUTURE]["readiness"] == "ready"


# ── Role filtering ───────────────────────────────────────────────────────────

def test_unknown_role_is_forbidden(app):
    """A signed-in user whose role the app does not recognise is identified but
    allowed nowhere — 403, not 401. (A header cannot claim a role at all now.)"""
    from conftest import make_user, login

    user = make_user("ghost", username="calendar_ghost")
    c = app.test_client()
    login(c, user.username)

    assert c.get(f"/api/calendar/events?start={TODAY}&end={FUTURE}").status_code == 403


def test_hr_gets_no_call_events_or_phi(client, roles, employees):
    p = mk_patient("Jane", "Smith")
    mk_call(trip_date=FUTURE, status="new", patient_id=p.id)
    mk_unit(shift_date=FUTURE, crew=employees[:2])
    body = roles["hr"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}").get_json()
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
    body = roles["dispatcher"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}").get_json()
    ev = events_of_type(body, "scheduled_call")[0]
    assert ev["metadata"]["patientLabel"] == "John D."   # minimized, never full last name


def test_call_event_contract_is_stable(client, roles):
    mk_call(trip_date=FUTURE, status="new")
    body = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}").get_json()
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
    resp = roles["dispatcher"].post("/api/dispatch/assign",
                       json={"call_id": call.id, "unit_id": unit.id})
    assert resp.status_code == 201
    assert db.session.get(Call, call.id).status == "assigned"


def test_future_date_rejects_live_status_transition(client, roles):
    unit = mk_unit(shift_date=FUTURE, truck_number="22")
    resp = roles["dispatcher"].patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"})
    assert resp.status_code == 409
    assert db.session.get(DailyCrewUnit, unit.id).dispatch_status == "available"


def test_today_allows_live_status_transition(client, roles):
    unit = _mk_today_unit()
    resp = roles["dispatcher"].patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"})
    assert resp.status_code == 200
    assert db.session.get(DailyCrewUnit, unit.id).dispatch_status == "en_route"


def test_past_date_rejects_status_transition(client, roles):
    unit = mk_unit(shift_date=PAST, truck_number="23")
    resp = roles["dispatcher"].patch(f"/api/dispatch/units/{unit.id}/status",
                        json={"status": "en_route"})
    assert resp.status_code == 409


def test_existing_board_endpoint_unchanged(client, roles):
    mk_call(trip_date=TODAY, status="new")
    _mk_today_unit(truck="50")
    body = roles["dispatcher"].get(f"/api/dispatch/board?date={TODAY}").get_json()
    assert "openCalls" in body and "units" in body
    assert body["date"] == TODAY
    assert len(body["units"]) == 1


# ── Overlay sources: birthdays, certifications, tasks, vehicles ──────────────

# A dob whose month-day equals FUTURE's, so the birthday occurrence lands on FUTURE.
BIRTHDAY_DOB = f"1990-{FUTURE[5:7]}-{FUTURE[8:10]}"


def mk_employee(first="Cal", last="Endar", dob=None, active=True, **certs):
    e = Employee(first_name=first, last_name=last, role="EMT", is_active=active, dob=dob)
    for k, v in certs.items():
        setattr(e, k, v)
    db.session.add(e)
    db.session.commit()
    return e


def types_for(api, type_, start=TODAY, end=FUTURE):
    body = api.get(f"/api/calendar/events?start={start}&end={end}").get_json()
    return [e for e in body["events"] if e["type"] == type_]


def test_patient_birthday_visible_to_ops_not_hr(client, roles):
    # Set dob through the ORM (not a bulk Query.update, which bypasses the
    # before_insert listener that derives dob_month_day).
    mk_patient("Birthday", "Person", dob=BIRTHDAY_DOB)
    disp = types_for(roles["dispatcher"], "patient_birthday")
    assert len(disp) == 1
    assert disp[0]["metadata"]["patientLabel"] == "Birthday P."  # minimized
    assert types_for(roles["hr"], "patient_birthday") == []  # HR: no patient PHI


def test_employee_birthday_visible_to_all_roles(client, roles):
    mk_employee("Emp", "Loyee", dob=BIRTHDAY_DOB)
    for role in ("admin", "dispatcher", "hr"):
        evs = types_for(roles[role], "employee_birthday")
        assert len(evs) == 1, role


def test_birthday_recurs_regardless_of_birth_year(client, roles):
    # dob in 1975 still produces an occurrence in the current-year range.
    mk_employee("Old", "Timer", dob=f"1975-{FUTURE[5:7]}-{FUTURE[8:10]}")
    assert len(types_for(roles["admin"], "employee_birthday")) == 1


def test_certification_event_hides_name_from_dispatcher(client, roles):
    mk_employee("Cert", "Holder", emt_has_license=True, emt_expiration_date=FUTURE)
    admin_ev = types_for(roles["admin"], "certification")
    assert len(admin_ev) == 1
    assert admin_ev[0]["metadata"].get("employeeName") == "Cert Holder"
    disp_ev = types_for(roles["dispatcher"], "certification")
    assert len(disp_ev) == 1                                   # dispatcher sees the fact
    assert "employeeName" not in disp_ev[0]["metadata"]        # but not the name
    assert disp_ev[0]["sourceId"] is None


def test_task_event_follows_task_visibility(client, roles):
    # Plain admin task, not assigned/participant/visible_to_all.
    t = Task(title="Due soon", task_type="General Task", status="New", priority="Normal",
             due_date=FUTURE, created_at="2026-01-01", updated_at="2026-01-01")
    db.session.add(t)
    db.session.commit()
    assert len(types_for(roles["admin"], "task")) == 1        # admin sees all
    assert types_for(roles["dispatcher"], "task") == []       # unrelated dispatcher: none
    t.visible_to_all = True
    db.session.commit()
    assert len(types_for(roles["dispatcher"], "task")) == 1   # announcement visible


def test_vehicle_event_visible_to_ops_not_hr(client, roles):
    v = Vehicle(unit_name="Ambu-1", unit_number="77", unit_type="BLS", inspection_expiry=FUTURE)
    db.session.add(v)
    db.session.commit()
    assert len(types_for(roles["dispatcher"], "vehicle")) == 1
    assert types_for(roles["hr"], "vehicle") == []


def test_overlay_events_counted_in_day_summary(client, roles):
    mk_employee("Emp", "Loyee", dob=BIRTHDAY_DOB)
    body = roles["admin"].get(f"/api/calendar/events?start={TODAY}&end={FUTURE}").get_json()
    assert body["days"][FUTURE]["otherEventsCount"] >= 1
