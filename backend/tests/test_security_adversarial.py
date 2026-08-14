"""Phase 7 — consolidated adversarial security pass.

An attacker's-eye pass over the multi-tenant / crypto / realtime surface. Each test
is written as an attack that must fail. Scenarios already proven exhaustively by a
dedicated suite are mapped here rather than duplicated:

  Cross-tenant read / mutate by id ............ test_tenant_isolation.py
  Child-by-id cross-org leak .................. test_tenant_isolation.py
  Document download scoped to the org ........ test_tenant_isolation.py
  Forged identity headers ignored ............ test_security.py
  CSRF required on mutations ................. test_security.py
  Stolen session dies when user disabled ..... test_security.py
  Role/demotion takes effect next request .... test_security.py
  Invite replay / expired / revoked / bad .... test_invitations.py
  Invite org+role come from token, not client  test_invitations.py
  Lost-owner recovery redeem + session revoke  test_org_security.py
  Recovery codes org-scoped, hash-only ....... test_org_security.py
  Realtime bus isolates across orgs .......... test_events.py
  Blind-index exact match, no decryption ..... test_patient_encryption.py
  Stolen DB w/o key: ciphertext not leaked ... test_encrypted_fields.py

This file adds the cross-cutting attacks not pinned down elsewhere: org_id
injection on create, AAD relocation of ciphertext across org/field at the API
level, master-key rotation behaviour, realtime cross-org at the bus, and the
concurrent-edit (last-write-wins) contract.
"""

import base64
import os

import pytest

from models import db, Organization, Patient
from conftest import make_user, login
from core.security import org_crypto, keyring
from core.security.keyring import KeyManagementError
from core.security.crypto import is_ciphertext
from tenant import unfiltered, set_current_org
import events


# ── Fixtures / helpers ───────────────────────────────────────────────────────

