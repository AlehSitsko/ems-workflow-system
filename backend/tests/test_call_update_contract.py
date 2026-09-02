"""PUT /api/calls/<id> update contract.

Regression for the v1.1.16 defect where the drawer sent `date_of_call` and
`patient_id` on update but the backend's EDITABLE list omitted both — the API
answered 200 while silently discarding the change ("saved" that never persisted).

These pin that both fields now actually persist, with strict ISO date validation,
patient existence + tenant-isolation checks, audit logging, RBAC, and that a
rejected update leaves the row untouched.
"""

import pytest

from models import db, AuditLog, Patient, Call, Organization
from conftest import make_user, login
from tenant import set_current_org, unfiltered


BAD_DATES = [
    "2026-02-30", "2026-13-45", "not-a-date", "0000-00-00",
    "2026-00-10", "10/31/2026", "2026-8-1",
]


def create_call(client, **fields):
    body = {"trip_date": "2026-08-01", "pickup_time": "10:00", "service_level": "BLS"}
    body.update(fields)
    r = client.post("/api/calls", json=body)
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def make_patient(client, first="Pat", last="One"):
    r = client.post("/api/patients", json={"first_name": first, "last_name": last})
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def audit_details(call_id, action="call.updated"):
    rows = AuditLog.query.filter_by(action=action, entity_type="call",
                                    entity_id=call_id).all()
    return " ".join(r.details or "" for r in rows)


# ── date_of_call ─────────────────────────────────────────────────────────────

def test_date_of_call_persists_on_update(clients):
    c = clients["dispatcher"]
    call = create_call(c, date_of_call="2026-07-01")
    r = c.put(f"/api/calls/{call['id']}", json={"date_of_call": "2026-09-15"})
    assert r.status_code == 200
    assert r.get_json()["date_of_call"] == "2026-09-15"          # response reflects it
    # re-fetch to prove it truly persisted, not just echoed back
    assert c.get(f"/api/calls/{call['id']}").get_json()["date_of_call"] == "2026-09-15"


@pytest.mark.parametrize("bad", BAD_DATES)
def test_update_rejects_invalid_date_of_call(clients, bad):
    c = clients["dispatcher"]
    call = create_call(c, date_of_call="2026-07-01")
    assert c.put(f"/api/calls/{call['id']}", json={"date_of_call": bad}).status_code == 400
    # the old value is untouched after a rejected update
    assert c.get(f"/api/calls/{call['id']}").get_json()["date_of_call"] == "2026-07-01"


@pytest.mark.parametrize("empty", ["", None])
def test_date_of_call_can_be_cleared(clients, empty):
    # A call may become dateless (waits in the scheduling inbox) — consistent with create.
    c = clients["dispatcher"]
    call = create_call(c, date_of_call="2026-07-01")
    assert c.put(f"/api/calls/{call['id']}", json={"date_of_call": empty}).status_code == 200
    assert c.get(f"/api/calls/{call['id']}").get_json()["date_of_call"] in (None, "")


def test_date_of_call_change_is_audited(clients):
    c = clients["dispatcher"]
    call = create_call(c, date_of_call="2026-07-01")
    c.put(f"/api/calls/{call['id']}", json={"date_of_call": "2026-09-15"})
    assert "date_of_call" in audit_details(call["id"])


def test_update_requires_an_allowed_role(clients):
    call = create_call(clients["dispatcher"], date_of_call="2026-07-01")
    # hr is not a dispatch role — must not be able to edit a call
    assert clients["hr"].put(f"/api/calls/{call['id']}",
                             json={"date_of_call": "2026-09-15"}).status_code == 403


def test_update_requires_authentication(clients, anon):
    call = create_call(clients["dispatcher"])
    assert anon.put(f"/api/calls/{call['id']}",
                    json={"date_of_call": "2026-09-15"}).status_code == 401


# ── patient_id (same org) ────────────────────────────────────────────────────

