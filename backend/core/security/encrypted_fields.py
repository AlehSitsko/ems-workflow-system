"""Field-level encryption bound to a trusted organisation context.

Wraps the pure crypto (crypto.py) with the org data key (org_crypto.py) and builds
the AAD that binds each ciphertext to its exact context — org | entity_type |
entity_id | field — so a ciphertext can never be silently moved between
organisations, entity types, rows or fields.

Storage model: the same column holds *either* ciphertext (when a master key is
configured) *or* plaintext (local/standalone, or an existing dev DB). `is_ciphertext`
distinguishes them on read, so migration is a one-way in-place encrypt with no
schema churn. A separate blind-index column (see index_value) enables exact-match
search without decryption.

Domain code calls encrypt_value / decrypt_value / index_value with the org and the
row's identity; it never touches keys or picks an algorithm.
"""

from core.security import crypto, org_crypto, blind_index
from core.security.keyring import KeyManagementError


def _org_id(org):
    return getattr(org, "id", org)


def _dek_for_read(org):
    """The org DEK for a read/search, or None when it cannot be recovered — no key
    configured *or* the master-key version that wrapped it is unavailable (e.g. an
    old version retired before the DEK was re-wrapped). A read must degrade to None,
    never raise, so an unreadable field can't turn into a 500."""
    try:
        return org_crypto.get_org_dek(org, provision=False)
    except KeyManagementError:
        return None


def field_aad(org, entity_type, entity_id, field):
    return f"org={_org_id(org)}|entity={entity_type}|id={entity_id}|field={field}"


def encrypt_value(value, org, entity_type, entity_id, field, *, provision=True):
    """Return the value to store: ciphertext when encryption is configured, else
    the plaintext unchanged (single-column model). Call after the row has an id so
    the AAD can bind it."""
    if value is None or value == "":
        return value
    dek = org_crypto.get_org_dek(org, provision=provision)
    if dek is None:
        return value  # plaintext mode
    return crypto.encrypt(value, dek, field_aad(org, entity_type, entity_id, field))


def decrypt_value(stored, org, entity_type, entity_id, field):
    """Return the plaintext for a stored value. Passes legacy plaintext through
    untouched; decrypts ciphertext (raising DecryptionError on tamper/context
    mismatch); returns None if it is ciphertext but no key is available."""
    if stored is None:
        return None
    if not crypto.is_ciphertext(stored):
        return stored  # legacy / plaintext value
    dek = _dek_for_read(org)
    if dek is None:
        return None  # can't decrypt without the key; never leak the token
    return crypto.decrypt(stored, dek, field_aad(org, entity_type, entity_id, field))


def encrypt_instance(instance, org, entity_type, fields):
    """Encrypt named plaintext fields on an instance in place (single-column model)
    and set their blind-index columns. ``fields`` is a list of
    ``(value_attr, index_attr|None)``. Values already ciphertext are skipped (so an
    unchanged field on update is not double-encrypted). Call after the row has an id
    so the AAD can bind it."""
    entity_id = getattr(instance, "id", None)
    for value_attr, index_attr in fields:
        pt = getattr(instance, value_attr, None)
        if pt is None or pt == "" or crypto.is_ciphertext(pt):
            continue
        setattr(instance, value_attr, encrypt_value(pt, org, entity_type, entity_id, value_attr))
        if index_attr:
            setattr(instance, index_attr, index_value(pt, org, entity_type, value_attr))


def read_instance_field(instance, org, entity_type, value_attr):
    """Decrypt one field of an instance (or pass plaintext through)."""
    return decrypt_value(getattr(instance, value_attr, None), org, entity_type,
                         getattr(instance, "id", None), value_attr)


def index_value(value, org, entity_type, field):
    """The blind index for a plaintext value, for exact-match search — or None in
    plaintext mode (search then falls back to the value column)."""
    if value is None or value == "":
        return None
    dek = _dek_for_read(org)
    if dek is None:
        return None
    return blind_index.blind_index(value, dek, scope=f"{entity_type}|{field}")
