"""Employee contact PII (phone, email) encrypted at rest, decrypted through the API,
with the same plaintext fallback and backfill as the patient fields."""

import base64
import os

import pytest

from models import db, Organization, Employee
from conftest import make_user, login
from core.security import org_crypto
from core.security.crypto import is_ciphertext


@pytest.fixture()
def master(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    org_crypto.clear_cache()
    yield
    org_crypto.clear_cache()


def _org(slug="orge"):
    o = Organization(name=slug, slug=slug)
    db.session.add(o)
    db.session.commit()
    return o.id


def _admin_in(app, org_id, username="admin_e"):
    c = app.test_client()
    login(c, make_user("admin", username=username, org_id=org_id).username)
    return c


def _stored(eid, field):
    from tenant import unfiltered
    with unfiltered():
        return getattr(db.session.get(Employee, eid), field)


def test_employee_phone_and_email_encrypted_and_decrypted(app, master):
    org_id = _org()
    c = _admin_in(app, org_id)
    resp = c.post("/api/employees", json={
        "firstName": "Enc", "lastName": "Emp",
        "phone": "555-9000", "email": "enc@example.com",
    })
    assert resp.status_code == 201
    eid = resp.get_json()["id"]

    assert is_ciphertext(_stored(eid, "phone"))
    assert is_ciphertext(_stored(eid, "email"))

    body = c.get(f"/api/employees/{eid}").get_json()
    assert body["phone"] == "555-9000"
    assert body["email"] == "enc@example.com"

    # Update re-encrypts.
    c.put(f"/api/employees/{eid}", json={"firstName": "Enc", "lastName": "Emp",
                                         "phone": "555-1111", "email": "new@example.com"})
    assert is_ciphertext(_stored(eid, "phone"))
    assert c.get(f"/api/employees/{eid}").get_json()["email"] == "new@example.com"


def test_employee_plaintext_mode_without_key(app, monkeypatch):
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    org_crypto.clear_cache()
    org_id = _org()
    c = _admin_in(app, org_id)
    eid = c.post("/api/employees", json={"firstName": "Plain", "lastName": "Emp",
                                         "phone": "555-2", "email": "p@x.com"}).get_json()["id"]
    assert _stored(eid, "phone") == "555-2"      # stored plaintext
    assert c.get(f"/api/employees/{eid}").get_json()["email"] == "p@x.com"


def test_employee_dob_encrypted_with_month_day_index(app, master):
    org_id = _org()
    c = _admin_in(app, org_id)
    eid = c.post("/api/employees", json={"firstName": "Birth", "lastName": "Day",
                                         "dob": "1988-03-09"}).get_json()["id"]
    assert is_ciphertext(_stored(eid, "dob"))          # encrypted at rest
    from tenant import unfiltered
    with unfiltered():
        assert db.session.get(Employee, eid).dob_month_day == "03-09"  # non-identifying
    assert c.get(f"/api/employees/{eid}").get_json()["dob"] == "1988-03-09"  # decrypts


def test_employee_backfill_encrypts_existing_plaintext(app, master):
    from tenant import set_current_org
    org_id = _org()
    set_current_org(org_id)
    e = Employee(first_name="Old", last_name="Row", phone="555-LEGACY", email="old@x.com")
    db.session.add(e)
    db.session.commit()
    set_current_org(None)
    eid = e.id
    assert _stored(eid, "phone") == "555-LEGACY"

    result = app.test_cli_runner().invoke(args=["encrypt-existing-fields", "--yes"])
    assert result.exit_code == 0, result.output
    assert is_ciphertext(_stored(eid, "phone")) and is_ciphertext(_stored(eid, "email"))
