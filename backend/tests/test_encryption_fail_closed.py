"""Production must fail closed on encryption configuration.

Local/standalone (EMS_ENV unset) keeps the convenient plaintext fallback, but a
production deployment must refuse to start without a valid master key, so PHI is
never silently written in plaintext. Also covers the keyring's own validation
(malformed / wrong-length keys are rejected, not mistaken for "no encryption").
"""

import base64
import os

import pytest

from app import _require_encryption_in_production
from core.security.keyring import load_master_keys, KeyManagementError


def _key(n=32):
    return base64.b64encode(os.urandom(n)).decode()


class _FakeApp:
    def __init__(self, testing=False):
        self.config = {"TESTING": testing}


# ── Startup enforcement ──────────────────────────────────────────────────────

def test_development_without_a_key_starts(monkeypatch):
    monkeypatch.delenv("EMS_ENV", raising=False)
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    # No raise — local/standalone plaintext fallback is intentional.
    assert _require_encryption_in_production(_FakeApp()) is None


def test_production_with_a_valid_key_starts(monkeypatch):
    monkeypatch.setenv("EMS_ENV", "production")
    monkeypatch.setenv("EMS_MASTER_KEY", _key())
    assert _require_encryption_in_production(_FakeApp()) is None


def test_production_without_a_key_is_refused(monkeypatch):
    monkeypatch.setenv("EMS_ENV", "production")
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    with pytest.raises(RuntimeError, match="EMS_MASTER_KEY is required"):
        _require_encryption_in_production(_FakeApp())


def test_production_with_a_malformed_key_is_refused(monkeypatch):
    monkeypatch.setenv("EMS_ENV", "production")
    monkeypatch.setenv("EMS_MASTER_KEY", "this-is-not-valid-base64-!!!")
    with pytest.raises(RuntimeError, match="malformed"):
        _require_encryption_in_production(_FakeApp())


def test_production_with_a_wrong_length_key_is_refused(monkeypatch):
    monkeypatch.setenv("EMS_ENV", "production")
    monkeypatch.setenv("EMS_MASTER_KEY", _key(16))  # 16 bytes, not 32
    with pytest.raises(RuntimeError, match="wrong length"):
        _require_encryption_in_production(_FakeApp())


def test_production_with_multiple_key_versions_starts(monkeypatch):
    monkeypatch.setenv("EMS_ENV", "production")
    monkeypatch.setenv("EMS_MASTER_KEY", f"v1:{_key()},v2:{_key()}")
    assert _require_encryption_in_production(_FakeApp()) is None


def test_the_error_never_echoes_the_key(monkeypatch):
    secret = _key()
    monkeypatch.setenv("EMS_ENV", "production")
    # Wrong length so it fails, but ensure the secret text isn't in the message.
    bad = _key(16)
    monkeypatch.setenv("EMS_MASTER_KEY", bad)
    with pytest.raises(RuntimeError) as exc:
        _require_encryption_in_production(_FakeApp())
    assert bad not in str(exc.value) and secret not in str(exc.value)


def test_tests_opt_out_of_the_production_check(monkeypatch):
    monkeypatch.setenv("EMS_ENV", "production")
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    # TESTING=True short-circuits, so the suite itself is never forced to set a key.
    assert _require_encryption_in_production(_FakeApp(testing=True)) is None


# ── Keyring validation ───────────────────────────────────────────────────────

def test_no_key_is_empty_not_an_error(monkeypatch):
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    assert load_master_keys() == {}


def test_valid_single_key_loads(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", _key())
    keys = load_master_keys()
    assert list(keys) == [1] and len(keys[1]) == 32


def test_versioned_keys_load(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", f"v1:{_key()},v2:{_key()}")
    keys = load_master_keys()
    assert set(keys) == {1, 2}


def test_bad_base64_raises(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", "@@@notbase64@@@")
    with pytest.raises(KeyManagementError):
        load_master_keys()


def test_wrong_length_raises(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", _key(16))
    with pytest.raises(KeyManagementError, match="wrong length"):
        load_master_keys()
