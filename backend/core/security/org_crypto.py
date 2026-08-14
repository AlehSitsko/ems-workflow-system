"""Per-organisation data key access — the bridge from a trusted org context to the
crypto layer.

Domain code never handles raw keys: it asks here for the org's DEK (already
unwrapped). Behaviour:

* No master key configured (local/standalone or an unconfigured dev box) -> returns
  None, and the field layer stores/reads plaintext. Encryption is opt-in.
* Master key configured -> the org's wrapped DEK is unwrapped (and cached for the
  process). On the first *write* it is provisioned (minted, wrapped, stored) within
  the caller's transaction, so it persists or rolls back together with the data.

The DEK belongs to the organisation — not a user, owner or device.
"""

import threading

from models import db, Organization
from core.security import keyring

# org_id -> (data_key_version, dek_bytes). DEKs are stable per org; a DEK rotation
# changes the version and supersedes the entry.
_dek_cache = {}
_lock = threading.Lock()


def clear_cache():
    with _lock:
        _dek_cache.clear()


def _cache_get(org_id, version):
    with _lock:
        entry = _dek_cache.get(org_id)
    return entry[1] if entry and entry[0] == version else None


def _cache_put(org_id, version, dek):
    with _lock:
        _dek_cache[org_id] = (version, dek)


def get_org_dek(org, *, provision=False):
    """Return the org's data key (bytes), or None when encryption is unavailable.

    provision=True (write paths): mint + store a DEK on first use.
    provision=False (read paths): the existing DEK, or None.
    """
    if org is None or not keyring.encryption_configured():
        return None

    if org.data_key_wrapped and org.data_key_version is not None:
        cached = _cache_get(org.id, org.data_key_version)
        if cached is not None:
            return cached
        dek = keyring.unwrap_dek(org.data_key_wrapped, org.data_key_version)
        _cache_put(org.id, org.data_key_version, dek)
        return dek

    return provision_org_dek(org) if provision else None


def provision_org_dek(org):
    """Generate, wrap and store a DEK for the org (idempotent). Written with
    ``flush`` — it commits or rolls back with the caller's transaction. Returns the
    DEK bytes."""
    if org.data_key_wrapped and org.data_key_version is not None:
        return get_org_dek(org)
    dek = keyring.generate_dek()
    wrapped, version = keyring.wrap_dek(dek)
    org.data_key_wrapped = wrapped
    org.data_key_version = version
    db.session.add(org)
    db.session.flush()
    _cache_put(org.id, version, dek)
    return dek


def provision_all_orgs():
    """Provision a DEK for every organisation that has none (ops/backfill).
    No-op when no master key is configured. Returns the count provisioned."""
    if not keyring.encryption_configured():
        return 0
    count = 0
    for org in Organization.query.filter(
        (Organization.data_key_wrapped.is_(None)) | (Organization.data_key_version.is_(None))
    ).all():
        provision_org_dek(org)
        count += 1
    if count:
        db.session.commit()
    return count
