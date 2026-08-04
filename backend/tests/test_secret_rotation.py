"""SECRET_KEY rotation via SECRET_KEY_FALLBACKS.

A cookie signed with the previous key must keep verifying while that key is a
fallback, so rotating the signing key does not sign everyone out at once — and it
is rejected the moment the fallback is dropped.
"""

from werkzeug.security import generate_password_hash

from app import create_app
from models import db as _db, User
from config import _secret_key_fallbacks

OLD = "old-signing-key-" + "a" * 40
NEW = "new-signing-key-" + "b" * 40


def _app(secret, db_uri, fallbacks=None):
    cfg = {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": db_uri,
        "RATELIMIT_ENABLED": False,
        "SECRET_KEY": secret,
        "SECRET_KEY_FALLBACKS": fallbacks,
    }
    return create_app(cfg)


# ── Config parsing ────────────────────────────────────────────────────────────

def test_fallbacks_parse_from_a_comma_list(monkeypatch):
    monkeypatch.delenv("SECRET_KEY_FALLBACKS_FILE", raising=False)
    monkeypatch.setenv("SECRET_KEY_FALLBACKS", " k1 , k2 ,")
    assert _secret_key_fallbacks() == ["k1", "k2"]


def test_no_fallbacks_is_none(monkeypatch):
    monkeypatch.delenv("SECRET_KEY_FALLBACKS", raising=False)
    monkeypatch.delenv("SECRET_KEY_FALLBACKS_FILE", raising=False)
    assert _secret_key_fallbacks() is None


# ── Rotation behaviour ────────────────────────────────────────────────────────

def test_old_cookie_survives_rotation_with_a_fallback(tmp_path):
    uri = f"sqlite:///{tmp_path / 'rot.db'}"

    # App signed with the OLD key: create the schema + a user, then sign in.
    app_old = _app(OLD, uri)
    with app_old.app_context():
        _db.create_all()
        _db.session.add(User(
            username="rot", password_hash=generate_password_hash("Password123"),
            display_name="Rot", role="admin", is_active=True,
            password_changed_at="2026-01-01T00:00:00",
        ))
        _db.session.commit()
    c_old = app_old.test_client()
    assert c_old.post("/api/auth/login",
                      json={"username": "rot", "password": "Password123"}).status_code == 200
    cookie = c_old.get_cookie("session").value

    # NEW key + OLD as a fallback, same database → the old cookie still verifies.
    c_new = _app(NEW, uri, fallbacks=[OLD]).test_client()
    c_new.set_cookie("session", cookie)
    assert c_new.get("/api/auth/me").status_code == 200

    # NEW key with no fallback → the old cookie is rejected.
    c_norot = _app(NEW, uri).test_client()
    c_norot.set_cookie("session", cookie)
    assert c_norot.get("/api/auth/me").status_code == 401
