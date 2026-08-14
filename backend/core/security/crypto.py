"""Authenticated field encryption: AES-256-GCM with AAD binding.

Pure primitives — no database, no org lookup. Callers pass the organisation's data
key (DEK) and the Additional Authenticated Data (AAD) that binds a ciphertext to
its exact context (org | entity | id | field). Because the AAD is authenticated, a
ciphertext cannot be silently moved between organisations, rows or fields — the tag
check fails. A scheme tag prefixes every token so the algorithm can evolve.

The encryption key used with AES-GCM is HKDF-derived from the DEK, kept separate
from the blind-index key (see blind_index.py) so the two never coincide.
"""

import base64
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

SCHEME = "1"          # token/algorithm version (AES-256-GCM, HKDF-SHA256)
_NONCE_BYTES = 12


class DecryptionError(Exception):
    """Ciphertext could not be authenticated/decrypted (tamper, wrong key or AAD)."""


def _b64e(raw):
    return base64.urlsafe_b64encode(raw).decode("ascii")


def _b64d(text):
    return base64.urlsafe_b64decode(text.encode("ascii"))


def derive_enc_key(dek):
    """The AES-GCM key for field encryption, derived from the DEK (kept distinct
    from the blind-index key via a different HKDF info label)."""
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None,
                info=b"ems-field-encryption").derive(dek)


def encrypt(plaintext, dek, aad):
    """Encrypt a string. Returns a token 'scheme:nonce:ciphertext' (or None)."""
    if plaintext is None:
        return None
    key = derive_enc_key(dek)
    nonce = os.urandom(_NONCE_BYTES)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), aad.encode("utf-8"))
    return f"{SCHEME}:{_b64e(nonce)}:{_b64e(ct)}"


def decrypt(token, dek, aad):
    """Decrypt a token produced by :func:`encrypt`. Raises DecryptionError on any
    tamper, wrong key or wrong AAD."""
    if token is None:
        return None
    try:
        scheme, nonce_b64, ct_b64 = token.split(":", 2)
    except ValueError as exc:
        raise DecryptionError("malformed ciphertext token") from exc
    if scheme != SCHEME:
        raise DecryptionError(f"unsupported ciphertext scheme {scheme!r}")
    key = derive_enc_key(dek)
    try:
        pt = AESGCM(key).decrypt(_b64d(nonce_b64), _b64d(ct_b64), aad.encode("utf-8"))
    except Exception as exc:  # cryptography raises InvalidTag / ValueError
        raise DecryptionError("authentication failed") from exc
    return pt.decode("utf-8")


def is_ciphertext(value):
    """Heuristic: does this look like one of our tokens (vs legacy plaintext)?"""
    return isinstance(value, str) and value.startswith(f"{SCHEME}:") and value.count(":") == 2
