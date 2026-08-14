"""Blind index for exact-match search over an encrypted field.

A keyed HMAC over a normalised value lets a query find rows by an exact value
without decrypting the column: store ``blind_index(value)`` alongside the
ciphertext and look up by it. The index key is HKDF-derived from the DEK with a
distinct info label, so it is *separate* from the encryption key.

Leakage (documented): equal plaintexts produce equal index values within the same
``scope`` and organisation, so an observer of the index column learns equality and
frequency — never the plaintext. Use only for reasonably high-entropy identifiers
(insurance/member/policy numbers), not for low-entropy values like a yes/no flag.
"""

import hashlib
import hmac

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def derive_index_key(dek):
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None,
                info=b"ems-blind-index").derive(dek)


def normalize(value):
    """Fold to a canonical form so search is case/whitespace-insensitive."""
    return (value or "").strip().lower()


def blind_index(value, dek, scope=""):
    """HMAC-SHA256 over ``scope|normalize(value)`` with the derived index key.

    ``scope`` (e.g. "patient|insurance_member_id") prevents the same value from
    colliding across different fields. Returns a hex digest, or None for None.
    """
    if value is None:
        return None
    key = derive_index_key(dek)
    message = f"{scope}|{normalize(value)}".encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()
