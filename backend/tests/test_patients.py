"""Isolated backend tests for the Patients domain.

These lock in the CURRENT behavior of patient CRUD, duplicate detection,
archive/restore, alerts, and contacts before the frontend PatientsPage
decomposition — they are a regression net, not a spec change. Where behavior is
notable it is called out in a comment (e.g. patient routes currently have no
role gate; dob has no format validation).

Run: pytest backend/tests/test_patients.py -v
"""

import pytest

from models import Patient, AuditLog


# No X-User-Id: audit logs then store a null user_id (the isolated test DB has no
# seeded users, and AuditLog.user_id is a FK to user). Name + role are enough to
# exercise the routes.
ADMIN = {"X-User-Name": "Admin", "X-User-Role": "admin"}


@pytest.fixture(autouse=True)
def _signed_in(client, app):
    """Sign the shared client in.

    Every /api/ route now requires a session, so these tests need one. Applied
    per module rather than in conftest so `client` stays anonymous where that is
    the point — test_security.py asserts what an unauthenticated caller gets.
    """
    from conftest import make_user, login

    user = make_user("admin", username="patients_admin")
    login(client, user.username)
    return client


def _create(client, **over):
    body = {"first_name": "John", "last_name": "Doe", "dob": "1980-05-01"}
    body.update(over)
    return client.post("/api/patients", json=body, headers=ADMIN)


# ── Create + required fields ────────────────────────────────────────────────

def test_create_patient(client):
    r = _create(client)
    assert r.status_code == 201
    data = r.get_json()
    assert data["first_name"] == "John"
    assert data["last_name"] == "Doe"
    assert data["id"] > 0


def test_create_requires_first_and_last_name(client):
    assert client.post("/api/patients", json={"first_name": "John"}, headers=ADMIN).status_code == 400
    assert client.post("/api/patients", json={"last_name": "Doe"}, headers=ADMIN).status_code == 400


def test_create_rejects_non_json_body(client):
    # Flask's get_json() raises 415 (Unsupported Media Type) for a non-JSON
    # content type before the route's own check runs. Locking current behavior.
    r = client.post("/api/patients", data="not json", content_type="text/plain", headers=ADMIN)
    assert r.status_code == 415


def test_create_rejects_overlong_field(client):
    r = _create(client, notes="x" * 6000)  # notes limit is 5000
    assert r.status_code == 400


def test_dob_has_no_format_validation(client):
    # Documents current behavior: dob is stored as a free-form string.
    r = _create(client, dob="not-a-date", last_name="Freeform")
    assert r.status_code == 201


# ── Duplicate detection (first + last + dob; case/whitespace-insensitive) ────

def test_exact_duplicate_returns_409(client):
    assert _create(client).status_code == 201
    r = _create(client)
    assert r.status_code == 409
    assert "existing_patient" in r.get_json()


def test_duplicate_with_whitespace_differences(client):
    assert _create(client).status_code == 201
    r = _create(client, first_name="  John  ", last_name=" Doe ")
    assert r.status_code == 409


def test_duplicate_case_insensitive(client):
    assert _create(client).status_code == 201
    r = _create(client, first_name="JOHN", last_name="doe")
    assert r.status_code == 409


def test_same_name_different_dob_is_not_duplicate(client):
    assert _create(client).status_code == 201
    r = _create(client, dob="1990-01-01")
    assert r.status_code == 201


def test_same_dob_different_name_is_not_duplicate(client):
    assert _create(client).status_code == 201
    r = _create(client, first_name="Jane", last_name="Smith")
    assert r.status_code == 201


def test_no_dob_skips_duplicate_check(client):
    # Duplicate detection needs all three of first+last+dob; without dob it is skipped.
    assert _create(client, dob=None).status_code == 201
    assert _create(client, dob=None).status_code == 201


# ── Update ──────────────────────────────────────────────────────────────────

def test_update_patient(client):
    pid = _create(client).get_json()["id"]
    r = client.put(f"/api/patient/{pid}", json={"city": "Springfield"}, headers=ADMIN)
    assert r.status_code == 200
    assert r.get_json()["city"] == "Springfield"


def test_update_does_not_conflict_with_itself(client):
    pid = _create(client).get_json()["id"]
    # Re-submitting the same identity fields must not 409 against itself.
    r = client.put(f"/api/patient/{pid}",
                   json={"first_name": "John", "last_name": "Doe", "dob": "1980-05-01", "city": "X"},
                   headers=ADMIN)
    assert r.status_code == 200


def test_update_conflicts_with_other_patient(client):
    _create(client).get_json()
    other = _create(client, first_name="Jane", last_name="Smith").get_json()["id"]
    r = client.put(f"/api/patient/{other}",
                   json={"first_name": "John", "last_name": "Doe", "dob": "1980-05-01"},
                   headers=ADMIN)
    assert r.status_code == 409


def test_update_missing_patient_returns_json_404(client):
    r = client.put("/api/patient/999999", json={"city": "X"}, headers=ADMIN)
    assert r.status_code == 404
    assert r.get_json()["error"]  # JSON, not HTML


# ── Archive / restore ───────────────────────────────────────────────────────

def test_archive_patient(client):
    pid = _create(client).get_json()["id"]
    assert client.delete(f"/api/patient/{pid}", headers=ADMIN).status_code == 200
    assert Patient.query.get(pid).is_archived is True


def test_archive_already_archived_returns_409(client):
    pid = _create(client).get_json()["id"]
    client.delete(f"/api/patient/{pid}", headers=ADMIN)
    assert client.delete(f"/api/patient/{pid}", headers=ADMIN).status_code == 409


