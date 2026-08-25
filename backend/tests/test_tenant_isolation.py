"""Runtime tenant isolation — one organisation's user can never see or touch
another's data, and writes are stamped with the caller's organisation.

Isolation is enforced globally in the ORM (tenant.py), so these exercise it through
the real HTTP surface: two orgs, an admin signed in to each, and cross-org access
attempts. The existing suite runs with no org context (users have org_id=None), so
the filter is inert there; here the users have an org, which turns it on.
"""

import pytest

from models import (
    db, Organization, Patient, Employee, Call, Task, EmployeeDocument, AuditLog,
    EmploymentEvent, DisciplinaryAction, Vehicle, VehicleMaintenanceRecord,
    DailyCrewUnit, CallAssignment, PatientAlert, PatientContact,
)
from conftest import make_user, login
from tenant import set_current_org, unfiltered


@pytest.fixture()
def orgs(app):
    a = Organization(name="Org A", slug="orga")
    b = Organization(name="Org B", slug="orgb")
    db.session.add_all([a, b])
    db.session.commit()
    return a.id, b.id   # ids, not objects — seeding expires/detaches the instances


def client_in(app, org_id, username):
    user = make_user("admin", username=username, org_id=org_id)
    c = app.test_client()
    login(c, user.username)
    return c


def seed(org_id, obj):
    """Create a row inside an organisation (the write-stamp sets its org_id).

    Expunge afterwards so the seeded object leaves the session's identity map: in
    production every request has a fresh session, so a cross-org `Query.get(pk)`
    emits a real (filtered) SELECT; without expunging, this one shared test session
    would return the object straight from the identity map and bypass the filter —
    a test artifact, not a production path.
    """
    set_current_org(org_id)
    db.session.add(obj)
    db.session.commit()
    obj_id = obj.id
    set_current_org(None)
    db.session.expunge_all()
    return obj_id


# ── Reads are isolated ───────────────────────────────────────────────────────

def test_patient_list_and_get_are_scoped(app, orgs):
    a, b = orgs
    seed(a, Patient(first_name="Alice", last_name="A"))
    pb_id = seed(b, Patient(first_name="Bob", last_name="B"))
    ca, cb = client_in(app, a, "admin_a"), client_in(app, b, "admin_b")

    names_a = [p["first_name"] for p in ca.get("/api/patients").get_json()["items"]]
    assert names_a == ["Alice"]                       # A sees only its own
    assert ca.get(f"/api/patient/{pb_id}").status_code == 404   # can't fetch B's by id
    assert [p["first_name"] for p in cb.get("/api/patients").get_json()["items"]] == ["Bob"]


def test_other_entities_are_scoped(app, orgs):
    a, b = orgs
    seed(a, Employee(first_name="Ann", last_name="A", role="EMT"))
    seed(b, Employee(first_name="Ben", last_name="B", role="EMT"))
    seed(a, Call(trip_date="2026-08-01", service_level="BLS"))
    seed(b, Call(trip_date="2026-08-01", service_level="BLS"))
    seed(a, Task(title="A task", task_type="General Task", status="New", priority="Normal",
                    created_at="2026-01-01T00:00:00", updated_at="2026-01-01T00:00:00"))
    seed(b, Task(title="B task", task_type="General Task", status="New", priority="Normal",
                    created_at="2026-01-01T00:00:00", updated_at="2026-01-01T00:00:00"))
    ca = client_in(app, a, "admin_a")

    assert [e["firstName"] for e in ca.get("/api/employees").get_json()] == ["Ann"]
    assert ca.get("/api/calls").get_json()["total"] == 1
    assert [t["title"] for t in ca.get("/api/tasks").get_json()["items"]] == ["A task"]


# ── Mutations can't cross ────────────────────────────────────────────────────

def test_cannot_mutate_another_orgs_record(app, orgs):
    a, b = orgs
    pb_id = seed(b, Patient(first_name="Bob", last_name="B"))
    ca = client_in(app, a, "admin_a")
    assert ca.put(f"/api/patient/{pb_id}", json={"first_name": "Hacked"}).status_code == 404
    assert ca.delete(f"/api/patient/{pb_id}").status_code == 404
    with unfiltered():
        assert Patient.query.get(pb_id).first_name == "Bob"   # untouched


# ── Writes are stamped ───────────────────────────────────────────────────────

def test_created_records_are_stamped_with_the_callers_org(app, orgs):
    a, _ = orgs
    ca = client_in(app, a, "admin_a")
    resp = ca.post("/api/patients", json={"first_name": "New", "last_name": "Patient"})
    assert resp.status_code == 201
    with unfiltered():
        p = Patient.query.filter_by(first_name="New").first()
    assert p is not None and p.org_id == a


