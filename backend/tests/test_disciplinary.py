"""Disciplinary record: /api/employees/<id>/disciplinary and its PATCH/DELETE.

The disciplinary record is narrower than the rest of the employee surface —
admin/HR only, not supervisor — so the role gate is the first thing pinned here.
"""

import pytest

from models import db, Employee


def mk_employee(first="Case", last="Worker"):
    e = Employee(first_name=first, last_name=last, role="EMT", status="active")
    db.session.add(e)
    db.session.commit()
    return e


def add_action(client, emp_id, **payload):
    body = {"actionType": "written_warning", "actionDate": "2026-05-01"}
    body.update(payload)
    return client.post(f"/api/employees/{emp_id}/disciplinary", json=body)


# ── Role gate — admin/HR only ────────────────────────────────────────────────

@pytest.mark.parametrize("role", ["admin", "hr"])
def test_admin_and_hr_may_read_and_write(clients, role):
    emp = mk_employee()
    assert clients[role].get(f"/api/employees/{emp.id}/disciplinary").status_code == 200
    assert add_action(clients[role], emp.id).status_code == 201


@pytest.mark.parametrize("role", ["supervisor", "dispatcher"])
def test_supervisor_and_dispatcher_are_denied(clients, role):
    emp = mk_employee()
    # Supervisor can open the employee workspace but not the disciplinary record.
    assert clients[role].get(f"/api/employees/{emp.id}/disciplinary").status_code == 403
    assert add_action(clients[role], emp.id).status_code == 403


def test_requires_a_session(anon):
    emp = mk_employee()
    assert anon.get(f"/api/employees/{emp.id}/disciplinary").status_code == 401


# ── Validation ──────────────────────────────────────────────────────────────

def test_unknown_employee_is_404(clients):
    assert clients["hr"].get("/api/employees/99999/disciplinary").status_code == 404
    assert add_action(clients["hr"], 99999).status_code == 404


def test_action_type_must_be_known(clients):
    emp = mk_employee()
    assert add_action(clients["hr"], emp.id, actionType="keelhauling").status_code == 400


def test_action_date_must_be_a_real_date(clients):
    emp = mk_employee()
    assert add_action(clients["hr"], emp.id, actionDate="2026-02-30").status_code == 400
    assert add_action(clients["hr"], emp.id, actionDate="").status_code == 400


def test_severity_is_validated_when_present(clients):
    emp = mk_employee()
    assert add_action(clients["hr"], emp.id, severity="apocalyptic").status_code == 400
    assert add_action(clients["hr"], emp.id, severity="high").status_code == 201


# ── Behaviour ───────────────────────────────────────────────────────────────

def test_created_action_round_trips_and_defaults_unacknowledged(clients):
    emp = mk_employee()
    body = add_action(
        clients["hr"], emp.id,
        actionType="suspension", actionDate="2026-04-10", severity="high",
        subject="Missed shift", description="No-showed a scheduled transport",
    ).get_json()
    assert body["actionType"] == "suspension"
    assert body["severity"] == "high"
    assert body["subject"] == "Missed shift"
    assert body["acknowledged"] is False
    assert body["createdByName"]


def test_actions_are_returned_newest_first(clients):
    emp = mk_employee()
    add_action(clients["hr"], emp.id, actionDate="2026-01-01")
    add_action(clients["hr"], emp.id, actionDate="2026-09-01")
    add_action(clients["hr"], emp.id, actionDate="2026-05-01")

    dates = [a["actionDate"] for a in
             clients["hr"].get(f"/api/employees/{emp.id}/disciplinary").get_json()]
    assert dates == ["2026-09-01", "2026-05-01", "2026-01-01"]


def test_acknowledgement_can_be_toggled(clients):
    emp = mk_employee()
    action_id = add_action(clients["hr"], emp.id).get_json()["id"]

    resp = clients["hr"].patch(f"/api/employees/disciplinary/{action_id}",
                               json={"acknowledged": True})
    assert resp.status_code == 200
    assert resp.get_json()["acknowledged"] is True


def test_patch_rejects_editing_anything_but_acknowledged(clients):
    emp = mk_employee()
    action_id = add_action(clients["hr"], emp.id).get_json()["id"]
    resp = clients["hr"].patch(f"/api/employees/disciplinary/{action_id}",
                               json={"subject": "rewritten"})
    assert resp.status_code == 400


def test_delete_removes_the_action(clients):
    emp = mk_employee()
    action_id = add_action(clients["hr"], emp.id).get_json()["id"]

    assert clients["hr"].delete(f"/api/employees/disciplinary/{action_id}").status_code == 200
    assert clients["hr"].get(f"/api/employees/{emp.id}/disciplinary").get_json() == []


def test_supervisor_cannot_delete_or_patch(clients):
    emp = mk_employee()
    action_id = add_action(clients["hr"], emp.id).get_json()["id"]
    assert clients["supervisor"].delete(f"/api/employees/disciplinary/{action_id}").status_code == 403
    assert clients["supervisor"].patch(f"/api/employees/disciplinary/{action_id}",
                                       json={"acknowledged": True}).status_code == 403
