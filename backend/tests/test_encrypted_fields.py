"""Field-level encryption service: AAD-bound encrypt/decrypt, blind index, and the
plaintext fallback when no master key is configured."""

import base64
import os

import pytest

from models import db, Organization
from core.security import encrypted_fields as ef, org_crypto, crypto
from core.security.crypto import DecryptionError


@pytest.fixture()
def master(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    org_crypto.clear_cache()
    yield
    org_crypto.clear_cache()


def _org():
    o = Organization(name="Org", slug="org")
    db.session.add(o)
    db.session.commit()
    return o


def test_encrypt_then_decrypt_roundtrips(app, master):
    o = _org()
    stored = ef.encrypt_value("MEM-12345", o, "patient", 431, "insurance_member_id")
    assert crypto.is_ciphertext(stored)
    assert ef.decrypt_value(stored, o, "patient", 431, "insurance_member_id") == "MEM-12345"


def test_wrong_entity_id_fails_to_decrypt(app, master):
    o = _org()
    stored = ef.encrypt_value("MEM-12345", o, "patient", 431, "insurance_member_id")
    with pytest.raises(DecryptionError):
        ef.decrypt_value(stored, o, "patient", 999, "insurance_member_id")  # different row


def test_legacy_plaintext_passes_through(app, master):
    o = _org()
    # A value stored before encryption is not ciphertext -> returned unchanged.
    assert ef.decrypt_value("PLAINTEXT-777", o, "patient", 1, "insurance_member_id") == "PLAINTEXT-777"


def test_plaintext_mode_when_no_master_key(app, monkeypatch):
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    org_crypto.clear_cache()
    o = _org()
    stored = ef.encrypt_value("MEM-1", o, "patient", 1, "insurance_member_id")
    assert stored == "MEM-1"  # stored as plaintext
    assert ef.decrypt_value(stored, o, "patient", 1, "insurance_member_id") == "MEM-1"
    assert ef.index_value("MEM-1", o, "patient", "insurance_member_id") is None


def test_ciphertext_without_a_key_is_not_leaked(app, master, monkeypatch):
    o = _org()
    stored = ef.encrypt_value("MEM-1", o, "patient", 1, "insurance_member_id")
    # Later the key is gone (e.g. stolen DB without the master key): return None,
    # never the token, and never plaintext.
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    org_crypto.clear_cache()
    assert ef.decrypt_value(stored, o, "patient", 1, "insurance_member_id") is None


def test_blind_index_matches_the_value(app, master):
    o = _org()
    ef.encrypt_value("MEM-1", o, "patient", 1, "insurance_member_id")  # provisions the DEK
    a = ef.index_value("MEM-1", o, "patient", "insurance_member_id")
    assert a and a == ef.index_value("mem-1 ", o, "patient", "insurance_member_id")  # normalised
    assert a != ef.index_value("MEM-2", o, "patient", "insurance_member_id")


def test_empty_and_none_pass_through(app, master):
    o = _org()
    assert ef.encrypt_value(None, o, "patient", 1, "f") is None
    assert ef.encrypt_value("", o, "patient", 1, "f") == ""
    assert ef.decrypt_value(None, o, "patient", 1, "f") is None
