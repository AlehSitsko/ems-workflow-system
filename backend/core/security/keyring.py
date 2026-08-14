"""Envelope key management: a master key (KEK) wraps each organisation's data key.

    Master Key / KMS  --unwrap-->  Organisation Data Key (DEK)  --encrypt-->  fields

The master key lives in the environment or a mounted secret (``EMS_MASTER_KEY``),
never in the database — only the *wrapped* DEK is stored (on the Organization).
Multiple master-key versions are supported so the master key can be rotated without
re-encrypting field data (only the wrapped DEKs are re-wrapped).

Configuration (``EMS_MASTER_KEY`` or ``EMS_MASTER_KEY_FILE``):
    a single base64 32-byte key            -> version 1
    "v1:<base64>,v2:<base64>"              -> explicit versions; the highest is current

This module is the seam for a real KMS/Vault: replace ``load_master_keys`` /
``wrap_dek`` / ``unwrap_dek`` with KMS calls and nothing else changes.
"""

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import _secret

_WRAP_NONCE_BYTES = 12
_WRAP_AAD = b"ems-dek-wrap"


class KeyManagementError(Exception):
    pass


def load_master_keys():
    """Return {version: key_bytes} parsed from the environment/secret (may be empty
    when encryption is not configured — the app still runs on plaintext)."""
    raw = _secret("EMS_MASTER_KEY")
    keys = {}
    if not raw:
        return keys
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if part[0] == "v" and ":" in part:
            ver_str, b64 = part.split(":", 1)
            version = int(ver_str[1:])
        else:
            version, b64 = 1, part
        keys[version] = base64.b64decode(b64)
    return keys


def encryption_configured():
    return bool(load_master_keys())


def current_master_version(keys=None):
    keys = keys if keys is not None else load_master_keys()
    return max(keys) if keys else None


def generate_dek():
    """A fresh 32-byte organisation data key."""
    return os.urandom(32)


def wrap_dek(dek, master_version=None):
    """Wrap (encrypt) a DEK with the master key. Returns (wrapped_b64, version)."""
    keys = load_master_keys()
    if not keys:
        raise KeyManagementError("EMS_MASTER_KEY is not configured")
    version = master_version if master_version is not None else max(keys)
    if version not in keys:
        raise KeyManagementError(f"master key version {version} unavailable")
    nonce = os.urandom(_WRAP_NONCE_BYTES)
    wrapped = AESGCM(keys[version]).encrypt(nonce, dek, _WRAP_AAD)
    return base64.urlsafe_b64encode(nonce + wrapped).decode("ascii"), version


def unwrap_dek(wrapped_b64, master_version):
    """Recover a DEK from its wrapped form using the given master-key version."""
    keys = load_master_keys()
    if master_version not in keys:
        raise KeyManagementError(f"master key version {master_version} unavailable")
    blob = base64.urlsafe_b64decode(wrapped_b64.encode("ascii"))
    nonce, wrapped = blob[:_WRAP_NONCE_BYTES], blob[_WRAP_NONCE_BYTES:]
    try:
        return AESGCM(keys[master_version]).decrypt(nonce, wrapped, _WRAP_AAD)
    except Exception as exc:
        raise KeyManagementError("failed to unwrap the organisation data key") from exc