def test_restore_patient(client):
    pid = _create(client).get_json()["id"]
    client.delete(f"/api/patient/{pid}", headers=ADMIN)
    assert client.post(f"/api/patient/{pid}/restore", headers=ADMIN).status_code == 200
    assert Patient.query.get(pid).is_archived is False


def test_restore_non_archived_returns_409(client):
    pid = _create(client).get_json()["id"]
    assert client.post(f"/api/patient/{pid}/restore", headers=ADMIN).status_code == 409


def test_archived_excluded_by_default_included_with_flag(client):
    pid = _create(client).get_json()["id"]
    client.delete(f"/api/patient/{pid}", headers=ADMIN)
    default = client.get("/api/patients", headers=ADMIN).get_json()
    assert all(p["id"] != pid for p in default["items"])
    with_archived = client.get("/api/patients?show_archived=1", headers=ADMIN).get_json()
    assert any(p["id"] == pid for p in with_archived["items"])


def test_duplicate_check_includes_archived(client):
    # An archived patient still blocks creating an identical active one.
    pid = _create(client).get_json()["id"]
    client.delete(f"/api/patient/{pid}", headers=ADMIN)
    assert _create(client).status_code == 409


# ── Search / list ───────────────────────────────────────────────────────────

def test_search_by_name(client):
    _create(client, first_name="Alice", last_name="Wonder", dob="1970-01-01")
    _create(client, first_name="Bob", last_name="Builder", dob="1971-01-01")
    items = client.get("/api/patients?name=Alice", headers=ADMIN).get_json()["items"]
    assert len(items) == 1 and items[0]["first_name"] == "Alice"


# ── Alerts ──────────────────────────────────────────────────────────────────

def test_create_and_list_alert(client):
    pid = _create(client).get_json()["id"]
    r = client.post(f"/api/patient/{pid}/alerts",
                    json={"category": "safety", "severity": "warning", "title": "Fall risk"},
                    headers=ADMIN)
    assert r.status_code == 201
    listing = client.get(f"/api/patient/{pid}/alerts", headers=ADMIN).get_json()
    assert any(a["title"] == "Fall risk" for a in listing)


def test_alert_invalid_category_and_severity(client):
    pid = _create(client).get_json()["id"]
    assert client.post(f"/api/patient/{pid}/alerts",
                       json={"category": "bogus", "severity": "warning", "title": "x"},
                       headers=ADMIN).status_code == 400
    assert client.post(f"/api/patient/{pid}/alerts",
                       json={"category": "safety", "severity": "bogus", "title": "x"},
                       headers=ADMIN).status_code == 400


def test_alert_requires_title(client):
    pid = _create(client).get_json()["id"]
    assert client.post(f"/api/patient/{pid}/alerts",
                       json={"category": "safety", "severity": "warning"},
                       headers=ADMIN).status_code == 400


def test_patient_list_summarizes_active_alerts(client):
    with_alert = _create(client, first_name="Alerted").get_json()["id"]
    _create(client, first_name="Clean")
    client.post(f"/api/patient/{with_alert}/alerts",
                json={"category": "safety", "severity": "warning", "title": "Fall risk"}, headers=ADMIN)
    client.post(f"/api/patient/{with_alert}/alerts",
                json={"category": "behavior", "severity": "critical", "title": "Aggressive"}, headers=ADMIN)

    items = client.get("/api/patients?per_page=100").get_json()["items"]
    by_id = {p["id"]: p for p in items}
    # Highest severity wins, and both active alerts are counted.
    assert by_id[with_alert]["active_alert_count"] == 2
    assert by_id[with_alert]["active_alert_severity"] == "critical"
    # A patient without alerts reports none rather than omitting the field.
    clean = next(p for p in items if p["first_name"] == "Clean")
    assert clean["active_alert_count"] == 0
    assert clean["active_alert_severity"] is None


# ── Contacts ────────────────────────────────────────────────────────────────

def test_create_and_list_contact(client):
    pid = _create(client).get_json()["id"]
    r = client.post(f"/api/patient/{pid}/contacts",
                    json={"name": "Mary Doe", "relationship": "Daughter", "phone": "555-1234"},
                    headers=ADMIN)
    assert r.status_code == 201
    listing = client.get(f"/api/patient/{pid}/contacts", headers=ADMIN).get_json()
    assert any(c["name"] == "Mary Doe" for c in listing)


def test_contact_requires_name(client):
    pid = _create(client).get_json()["id"]
    assert client.post(f"/api/patient/{pid}/contacts",
                       json={"relationship": "Friend"}, headers=ADMIN).status_code == 400


# ── Call history relationship ───────────────────────────────────────────────

def test_patient_call_history_empty(client):
    pid = _create(client).get_json()["id"]
    r = client.get(f"/api/patient/{pid}/calls", headers=ADMIN)
    assert r.status_code == 200
    assert isinstance(r.get_json(), list)


# ── Access / audit (documents current behavior) ─────────────────────────────

def test_patient_create_requires_a_session(app):
    """This test used to assert the opposite — that patient routes had no gate
    at all — as "current behaviour pending the auth phase". That phase landed:
    an anonymous caller could create patient records, and could read 22KB of
    existing ones. Both are closed now."""
    anon = app.test_client()
    r = anon.post("/api/patients",
                  json={"first_name": "No", "last_name": "Gate", "dob": "2000-01-01"})
    assert r.status_code == 401


def test_create_writes_audit_log(client):
    _create(client)
    assert AuditLog.query.filter(AuditLog.entity_type == "patient").count() >= 1