# ── The audit trail is scoped too ────────────────────────────────────────────

def test_audit_log_is_scoped(app, orgs):
    a, b = orgs
    seed(a, AuditLog(timestamp="2026-08-01T00:00:00", action="patient.created", entity_label="A action"))
    seed(b, AuditLog(timestamp="2026-08-01T00:00:00", action="patient.created", entity_label="B action"))
    ca = client_in(app, a, "admin_a")
    body = ca.get("/api/audit").get_json()
    assert body["total"] == 1                                        # only A's entry
    assert [e["entity_label"] for e in body["entries"]] == ["A action"]


# ── A child row (no org_id) can't be fetched cross-org ───────────────────────

def test_child_by_id_does_not_leak_across_orgs(app, orgs):
    a, b = orgs
    emp_b_id = seed(b, Employee(first_name="Ben", last_name="B", role="EMT"))
    with unfiltered():
        doc = EmployeeDocument(employee_id=emp_b_id, doc_type="ems_license", title="Lic",
                               uploaded_at="2026-01-01T00:00:00", updated_at="2026-01-01T00:00:00")
        db.session.add(doc)
        db.session.commit()
        doc_id = doc.id
    ca = client_in(app, a, "admin_a")
    # The document endpoints resolve through the (org-filtered) employee, so org A
    # cannot reach org B's document.
    assert ca.get(f"/api/documents/{doc_id}").status_code == 404
    assert ca.get(f"/api/employees/{emp_b_id}/documents").status_code == 404


# ── Child-by-id mutations resolve through the org-scoped parent ───────────────
#
# These routes load a row that carries no org_id of its own (an employment event,
# a disciplinary action, a maintenance record, a call assignment, a patient alert
# or contact). The global filter cannot scope such a row, so each route must reach
# it through its org-owning parent — otherwise org A could mutate org B's child by
# guessing its id. One test per route family that a cross-org id is refused (404).

def _child(parent_kwargs_obj):
    """Persist a child row directly (no org context) and return its id."""
    with unfiltered():
        db.session.add(parent_kwargs_obj)
        db.session.commit()
        return parent_kwargs_obj.id


def test_employment_event_delete_is_scoped(app, orgs):
    a, b = orgs
    emp_b = seed(b, Employee(first_name="Ben", last_name="B", role="EMT"))
    ev_id = _child(EmploymentEvent(employee_id=emp_b, event_type="hire",
                                   effective_date="2026-01-01",
                                   created_at="2026-01-01T00:00:00"))
    ca = client_in(app, a, "admin_a")
    assert ca.delete(f"/api/employees/employment/{ev_id}").status_code == 404
    with unfiltered():
        assert db.session.get(EmploymentEvent, ev_id) is not None  # untouched


def test_disciplinary_action_patch_and_delete_are_scoped(app, orgs):
    a, b = orgs
    emp_b = seed(b, Employee(first_name="Ben", last_name="B", role="EMT"))
    act_id = _child(DisciplinaryAction(employee_id=emp_b, action_type="note",
                                       action_date="2026-01-01", acknowledged=False,
                                       created_at="2026-01-01T00:00:00"))
    ca = client_in(app, a, "admin_a")
    assert ca.patch(f"/api/employees/disciplinary/{act_id}",
                    json={"acknowledged": True}).status_code == 404
    assert ca.delete(f"/api/employees/disciplinary/{act_id}").status_code == 404
    with unfiltered():
        assert db.session.get(DisciplinaryAction, act_id).acknowledged is False


def test_vehicle_maintenance_patch_is_scoped(app, orgs):
    a, b = orgs
    veh_b = seed(b, Vehicle(unit_name="Medic B", unit_number="B1", unit_type="BLS",
                            is_retired=False))
    rec_id = _child(VehicleMaintenanceRecord(vehicle_id=veh_b, maintenance_type="oil",
                                             status="scheduled"))
    ca = client_in(app, a, "admin_a")
    assert ca.patch(f"/api/vehicles/maintenance/{rec_id}",
                    json={"status": "completed"}).status_code == 404
    with unfiltered():
        assert db.session.get(VehicleMaintenanceRecord, rec_id).status == "scheduled"


