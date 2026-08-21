"""The encrypt-in-place backfill: pre-existing plaintext becomes ciphertext at
rest, still decrypts on read, and re-running is a no-op. This is what the desktop
runs on its first launch with a master key."""

import base64
import os

from models import db, Organization, Call
from conftest import make_user, login
from core.security import org_crypto
from core.security.crypto import is_ciphertext
from core.security.backfill import encrypt_existing_plaintext


def _org(slug="orgbf"):
    o = Organization(name=slug, slug=slug)
    db.session.add(o)
    db.session.commit()
    return o.id


def _admin_in(app, org_id):
    c = app.test_client()
    login(c, make_user("admin", username="admin_bf", org_id=org_id).username)
    return c


def _stored(cid, field):
    from tenant import unfiltered
    with unfiltered():
        return getattr(db.session.get(Call, cid), field)


def test_backfill_encrypts_preexisting_plaintext_and_is_idempotent(app, monkeypatch):
    # 1) Create a call while encryption is OFF → caller fields are plaintext.
    org_id = _org()
    c = _admin_in(app, org_id)
    cid = c.post("/api/calls", json={
        "trip_date": "2026-06-15", "service_level": "BLS", "call_type": "scheduled",
        "pickup_address": "1 A St", "dropoff_address": "2 B Ave",
        "pickup_time": "10:00", "caller_phone": "555-PLAIN", "caller_note": "front desk",
    }).get_json()["id"]
    assert _stored(cid, "caller_phone") == "555-PLAIN"

    # 2) Turn encryption ON and backfill.
    monkeypatch.setenv("EMS_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    org_crypto.clear_cache()
    with app.app_context():
        counts = encrypt_existing_plaintext()
    assert counts.get("call", 0) >= 1

    # 3) At rest it is now ciphertext, but it still decrypts back on read.
    assert is_ciphertext(_stored(cid, "caller_phone"))
    items = c.get("/api/calls?trip_date=2026-06-15").get_json()["items"]
    row = next(x for x in items if x["id"] == cid)
    assert row["caller_phone"] == "555-PLAIN"

    # 4) Idempotent — nothing plaintext left to encrypt.
    with app.app_context():
        again = encrypt_existing_plaintext()
    assert again.get("call", 0) == 0
    org_crypto.clear_cache()


def test_backfill_is_noop_without_a_master_key(app, monkeypatch):
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    org_crypto.clear_cache()
    with app.app_context():
        assert encrypt_existing_plaintext() == {}
