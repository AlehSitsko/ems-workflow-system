"""Backend tests for patient sub-resources: alerts and contacts
(routes/patient_routes.py — the previously-thin CRUD blocks).

Covers RBAC (HR has no patient access), validation (category/severity/title,
required name), the create/list/update/resolve/delete lifecycle, and 404s for
unknown patients / alerts / contacts.

Run: pytest backend/tests/test_patient_subresources.py -v
"""

from models import db, Patient, PatientAlert, PatientContact


def _patient(first="Ann", last="Lee"):
    p = Patient(first_name=first, last_name=last)
    db.session.add(p)
    db.session.commit()
    return p


def _alert_body(**over):
    body = {"category": "behavior", "severity": "warning", "title": "Combative"}
    body.update(over)
    return body


# ── RBAC + 404 ────────────────────────────────────────────────────────────────

def test_hr_has_no_patient_alert_access(clients, app):
    p = _patient()
    assert clients["hr"].get(f"/api/patient/{p.id}/alerts").status_code == 403


def test_alerts_404_for_unknown_patient(clients, app):
    assert clients["admin"].get("/api/patient/999999/alerts").status_code == 404
    assert clients["admin"].post("/api/patient/999999/alerts", json=_alert_body()).status_code == 404


# ── alert validation ──────────────────────────────────────────────────────────

def test_create_alert_validation(clients, app):
    p = _patient()
    api = clients["admin"]
    assert api.post(f"/api/patient/{p.id}/alerts", json=_alert_body(category="nope")).status_code == 400
    assert api.post(f"/api/patient/{p.id}/alerts", json=_alert_body(severity="nope")).status_code == 400
    assert api.post(f"/api/patient/{p.id}/alerts", json=_alert_body(title="  ")).status_code == 400
    assert api.post(f"/api/patient/{p.id}/alerts", json=_alert_body(expires_at="not-a-date")).status_code == 400


# ── alert lifecycle ───────────────────────────────────────────────────────────

def test_alert_create_list_update_resolve(clients, app):
    p = _patient()
    api = clients["supervisor"]

    created = api.post(f"/api/patient/{p.id}/alerts", json=_alert_body())
    assert created.status_code == 201
    aid = created.get_json()["id"]

    listed = api.get(f"/api/patient/{p.id}/alerts").get_json()
    assert [a["id"] for a in listed] == [aid]

    updated = api.put(f"/api/patient/{p.id}/alerts/{aid}", json=_alert_body(title="Updated"))
    assert updated.status_code == 200 and updated.get_json()["title"] == "Updated"

    resolved = api.post(f"/api/patient/{p.id}/alerts/{aid}/resolve")
    assert resolved.status_code == 200
    assert PatientAlert.query.get(aid).is_active is False


def test_update_unknown_alert_is_404(clients, app):
    p = _patient()
    assert clients["admin"].put(f"/api/patient/{p.id}/alerts/999999",
                                json=_alert_body()).status_code == 404


# ── contacts ──────────────────────────────────────────────────────────────────

def test_contact_requires_name(clients, app):
    p = _patient()
    assert clients["admin"].post(f"/api/patient/{p.id}/contacts", json={"name": "  "}).status_code == 400


def test_contact_create_list_update_delete(clients, app):
    p = _patient()
    api = clients["admin"]

    created = api.post(f"/api/patient/{p.id}/contacts",
                       json={"name": "Bob Lee", "relationship": "Son", "phone": "555-1"})
    assert created.status_code == 201
    cid = created.get_json()["id"]

    listed = api.get(f"/api/patient/{p.id}/contacts").get_json()
    assert [c["id"] for c in listed] == [cid]

    updated = api.put(f"/api/patient/{p.id}/contacts/{cid}", json={"name": "Bob L."})
    assert updated.status_code == 200 and updated.get_json()["name"] == "Bob L."

    assert api.delete(f"/api/patient/{p.id}/contacts/{cid}").status_code == 200
    assert PatientContact.query.get(cid) is None


def test_delete_unknown_contact_is_404(clients, app):
    p = _patient()
    assert clients["admin"].delete(f"/api/patient/{p.id}/contacts/999999").status_code == 404


def test_hr_cannot_create_contact(clients, app):
    p = _patient()
    assert clients["hr"].post(f"/api/patient/{p.id}/contacts", json={"name": "X"}).status_code == 403
