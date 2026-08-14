"""Patient.member_id encryption end to end: encrypted at rest, decrypted through the
API, blind index set, backfill of existing plaintext, and plaintext fallback."""

import base64
import os

import pytest

from models import db, Organization, Patient
from conftest import make_user, login
from core.security import org_crypto
from core.security.crypto import is_ciphertext


@pytest.fixture()
def master(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    org_crypto.clear_cache()
    yield
    org_crypto.clear_cache()


def _org(slug="orga"):
    o = Organization(name=slug, slug=slug)
    db.session.add(o)
    db.session.commit()
    return o.id


def _admin_in(app, org_id, username="admin_a"):
    user = make_user("admin", username=username, org_id=org_id)
    c = app.test_client()
    login(c, user.username)
    return c


def _stored_member_id(pid):
    from tenant import unfiltered
    with unfiltered():
        return db.session.get(Patient, pid).member_id


def test_member_id_is_encrypted_at_rest_and_decrypted_through_the_api(app, master):
    org_id = _org()
    ca = _admin_in(app, org_id)

    resp = ca.post("/api/patients", json={"first_name": "Enc", "last_name": "Rypt",
                                          "dob": "1980-01-01", "member_id": "MEM-4242"})
    assert resp.status_code == 201
    pid = resp.get_json()["id"]

    # At rest it is ciphertext, and a blind index was set.
    stored = _stored_member_id(pid)
    assert is_ciphertext(stored)
    from tenant import unfiltered
    with unfiltered():
        assert db.session.get(Patient, pid).member_id_bidx  # index populated

    # Through the API it comes back as plaintext.
    assert ca.get(f"/api/patient/{pid}").get_json()["member_id"] == "MEM-4242"

    # Updating re-encrypts and the API returns the new plaintext.
    ca.put(f"/api/patient/{pid}", json={"member_id": "MEM-9999"})
    assert is_ciphertext(_stored_member_id(pid))
    assert ca.get(f"/api/patient/{pid}").get_json()["member_id"] == "MEM-9999"


def test_search_by_member_id_uses_the_blind_index(app, master):
    org_id = _org()
    ca = _admin_in(app, org_id)
    ca.post("/api/patients", json={"first_name": "Find", "last_name": "Me", "member_id": "MEM-777"})
    ca.post("/api/patients", json={"first_name": "Other", "last_name": "One", "member_id": "MEM-888"})

    # Exact-match search finds only the matching patient — via the blind index, with
    # no decryption of the column.
    items = ca.get("/api/patients?member_id=MEM-777").get_json()["items"]
    assert len(items) == 1 and items[0]["last_name"] == "Me"
    assert items[0]["member_id"] == "MEM-777"

    # Normalised (case/space-insensitive).
    assert len(ca.get("/api/patients?member_id=mem-777 ").get_json()["items"]) == 1
    # A non-match returns nothing.
    assert ca.get("/api/patients?member_id=MEM-000").get_json()["items"] == []


def test_plaintext_mode_when_no_master_key(app, monkeypatch):
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    org_crypto.clear_cache()
    org_id = _org()
    ca = _admin_in(app, org_id)
    resp = ca.post("/api/patients", json={"first_name": "Plain", "last_name": "Text",
                                          "member_id": "MEM-1"})
    pid = resp.get_json()["id"]
    assert _stored_member_id(pid) == "MEM-1"  # stored plaintext
    assert ca.get(f"/api/patient/{pid}").get_json()["member_id"] == "MEM-1"


def test_backfill_encrypts_existing_plaintext(app, master):
    org_id = _org()
    # A pre-existing plaintext row (as if created before encryption was enabled).
    from tenant import set_current_org
    set_current_org(org_id)
    p = Patient(first_name="Old", last_name="Row", member_id="MEM-LEGACY")
    db.session.add(p)
    db.session.commit()
    set_current_org(None)
    pid = p.id
    assert _stored_member_id(pid) == "MEM-LEGACY"

    result = app.test_cli_runner().invoke(args=["encrypt-existing-fields", "--yes"])
    assert result.exit_code == 0, result.output

    assert is_ciphertext(_stored_member_id(pid))          # now encrypted in place
    ca = _admin_in(app, org_id)
    assert ca.get(f"/api/patient/{pid}").get_json()["member_id"] == "MEM-LEGACY"  # still readable