@pytest.fixture()
def master(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    org_crypto.clear_cache()
    yield
    org_crypto.clear_cache()


def _org(slug):
    o = Organization(name=slug, slug=slug)
    db.session.add(o)
    db.session.commit()
    return o.id


def _admin(app, org_id, username):
    # The test client shares Flask's `g` with the enclosing app-context, so a prior
    # authenticated request can leave current_org set; reset it before this login so
    # the (correctly global) unauthenticated lookup isn't tenant-filtered. In
    # production every request gets a fresh context, so this never arises there.
    set_current_org(None)
    user = make_user("admin", username=username, org_id=org_id)
    c = app.test_client()
    login(c, user.username)
    return c


def _stored(pid, field="member_id"):
    with unfiltered():
        return getattr(db.session.get(Patient, pid), field)


# ── 1. org_id injection on create is ignored (server stamps the caller's org) ──

def test_client_supplied_org_id_on_create_is_ignored(app):
    a, b = _org("orga"), _org("orgb")
    ca = _admin(app, a, "admin_a")

    # Admin of org A tries to plant a record into org B by sending org_id in the body.
    resp = ca.post("/api/patients", json={
        "first_name": "Injected", "last_name": "Row",
        "org_id": b, "organization_id": b,
    })
    assert resp.status_code == 201
    pid = resp.get_json()["id"]

    # The tenant write-stamp wins: the row lands in A, never in the injected org B.
    with unfiltered():
        assert db.session.get(Patient, pid).org_id == a

    # And org B genuinely cannot see it.
    cb = _admin(app, b, "admin_b")
    assert cb.get(f"/api/patient/{pid}").status_code == 404


# ── 2. AAD binding: ciphertext cannot be relocated across orgs ────────────────

def test_ciphertext_moved_to_another_org_does_not_decrypt(app, master):
    a, b = _org("orga"), _org("orgb")
    ca = _admin(app, a, "admin_a")
    cb = _admin(app, b, "admin_b")

    pid_a = ca.post("/api/patients", json={"first_name": "A", "last_name": "One",
                                           "member_id": "SECRET-A"}).get_json()["id"]
    ct_a = _stored(pid_a, "member_id")
    assert is_ciphertext(ct_a)

    pid_b = cb.post("/api/patients", json={"first_name": "B", "last_name": "Two"}).get_json()["id"]
    # Attacker with DB write drops org A's ciphertext into an org B row.
    with unfiltered():
        pb = db.session.get(Patient, pid_b)
        pb.member_id = ct_a
        db.session.commit()

    # Reading B's row returns None (AAD org mismatch) — never A's plaintext, never
    # the raw token, and no crash.
    body = cb.get(f"/api/patient/{pid_b}").get_json()
    assert body["member_id"] is None


def test_ciphertext_moved_to_another_field_does_not_decrypt(app, master):
    a = _org("orga")
    ca = _admin(app, a, "admin_a")
    pid = ca.post("/api/patients", json={"first_name": "A", "last_name": "One",
                                         "member_id": "SECRET-M"}).get_json()["id"]
    ct = _stored(pid, "member_id")

    # Same org, same row, but relocate member_id's ciphertext into policy_number:
    # the field is part of the AAD, so it must fail to decrypt.
    with unfiltered():
        p = db.session.get(Patient, pid)
        p.policy_number = ct
        db.session.commit()

    body = ca.get(f"/api/patient/{pid}").get_json()
    assert body["policy_number"] is None
    assert body["member_id"] == "SECRET-M"  # its own field still fine


# ── 3. Stolen DB without the master key: encrypted fields never leak ──────────

def test_stolen_db_without_master_key_reveals_no_plaintext(app, monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    org_crypto.clear_cache()
    a = _org("orga")
    ca = _admin(app, a, "admin_a")
    pid = ca.post("/api/patients", json={"first_name": "A", "last_name": "One",
                                         "member_id": "MEM-STOLEN",
                                         "policy_number": "POL-STOLEN"}).get_json()["id"]
    assert is_ciphertext(_stored(pid, "member_id"))

    # The DB is exfiltrated but the master key is not: the app (or the thief) has no
    # key. Every encrypted field reads back as None — the ciphertext is inert.
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    org_crypto.clear_cache()
    body = ca.get(f"/api/patient/{pid}").get_json()
    assert body["member_id"] is None and body["policy_number"] is None


# ── 4. Master-key rotation ────────────────────────────────────────────────────

def test_master_key_rotation_keeps_old_data_readable_and_uses_newest_for_new(app, monkeypatch):
    v1 = base64.b64encode(os.urandom(32)).decode()
    v2 = base64.b64encode(os.urandom(32)).decode()

    # Start on v1 only; provision an org and encrypt a field (DEK wrapped under v1).
    monkeypatch.setenv("EMS_MASTER_KEY", f"v1:{v1}")
    org_crypto.clear_cache()
    a = _org("orga")
    ca = _admin(app, a, "admin_a")
    pid = ca.post("/api/patients", json={"first_name": "A", "last_name": "One",
                                         "member_id": "MEM-ROT"}).get_json()["id"]
    with unfiltered():
        assert db.session.get(Organization, a).data_key_version == 1

    # Rotate the master key: add v2 alongside v1. Existing DEK stays v1-wrapped and
    # must remain readable (rotation needs no field re-encryption).
    monkeypatch.setenv("EMS_MASTER_KEY", f"v1:{v1},v2:{v2}")
    org_crypto.clear_cache()
    assert ca.get(f"/api/patient/{pid}").get_json()["member_id"] == "MEM-ROT"

    # A newly provisioned org wraps its DEK under the newest version.
    b = _org("orgb")
    cb = _admin(app, b, "admin_b")
    cb.post("/api/patients", json={"first_name": "B", "last_name": "Two", "member_id": "MEM-NEW"})
    with unfiltered():
        assert db.session.get(Organization, b).data_key_version == 2

    # Retiring v1 before re-wrapping org A's DEK makes it unrecoverable — proving the
    # old version must be kept until a re-wrap. The field then reads back as None.
    monkeypatch.setenv("EMS_MASTER_KEY", f"v2:{v2}")
    org_crypto.clear_cache()
    with unfiltered():
        with pytest.raises(KeyManagementError):
            keyring.unwrap_dek(db.session.get(Organization, a).data_key_wrapped, 1)
    org_crypto.clear_cache()
    assert ca.get(f"/api/patient/{pid}").get_json()["member_id"] is None


# ── 5. Realtime: a subscriber of one org never receives another org's events ──

def test_realtime_subscriber_is_isolated_to_its_org():
    a_q = events.bus.subscribe(101)
    b_q = events.bus.subscribe(202)
    try:
        events.bus.publish("call.created", 101, entity_type="call", entity_id=1)
        # A got it; B's queue stays empty — no cross-org eavesdropping on the stream.
        assert a_q.get_nowait()["type"] == "call.created"
        assert b_q.empty()
    finally:
        events.bus.unsubscribe(101, a_q)
        events.bus.unsubscribe(202, b_q)


# ── 6. Concurrent edit contract: last write wins, no leak, no crash ──────────

def test_two_editors_last_write_wins(app):
    a = _org("orga")
    u_admin = make_user("admin", username="ed_admin", org_id=a)
    u_super = make_user("supervisor", username="ed_super", org_id=a)
    c1, c2 = app.test_client(), app.test_client()
    login(c1, u_admin.username)
    login(c2, u_super.username)

    pid = c1.post("/api/patients", json={"first_name": "Start", "last_name": "Row"}).get_json()["id"]

    # Both read, both write; the app takes last-write-wins (advisory concurrency,
    # matching its warn-not-block philosophy). Both succeed, neither corrupts the row.
    assert c1.put(f"/api/patient/{pid}", json={"first_name": "First"}).status_code == 200
    assert c2.put(f"/api/patient/{pid}", json={"first_name": "Second"}).status_code == 200

    with unfiltered():
        assert db.session.get(Patient, pid).first_name == "Second"


# ── 7. Invite acceptance: role/org come from the token, not the client body ──

def test_invite_role_and_org_cannot_be_escalated_by_the_client(app):
    a, b = _org("orga"), _org("orgb")
    ca = _admin(app, a, "admin_a")

    made = ca.post("/api/invitations", json={
        "email": "newhire@example.com", "role": "dispatcher",
    })
    assert made.status_code in (200, 201), made.get_json()
    token = made.get_json()["token"]

    # The invitee tries to escalate to admin in org B while accepting.
    anon = app.test_client()
    resp = anon.post("/api/invitations/accept", json={
        "token": token, "username": "newhire", "password": "Str0ngPass!",
        "display_name": "New Hire",
        "role": "admin", "org_id": b, "is_owner": True, "is_platform_admin": True,
    })
    assert resp.status_code in (200, 201), resp.get_json()

    from models import User
    with unfiltered():
        u = User.query.filter_by(username="newhire").first()
        assert u.role == "dispatcher"          # from the token, not the body
        assert u.org_id == a                    # bound to the inviting org
        assert not u.is_owner and not u.is_platform_admin