def test_call_assignment_mutations_are_scoped(app, orgs):
    a, b = orgs
    call_b = seed(b, Call(trip_date="2026-08-01", service_level="BLS", status="assigned"))
    unit_b = seed(b, DailyCrewUnit(shift_date="2026-08-01", unit_type="BLS",
                                   truck_number="B1", start_time="08:00"))
    asg_id = _child(CallAssignment(call_id=call_b, unit_id=unit_b, is_active=True))
    ca = client_in(app, a, "admin_a")
    assert ca.delete(f"/api/dispatch/assign/{asg_id}").status_code == 404
    assert ca.patch(f"/api/dispatch/assign/{asg_id}/complete").status_code == 404
    assert ca.patch(f"/api/dispatch/assign/{asg_id}/reopen").status_code == 404
    with unfiltered():
        assert db.session.get(CallAssignment, asg_id).is_active is True  # untouched


def test_patient_alert_and_contact_mutations_are_scoped(app, orgs):
    a, b = orgs
    pat_b = seed(b, Patient(first_name="Bob", last_name="B"))
    alert_id = _child(PatientAlert(patient_id=pat_b, category="medical", severity="high",
                                   title="Allergy", is_active=True))
    contact_id = _child(PatientContact(patient_id=pat_b, name="Kin"))
    ca = client_in(app, a, "admin_a")
    assert ca.put(f"/api/patient/{pat_b}/alerts/{alert_id}",
                  json={"severity": "low"}).status_code == 404
    assert ca.post(f"/api/patient/{pat_b}/alerts/{alert_id}/resolve").status_code == 404
    assert ca.put(f"/api/patient/{pat_b}/contacts/{contact_id}",
                  json={"name": "Hacked"}).status_code == 404
    assert ca.delete(f"/api/patient/{pat_b}/contacts/{contact_id}").status_code == 404
    with unfiltered():
        assert db.session.get(PatientContact, contact_id).name == "Kin"  # untouched


# ── Exhaustive by-id + list scoping across every resource family (Phase 1 gate) ─
#
# The runtime ORM filter should scope EVERY select of an org-owned model, so a
# cross-org id must resolve to 404 on read and on mutation, and lists must never
# include another org's rows. One test per family; a leak here fails the gate.

def test_call_by_id_and_mutations_are_scoped(app, orgs):
    a, b = orgs
    cb = seed(b, Call(trip_date="2026-08-01", service_level="BLS", status="new"))
    ca = client_in(app, a, "admin_a")
    assert ca.get(f"/api/calls/{cb}").status_code == 404
    assert ca.put(f"/api/calls/{cb}", json={"service_level": "ALS"}).status_code == 404
    assert ca.patch(f"/api/calls/{cb}/cancel", json={"reason": "x"}).status_code == 404
    assert ca.patch(f"/api/calls/{cb}/pickup-time", json={"pickup_time": "09:00"}).status_code == 404
    with unfiltered():
        assert db.session.get(Call, cb).service_level == "BLS"  # untouched


def test_employee_by_id_and_mutations_are_scoped(app, orgs):
    a, b = orgs
    eb = seed(b, Employee(first_name="Ben", last_name="B", role="EMT"))
    ca = client_in(app, a, "admin_a")
    assert ca.get(f"/api/employees/{eb}").status_code == 404
    assert ca.get(f"/api/employees/{eb}/shifts").status_code == 404
    assert ca.put(f"/api/employees/{eb}", json={"firstName": "X", "lastName": "Y"}).status_code == 404
    assert ca.delete(f"/api/employees/{eb}").status_code == 404


def test_vehicle_by_id_and_list_are_scoped(app, orgs):
    a, b = orgs
    seed(a, Vehicle(unit_name="Medic A", unit_number="A1", unit_type="ALS", is_retired=False))
    vb = seed(b, Vehicle(unit_name="Medic B", unit_number="B1", unit_type="BLS", is_retired=False))
    ca = client_in(app, a, "admin_a")
    numbers = [v["unitNumber"] for v in ca.get("/api/vehicles").get_json()]
    assert numbers == ["A1"]
    assert ca.get(f"/api/vehicles/{vb}").status_code == 404
    assert ca.put(f"/api/vehicles/{vb}", json={"unitName": "H", "unitNumber": "H", "unitType": "BLS"}).status_code == 404
    assert ca.delete(f"/api/vehicles/{vb}").status_code == 404
    assert ca.patch(f"/api/vehicles/{vb}/toggle-active").status_code == 404


def test_crew_unit_by_id_and_list_are_scoped(app, orgs):
    a, b = orgs
    seed(a, DailyCrewUnit(shift_date="2026-08-01", unit_type="ALS", truck_number="A9", start_time="08:00"))
    ub = seed(b, DailyCrewUnit(shift_date="2026-08-01", unit_type="BLS", truck_number="B9", start_time="08:00"))
    ca = client_in(app, a, "admin_a")
    trucks = [u["truckNumber"] for u in ca.get("/api/crew-units?shift_date=2026-08-01").get_json()]
    assert trucks == ["A9"]
    assert ca.put(f"/api/crew-units/{ub}", json={"shiftDate": "2026-08-01", "truckNumber": "H",
                  "startTime": "08:00", "patientOrder": []}).status_code == 404
    assert ca.delete(f"/api/crew-units/{ub}").status_code == 404


