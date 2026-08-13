"""Organisation security: owner continuity, recovery codes, emergency redeem.

Security-critical, so the negative cases are covered: only an owner grants
ownership, recovery codes are one-time and org-scoped, and the emergency redeem
is single-use, revokes sessions and restores exactly the nominated account.
"""

import hashlib

from models import db, Organization, User, OrgRecoveryCode, UserSession
from conftest import make_user, login

STRONG = "Str0ngPass!"


def _orgs():
    a = Organization(name="Org A", slug="orga")
    b = Organization(name="Org B", slug="orgb")
    db.session.add_all([a, b])
    db.session.commit()
    return a.id, b.id


def _admin(app, org_id, username, owner=False):
    user = make_user("admin", username=username, org_id=org_id, is_owner=owner)
    c = app.test_client()
    login(c, user.username)
    return c


# ── Single-admin warning ─────────────────────────────────────────────────────

def test_security_status_flags_a_single_admin(app):
    a, _ = _orgs()
    ca = _admin(app, a, "admin_a", owner=True)
    body = ca.get("/api/org/security").get_json()
    assert body["adminCount"] == 1 and body["isOnlyAdmin"] is True
    assert body["ownerCount"] == 1

    make_user("admin", username="admin_a2", org_id=a)
    body2 = ca.get("/api/org/security").get_json()
    assert body2["adminCount"] == 2 and body2["isOnlyAdmin"] is False


# ── Recovery codes ───────────────────────────────────────────────────────────

def test_recovery_codes_generate_once_store_hashes_and_are_org_scoped(app):
    a, b = _orgs()
    ca = _admin(app, a, "admin_a", owner=True)
    cb = _admin(app, b, "admin_b", owner=True)

    r = ca.post("/api/org/recovery-codes")
    assert r.status_code == 201
    codes = r.get_json()["codes"]
    assert len(codes) == 10
    # Only hashes stored, scoped to org A.
    from tenant import unfiltered
    with unfiltered():
        rows_a = OrgRecoveryCode.query.filter_by(org_id=a).all()
        assert len(rows_a) == 10
        assert rows_a[0].code_hash == hashlib.sha256(codes[0].encode()).hexdigest()
        assert OrgRecoveryCode.query.filter_by(org_id=b).count() == 0

    # Regenerating replaces the prior unused set (still 10 for A, none leaked to B).
    ca.post("/api/org/recovery-codes")
    with unfiltered():
        assert OrgRecoveryCode.query.filter_by(org_id=a).count() == 10
        assert OrgRecoveryCode.query.filter_by(org_id=b).count() == 0
    # B generating does not touch A.
    cb.post("/api/org/recovery-codes")
    with unfiltered():
        assert OrgRecoveryCode.query.filter_by(org_id=a).count() == 10


def test_non_admin_cannot_generate_recovery_codes(app):
    a, _ = _orgs()
    disp = make_user("dispatcher", username="disp_a", org_id=a)
    c = app.test_client()
    login(c, disp.username)
    assert c.post("/api/org/recovery-codes").status_code == 403


# ── Ownership grant ──────────────────────────────────────────────────────────

def test_only_owner_grants_ownership_to_an_admin(app):
    a, b = _orgs()
    owner = _admin(app, a, "owner_a", owner=True)
    admin2 = make_user("admin", username="admin_a2", org_id=a)
    disp = make_user("dispatcher", username="disp_a", org_id=a)

    # Owner grants ownership to another admin.
    r = owner.post("/api/org/owners", json={"userId": admin2.id})
    assert r.status_code == 200 and r.get_json()["isOwner"] is True

    # A non-owner admin cannot grant.
    non_owner = _admin(app, a, "admin_a3")
    assert non_owner.post("/api/org/owners", json={"userId": disp.id}).status_code == 403

    # Ownership can only go to an active admin.
    assert owner.post("/api/org/owners", json={"userId": disp.id}).status_code == 400

    # Cross-org target is not found.
    admin_b = make_user("admin", username="admin_b", org_id=b)
    assert owner.post("/api/org/owners", json={"userId": admin_b.id}).status_code == 404


# ── Emergency redeem ─────────────────────────────────────────────────────────

def test_redeem_restores_the_account_revokes_sessions_and_is_one_time(app):
    a, _ = _orgs()
    ca = _admin(app, a, "owner_a", owner=True)
    code = ca.post("/api/org/recovery-codes").get_json()["codes"][0]

    # The locked-out admin account (disabled) + a live session that must be revoked.
    locked = make_user("admin", username="locked_admin", org_id=a)
    locked.is_active = False
    sess = UserSession(sid="sid-live", user_id=locked.id, created_at="2026-01-01T00:00:00",
                       last_seen_at="2026-01-01T00:00:00", revoked=False)
    db.session.add(sess)
    db.session.commit()

    anon = app.test_client()
    r = anon.post("/api/org/recovery/redeem",
                  json={"code": code, "username": "locked_admin", "newPassword": STRONG})
    assert r.status_code == 200, r.get_json()

    from tenant import unfiltered
    with unfiltered():
        u = User.query.filter_by(username="locked_admin").first()
        assert u.is_active is True and u.role == "admin" and u.is_owner is True
        assert UserSession.query.filter_by(sid="sid-live").first().revoked is True
        assert OrgRecoveryCode.query.filter_by(code_hash=hashlib.sha256(code.encode()).hexdigest()).first().used_at

    # One-time: the same code cannot be redeemed again.
    assert app.test_client().post("/api/org/recovery/redeem",
        json={"code": code, "username": "locked_admin", "newPassword": STRONG}).status_code == 410


def test_redeem_rejects_bad_input(app):
    a, _ = _orgs()
    ca = _admin(app, a, "owner_a", owner=True)
    code = ca.post("/api/org/recovery-codes").get_json()["codes"][0]
    make_user("admin", username="real_admin", org_id=a)
    anon = app.test_client()

    # Wrong code.
    assert anon.post("/api/org/recovery/redeem",
        json={"code": "WRONG-CODE-XXXX", "username": "real_admin", "newPassword": STRONG}).status_code == 404
    # Unknown account in the code's org.
    assert anon.post("/api/org/recovery/redeem",
        json={"code": code, "username": "ghost", "newPassword": STRONG}).status_code == 404
    # Weak password.
    assert anon.post("/api/org/recovery/redeem",
        json={"code": code, "username": "real_admin", "newPassword": "weak"}).status_code == 400
