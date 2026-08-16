"""Call caller_phone / caller_note encrypted at rest, decrypted through the API.
pickup/dropoff addresses deliberately stay plaintext (operational, carried by
realtime events + notifications). Same plaintext fallback + backfill as the rest."""

import base64
import os

import pytest

from models import db, Organization, Call
from conftest import make_user, login
from core.security import org_crypto
from core.security.crypto import is_ciphertext


@pytest.fixture()
def master(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    org_crypto.clear_cache()
    yield
    org_crypto.clear_cache()


def _org(slug="orgc"):
    o = Organization(name=slug, slug=slug)
    db.session.add(o)
    db.session.commit()
    return o.id


def _admin_in(app, org_id, username="admin_c"):
    c = app.test_client()
    login(c, make_user("admin", username=username, org_id=org_id).username)
    return c


def _new_call(client, phone="555-0000", note="a note"):
    r = client.post("/api/calls", json={
        "trip_date": "2026-06-15", "service_level": "BLS", "call_type": "scheduled",
        "pickup_address": "1 Alpha St", "dropoff_address": "2 Bravo Ave",
        "pickup_time": "10:00", "caller_phone": phone, "caller_note": note,
    })
    assert r.status_code == 201, r.get_json()
    return r.get_json()["id"]


def _stored(cid, field):
    from tenant import unfiltered
    with unfiltered():
        return getattr(db.session.get(Call, cid), field)


def test_caller_fields_encrypted_addresses_plaintext(app, master):
    c = _admin_in(app, _org())
    cid = _new_call(c, "555-CALL", "leave at front desk")

    assert is_ciphertext(_stored(cid, "caller_phone"))
    assert is_ciphertext(_stored(cid, "caller_note"))
    # Addresses are intentionally NOT encrypted.
    assert _stored(cid, "pickup_address") == "1 Alpha St"
    assert _stored(cid, "dropoff_address") == "2 Bravo Ave"

    body = c.get(f"/api/calls/{cid}").get_json()
    assert body["caller_phone"] == "555-CALL"
    assert body["caller_note"] == "leave at front desk"
    assert body["pickup_address"] == "1 Alpha St"

    # Update re-encrypts the changed caller field.
    c.put(f"/api/calls/{cid}", json={"caller_phone": "555-9999"})
    assert is_ciphertext(_stored(cid, "caller_phone"))
    assert c.get(f"/api/calls/{cid}").get_json()["caller_phone"] == "555-9999"


def test_call_plaintext_mode_without_key(app, monkeypatch):
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    org_crypto.clear_cache()
    c = _admin_in(app, _org())
    cid = _new_call(c, "555-1", "note")
    assert _stored(cid, "caller_phone") == "555-1"   # plaintext
    assert c.get(f"/api/calls/{cid}").get_json()["caller_note"] == "note"


def test_call_backfill_encrypts_existing_plaintext(app, master):
    org_id = _org()
    from tenant import set_current_org
    set_current_org(org_id)
    call = Call(trip_date="2026-06-15", service_level="BLS", status="new",
                caller_phone="555-LEGACY", caller_note="legacy note")
    db.session.add(call)
    db.session.commit()
    set_current_org(None)
    cid = call.id
    assert _stored(cid, "caller_phone") == "555-LEGACY"

    result = app.test_cli_runner().invoke(args=["encrypt-existing-fields", "--yes"])
    assert result.exit_code == 0, result.output
    assert is_ciphertext(_stored(cid, "caller_phone")) and is_ciphertext(_stored(cid, "caller_note"))
    c = _admin_in(app, org_id)
    assert c.get(f"/api/calls/{cid}").get_json()["caller_phone"] == "555-LEGACY"
