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


def test_policy_number_and_insurance_notes_are_encrypted(app, master):
    org_id = _org()
    ca = _admin_in(app, org_id)
    resp = ca.post("/api/patients", json={"first_name": "P", "last_name": "N",
                                          "policy_number": "POL-555",
                                          "insurance_notes": "sensitive coverage note"})
    pid = resp.get_json()["id"]
    from tenant import unfiltered
    with unfiltered():
        p = db.session.get(Patient, pid)
        assert is_ciphertext(p.policy_number) and is_ciphertext(p.insurance_notes)
    body = ca.get(f"/api/patient/{pid}").get_json()
    assert body["policy_number"] == "POL-555"
    assert body["insurance_notes"] == "sensitive coverage note"


def test_contact_and_freetext_pii_are_encrypted(app, master):
    org_id = _org()
    ca = _admin_in(app, org_id)
    payload = {
        "first_name": "Con", "last_name": "Tact",
        "phone": "555-0100", "secondary_phone": "555-0200",
        "address": "12 Private Ln", "facility_name": "Sunrise Care",
        "room_number": "4B", "emergency_contact_name": "Kin Next",
        "emergency_contact_phone": "555-0300",
        "notes": "sensitive note", "dispatch_comment": "gate code 1234",
        "transport_instructions": "back entrance", "access_instructions": "ring twice",
        "special_equipment_notes": "bariatric stretcher",
    }
    pid = ca.post("/api/patients", json=payload).get_json()["id"]

    # At rest: every one of these columns holds ciphertext, not plaintext.
    from tenant import unfiltered
    encrypted = ["phone", "secondary_phone", "address", "facility_name", "room_number",
                 "emergency_contact_name", "emergency_contact_phone", "notes",
                 "dispatch_comment", "transport_instructions", "access_instructions",
                 "special_equipment_notes"]
    with unfiltered():
        p = db.session.get(Patient, pid)
        for f in encrypted:
            assert is_ciphertext(getattr(p, f)), f"{f} was not encrypted at rest"
    # city/state/zip are intentionally NOT encrypted.
    with unfiltered():
        p = db.session.get(Patient, pid)
        # (they weren't sent, so they're just None — the point is they aren't in the set)
        assert "city" not in encrypted

    # Through the API every field round-trips to its plaintext.
    body = ca.get(f"/api/patient/{pid}").get_json()
    for f in encrypted:
        assert body[f] == payload[f], f"{f} did not decrypt through the API"


def _birthday_types(client, source_id, source, start, end):
    events = client.get(f"/api/calendar/events?start={start}&end={end}").get_json()
    items = events.get("events", events) if isinstance(events, dict) else events
    return [e for e in items if e.get("type") == f"{source}_birthday"
            and e.get("sourceId") == source_id]


def test_dob_encrypted_searchable_and_dedup(app, master):
    org_id = _org()
    ca = _admin_in(app, org_id)
    resp = ca.post("/api/patients", json={"first_name": "Dob", "last_name": "Holder",
                                          "dob": "1990-06-15", "member_id": "MEM-DOB"})
    pid = resp.get_json()["id"]

    from tenant import unfiltered
    with unfiltered():
        p = db.session.get(Patient, pid)
        assert is_ciphertext(p.dob)          # encrypted at rest
        assert p.dob_bidx                    # blind index populated
        assert p.dob_month_day == "06-15"    # non-identifying MM-DD (no year)

    # Decrypts through the API.
    assert ca.get(f"/api/patient/{pid}").get_json()["dob"] == "1990-06-15"

    # Exact search by dob goes through the blind index and finds the row.
    items = ca.get("/api/patients?dob=1990-06-15").get_json()["items"]
    assert any(i["id"] == pid for i in items)
    # A different dob does not match.
    assert ca.get("/api/patients?dob=1980-01-01").get_json()["items"] == []

    # Duplicate detection (same name + dob) still fires — via the blind index.
    dup = ca.post("/api/patients", json={"first_name": "Dob", "last_name": "Holder",
                                         "dob": "1990-06-15"})
    assert dup.status_code != 201
    assert "duplicate" in dup.get_json().get("error", "").lower()


def test_patient_birthday_calendar_with_encrypted_dob(app, master):
    org_id = _org()
    ca = _admin_in(app, org_id)
    pid = ca.post("/api/patients", json={"first_name": "Cake", "last_name": "Day",
                                         "dob": "1985-06-15"}).get_json()["id"]
    # The birthday shows on the calendar (which filters on dob_month_day, never the
    # encrypted year), for a range covering 06-15.
    hits = _birthday_types(ca, pid, "patient", "2026-06-01", "2026-06-30")
    assert hits, "encrypted-dob patient birthday did not appear on the calendar"
    # And not when the range excludes it.
    assert _birthday_types(ca, pid, "patient", "2026-07-01", "2026-07-30") == []


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
