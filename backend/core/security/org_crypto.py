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


def rewrap_org_dek(org, target_version=None):
    """Re-wrap the org's DEK under the newest (or a given) master-key version.

    Master-key rotation is otherwise additive: a DEK wrapped under an old version
    stays readable only while that version is retained. Re-wrapping every DEK under
    the current version lets the old version be dropped. The DEK itself (and so all
    field ciphertext) is unchanged — only its wrapping changes. Written with
    ``flush`` so it commits/rolls back with the caller's transaction. Returns the new
    version, or None when there is nothing to do.
    """
    if not (org.data_key_wrapped and org.data_key_version is not None):
        return None
    target = target_version if target_version is not None else keyring.current_master_version()
    if target is None or target == org.data_key_version:
        return org.data_key_version
    dek = keyring.unwrap_dek(org.data_key_wrapped, org.data_key_version)
    wrapped, version = keyring.wrap_dek(dek, target)
    org.data_key_wrapped = wrapped
    org.data_key_version = version
    db.session.add(org)
    db.session.flush()
    _cache_put(org.id, version, dek)
    return version


def rewrap_all_orgs(target_version=None):
    """Re-wrap every org's DEK under the newest (or given) master version.
    No-op when no master key is configured. Returns the count re-wrapped."""
    if not keyring.encryption_configured():
        return 0
    target = target_version if target_version is not None else keyring.current_master_version()
    count = 0
    for org in Organization.query.filter(
        Organization.data_key_wrapped.isnot(None),
        Organization.data_key_version.isnot(None),
        Organization.data_key_version != target,
    ).all():
        if rewrap_org_dek(org, target):
            count += 1
    if count:
        db.session.commit()
    return count
