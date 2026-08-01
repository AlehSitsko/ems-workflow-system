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
