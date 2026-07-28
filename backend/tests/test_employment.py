"""Employment history: /api/employees/<id>/employment and its delete.

Covers the HR-record role gate, event-type and date validation, ordering, and
that a delete removes the entry (the history is append-only — a correction is a
delete, not an edit).
"""

import pytest

from models import db, Employee


def mk_employee(first="Case", last="Worker"):
    e = Employee(first_name=first, last_name=last, role="EMT", status="active")
    db.session.add(e)
    db.session.commit()
    return e


def add_event(client, emp_id, **payload):
    body = {"eventType": "hired", "effectiveDate": "2026-01-15"}
    body.update(payload)
    return client.post(f"/api/employees/{emp_id}/employment", json=body)


# ── Role gate ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["admin", "supervisor", "hr"])
def test_hr_record_roles_may_read_and_write(clients, role):
    emp = mk_employee()
    assert clients[role].get(f"/api/employees/{emp.id}/employment").status_code == 200
    assert add_event(clients[role], emp.id).status_code == 201


def test_dispatcher_is_denied(clients):
    emp = mk_employee()
    assert clients["dispatcher"].get(f"/api/employees/{emp.id}/employment").status_code == 403
    assert add_event(clients["dispatcher"], emp.id).status_code == 403


def test_requires_a_session(anon):
    emp = mk_employee()
    assert anon.get(f"/api/employees/{emp.id}/employment").status_code == 401


# ── Validation ──────────────────────────────────────────────────────────────

def test_unknown_employee_is_404(clients):
    assert clients["hr"].get("/api/employees/99999/employment").status_code == 404
    assert add_event(clients["hr"], 99999).status_code == 404


def test_event_type_must_be_known(clients):
    emp = mk_employee()
    resp = add_event(clients["hr"], emp.id, eventType="promoted_to_wizard")
    assert resp.status_code == 400


def test_effective_date_must_be_a_real_date(clients):
    emp = mk_employee()
    assert add_event(clients["hr"], emp.id, effectiveDate="2026-02-30").status_code == 400
    assert add_event(clients["hr"], emp.id, effectiveDate="not-a-date").status_code == 400
    assert add_event(clients["hr"], emp.id, effectiveDate="").status_code == 400


# ── Behaviour ───────────────────────────────────────────────────────────────

def test_created_event_round_trips_its_fields(clients):
    emp = mk_employee()
    resp = add_event(
        clients["hr"], emp.id,
        eventType="position_change", effectiveDate="2026-03-01",
        title="Lead EMT", employmentType="full_time", status="active",
        note="Promoted after annual review",
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["eventType"] == "position_change"
    assert body["title"] == "Lead EMT"
    assert body["employmentType"] == "full_time"
    assert body["note"] == "Promoted after annual review"
    assert body["createdByName"]  # the acting user is recorded


def test_events_are_returned_newest_effective_date_first(clients):
    emp = mk_employee()
    add_event(clients["hr"], emp.id, eventType="hired", effectiveDate="2026-01-01")
    add_event(clients["hr"], emp.id, eventType="position_change", effectiveDate="2026-06-01")
    add_event(clients["hr"], emp.id, eventType="status_change", effectiveDate="2026-03-01")

    dates = [e["effectiveDate"] for e in
             clients["hr"].get(f"/api/employees/{emp.id}/employment").get_json()]
    assert dates == ["2026-06-01", "2026-03-01", "2026-01-01"]


def test_delete_removes_the_entry(clients):
    emp = mk_employee()
    event_id = add_event(clients["hr"], emp.id).get_json()["id"]

    assert clients["hr"].delete(f"/api/employees/employment/{event_id}").status_code == 200
    assert clients["hr"].get(f"/api/employees/{emp.id}/employment").get_json() == []


def test_delete_of_a_missing_event_is_404(clients):
    assert clients["hr"].delete("/api/employees/employment/99999").status_code == 404


def test_events_are_scoped_to_their_employee(clients):
    a = mk_employee("Ann", "Alpha")
    b = mk_employee("Bo", "Beta")
    add_event(clients["hr"], a.id, effectiveDate="2026-01-01")

    assert len(clients["hr"].get(f"/api/employees/{a.id}/employment").get_json()) == 1
    assert clients["hr"].get(f"/api/employees/{b.id}/employment").get_json() == []
