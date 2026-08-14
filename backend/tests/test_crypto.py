"""Application-core crypto: AEAD field encryption, envelope key management, blind
indexes. Security-critical, so the negative cases are the point: tamper, wrong key,
wrong AAD (context move), wrong master version, and key/index separation.
"""

import base64
import os

import pytest

from core.security import crypto, keyring, blind_index
from core.security.crypto import DecryptionError
from core.security.keyring import KeyManagementError


def _key_b64():
    return base64.b64encode(os.urandom(32)).decode("ascii")


@pytest.fixture()
def master(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", _key_b64())


# ── AEAD field encryption ────────────────────────────────────────────────────

def test_encrypt_decrypt_roundtrip():
    dek = keyring.generate_dek()
    aad = "org=1|patient|431|insurance_member_id"
    token = crypto.encrypt("MEM-12345", dek, aad)
    assert token and token != "MEM-12345" and crypto.is_ciphertext(token)
    assert crypto.decrypt(token, dek, aad) == "MEM-12345"


def test_none_passes_through():
    dek = keyring.generate_dek()
    assert crypto.encrypt(None, dek, "x") is None
    assert crypto.decrypt(None, dek, "x") is None


def test_wrong_dek_fails():
    dek, other = keyring.generate_dek(), keyring.generate_dek()
    token = crypto.encrypt("secret", dek, "aad")
    with pytest.raises(DecryptionError):
        crypto.decrypt(token, other, "aad")


def test_tampered_ciphertext_fails():
    dek = keyring.generate_dek()
    token = crypto.encrypt("secret", dek, "aad")
    scheme, nonce, ct = token.split(":", 2)
    flipped = ct[:-2] + ("AA" if ct[-2:] != "AA" else "AB")
    with pytest.raises(DecryptionError):
        crypto.decrypt(f"{scheme}:{nonce}:{flipped}", dek, "aad")


def test_wrong_aad_fails_so_ciphertext_cannot_move_context():
    dek = keyring.generate_dek()
    token = crypto.encrypt("secret", dek, "org=1|patient|431|member_id")
    # Same key, but pretend it belongs to another org / row / field.
    for wrong in ("org=2|patient|431|member_id",
                  "org=1|patient|999|member_id",
                  "org=1|patient|431|policy_number"):
        with pytest.raises(DecryptionError):
            crypto.decrypt(token, dek, wrong)


# ── Envelope key management + rotation ───────────────────────────────────────

def test_wrap_unwrap_roundtrip(master):
    dek = keyring.generate_dek()
    wrapped, version = keyring.wrap_dek(dek)
    assert version == 1 and wrapped and base64.urlsafe_b64decode(wrapped)
    assert keyring.unwrap_dek(wrapped, version) == dek


def test_wrap_requires_configured_master(monkeypatch):
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    assert keyring.encryption_configured() is False
    with pytest.raises(KeyManagementError):
        keyring.wrap_dek(keyring.generate_dek())


def test_unwrap_with_unavailable_version_fails(master):
    dek = keyring.generate_dek()
    wrapped, version = keyring.wrap_dek(dek)
    with pytest.raises(KeyManagementError):
        keyring.unwrap_dek(wrapped, version + 5)


def test_master_key_rotation_keeps_old_deks_readable(monkeypatch):
    k1, k2 = _key_b64(), _key_b64()
    # Only v1 exists: wrap a DEK with it.
    monkeypatch.setenv("EMS_MASTER_KEY", f"v1:{k1}")
    dek = keyring.generate_dek()
    wrapped_v1, ver = keyring.wrap_dek(dek)
    assert ver == 1

    # Rotate: add v2 as the current master. The old wrapped DEK still unwraps,
    # and new wraps use v2 — no field data is re-encrypted.
    monkeypatch.setenv("EMS_MASTER_KEY", f"v1:{k1},v2:{k2}")
    assert keyring.current_master_version() == 2
    assert keyring.unwrap_dek(wrapped_v1, 1) == dek          # old still works
    _wrapped_v2, ver2 = keyring.wrap_dek(dek)
    assert ver2 == 2                                          # new wraps use v2


# ── Blind index ──────────────────────────────────────────────────────────────

def test_blind_index_is_deterministic_scoped_and_case_insensitive():
    dek = keyring.generate_dek()
    a = blind_index.blind_index("MEM-123", dek, scope="patient|member_id")
    assert a == blind_index.blind_index("mem-123 ", dek, scope="patient|member_id")  # normalised
    assert a != blind_index.blind_index("MEM-999", dek, scope="patient|member_id")   # different value
    assert a != blind_index.blind_index("MEM-123", dek, scope="patient|policy_no")   # different scope
    assert a != blind_index.blind_index("MEM-123", keyring.generate_dek(), scope="patient|member_id")  # different key
    assert blind_index.blind_index(None, dek) is None


def test_encryption_and_index_keys_are_separate():
    dek = keyring.generate_dek()
    assert crypto.derive_enc_key(dek) != blind_index.derive_index_key(dek)