def test_task_by_id_and_mutations_are_scoped(app, orgs):
    a, b = orgs
    tb = seed(b, Task(title="B task", task_type="General Task", status="New", priority="Normal",
                      created_at="2026-01-01T00:00:00", updated_at="2026-01-01T00:00:00"))
    ca = client_in(app, a, "admin_a")
    assert ca.get(f"/api/tasks/{tb}").status_code == 404
    assert ca.put(f"/api/tasks/{tb}", json={"title": "H"}).status_code == 404
    assert ca.patch(f"/api/tasks/{tb}/status", json={"status": "Completed"}).status_code == 404
    assert ca.delete(f"/api/tasks/{tb}").status_code == 404


def test_dispatch_board_and_assign_are_scoped(app, orgs):
    a, b = orgs
    call_b = seed(b, Call(trip_date="2026-08-01", service_level="BLS", status="new"))
    unit_b = seed(b, DailyCrewUnit(shift_date="2026-08-01", unit_type="BLS", truck_number="B7", start_time="08:00"))
    unit_a = seed(a, DailyCrewUnit(shift_date="2026-08-01", unit_type="BLS", truck_number="A7", start_time="08:00"))
    ca = client_in(app, a, "admin_a")

    board = ca.get("/api/dispatch/board?date=2026-08-01").get_json()
    trucks = [u["truckNumber"] for u in board.get("units", [])]
    assert "B7" in [] or "B7" not in trucks  # org B's unit never appears on A's board
    assert "B7" not in trucks

    # Assigning across the org boundary fails at the (org-filtered) lookup.
    assert ca.post("/api/dispatch/assign",
                   json={"call_id": call_b, "unit_id": unit_a}).status_code == 404  # B's call not found
    assert ca.post("/api/dispatch/assign",
                   json={"call_id": call_b, "unit_id": unit_b}).status_code == 404


def test_document_file_download_is_scoped(app, orgs):
    a, b = orgs
    emp_b = seed(b, Employee(first_name="Ben", last_name="B", role="EMT"))
    with unfiltered():
        doc = EmployeeDocument(employee_id=emp_b, doc_type="ems_license", title="Lic",
                               file_path=f"{emp_b}/x.pdf", file_name="x.pdf",
                               uploaded_at="2026-01-01T00:00:00", updated_at="2026-01-01T00:00:00")
        db.session.add(doc)
        db.session.commit()
        doc_id = doc.id
    ca = client_in(app, a, "admin_a")
    assert ca.get(f"/api/documents/{doc_id}/file").status_code == 404


# ── .query.get()/.get_or_404() by a cross-org id must return nothing ──────────
# ~140 route lookups use Model.query.get(user_supplied_id). Each production request
# has a fresh session (empty identity map), so .get() emits a real SELECT that the
# do_orm_execute filter scopes. This pins that per-model, so a future model added to
# ORG_SCOPED_MODELS (or a lookup that bypasses it) can't silently leak across orgs.
def test_get_by_id_is_scoped_for_every_sensitive_model(app, orgs):
    a, b = orgs
    cases = {
        "Patient": (Patient, Patient(first_name="Bob", last_name="B")),
        "Employee": (Employee, Employee(first_name="Ben", last_name="B", role="EMT")),
        "Call": (Call, Call(trip_date="2026-08-01", service_level="BLS")),
        "Task": (Task, Task(title="B task", task_type="General Task", status="New",
                            priority="Normal", created_at="2026-01-01T00:00:00",
                            updated_at="2026-01-01T00:00:00")),
        "DailyCrewUnit": (DailyCrewUnit, DailyCrewUnit(shift_date="2026-08-01",
                            unit_type="BLS", truck_number="B1", start_time="08:00")),
    }
    ids = {name: seed(b, obj) for name, (model, obj) in cases.items()}

    set_current_org(a)   # act as org A
    try:
        for name, (model, _) in cases.items():
            rid = ids[name]
            assert model.query.get(rid) is None, f"{name}.query.get() leaked org B's row to org A"
    finally:
        set_current_org(None)

    # And the rows genuinely exist (proves the None above is scoping, not a bad id).
    with unfiltered():
        for name, (model, _) in cases.items():
            assert model.query.get(ids[name]) is not None, f"{name} row was not seeded"