def test_patient_can_be_linked(clients):
    c = clients["dispatcher"]
    call = create_call(c)                       # no patient
    pat = make_patient(c, "Grace", "Hopper")
    r = c.put(f"/api/calls/{call['id']}", json={"patient_id": pat["id"]})
    assert r.status_code == 200
    body = r.get_json()
    assert body["patient_id"] == pat["id"]
    assert body["patient_name"] == "Grace Hopper"          # summary reflects the link
    assert c.get(f"/api/calls/{call['id']}").get_json()["patient_id"] == pat["id"]


def test_patient_can_be_changed(clients):
    c = clients["dispatcher"]
    p1 = make_patient(c, "Ada", "Lovelace")
    p2 = make_patient(c, "Alan", "Turing")
    call = create_call(c, patient_id=p1["id"])
    r = c.put(f"/api/calls/{call['id']}", json={"patient_id": p2["id"]})
    assert r.status_code == 200
    assert r.get_json()["patient_id"] == p2["id"]
    assert c.get(f"/api/calls/{call['id']}").get_json()["patient_id"] == p2["id"]


@pytest.mark.parametrize("empty", [None, ""])
def test_patient_can_be_unlinked(clients, empty):
    c = clients["dispatcher"]
    pat = make_patient(c, "Katherine", "Johnson")
    call = create_call(c, patient_id=pat["id"])
    r = c.put(f"/api/calls/{call['id']}", json={"patient_id": empty})
    assert r.status_code == 200
    assert r.get_json()["patient_id"] is None
    assert c.get(f"/api/calls/{call['id']}").get_json()["patient_id"] is None


def test_nonexistent_patient_is_rejected(clients):
    c = clients["dispatcher"]
    pat = make_patient(c, "Real", "Patient")
    call = create_call(c, patient_id=pat["id"])
    assert c.put(f"/api/calls/{call['id']}", json={"patient_id": 999999}).status_code == 400
    # rejected update leaves the original link intact
    assert c.get(f"/api/calls/{call['id']}").get_json()["patient_id"] == pat["id"]


def test_patient_link_change_is_audited(clients):
    c = clients["dispatcher"]
    pat = make_patient(c, "Audit", "Target")
    call = create_call(c)
    c.put(f"/api/calls/{call['id']}", json={"patient_id": pat["id"]})
    assert "patient_id" in audit_details(call["id"])


# ── patient_id (cross-org isolation) ─────────────────────────────────────────

@pytest.fixture()
def orgs(app):
    a = Organization(name="Org A", slug="orga")
    b = Organization(name="Org B", slug="orgb")
    db.session.add_all([a, b])
    db.session.commit()
    return a.id, b.id


def client_in(app, org_id, username):
    user = make_user("admin", username=username, org_id=org_id)
    c = app.test_client()
    login(c, user.username)
    return c


def seed(org_id, obj):
    set_current_org(org_id)
    db.session.add(obj)
    db.session.commit()
    obj_id = obj.id
    set_current_org(None)
    db.session.expunge_all()
    return obj_id


def test_cannot_link_a_patient_from_another_org(app, orgs):
    a, b = orgs
    call_a = seed(a, Call(trip_date="2026-08-01", service_level="BLS", status="new"))
    pat_b = seed(b, Patient(first_name="Bob", last_name="B"))
    ca = client_in(app, a, "admin_a")

    # Linking org B's patient must be refused (not silently honoured), and the
    # call's link must stay empty.
    assert ca.put(f"/api/calls/{call_a}", json={"patient_id": pat_b}).status_code == 400
    with unfiltered():
        assert db.session.get(Call, call_a).patient_id is None


def test_can_link_a_patient_within_the_same_org(app, orgs):
    a, _ = orgs
    call_a = seed(a, Call(trip_date="2026-08-01", service_level="BLS", status="new"))
    pat_a = seed(a, Patient(first_name="Alice", last_name="A"))
    ca = client_in(app, a, "admin_a")
    r = ca.put(f"/api/calls/{call_a}", json={"patient_id": pat_a})
    assert r.status_code == 200
    assert r.get_json()["patient_id"] == pat_a
