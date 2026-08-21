"""Encrypt existing plaintext sensitive fields in place.

Shared by the ``encrypt-existing-fields`` CLI command and the desktop app's
first-encrypted-launch backfill. Idempotent: a value already stored as ciphertext
is skipped, so the plaintext source is only ever read and a value is never
destroyed (it is replaced by its own ciphertext). The caller must hold an app
context and should have backed up the database first.
"""

from models import db, Organization, Patient, Call
from core.security.keyring import encryption_configured
from core.security.crypto import is_ciphertext
from core.security.encrypted_fields import encrypt_instance
from core.security.org_crypto import provision_all_orgs
from tenant import unfiltered


def encrypt_existing_plaintext():
    """Encrypt any plaintext sensitive fields across all orgs. Returns a
    ``{entity_type: rows_encrypted}`` dict, or ``{}`` when encryption is not
    configured (no master key)."""
    if not encryption_configured():
        return {}

    # Single source of truth for which fields each entity encrypts (avoids drift).
    # org_getter yields the row's org id — direct for patient/employee/call, via
    # the parent employee for a document (which has no org_id of its own).
    from routes.patient_routes import _PATIENT_ENC_FIELDS
    from routes.employee_routes import _EMPLOYEE_ENC_FIELDS, Employee
    from routes.document_routes import _DOC_ENC_FIELDS, EmployeeDocument
    from routes.call_routes import _CALL_ENC_FIELDS

    entities = [
        ("patient", Patient, _PATIENT_ENC_FIELDS, lambda r: r.org_id),
        ("employee", Employee, _EMPLOYEE_ENC_FIELDS, lambda r: r.org_id),
        ("employee_document", EmployeeDocument, _DOC_ENC_FIELDS,
         lambda r: r.employee.org_id if r.employee else None),
        ("call", Call, _CALL_ENC_FIELDS, lambda r: r.org_id),
    ]

    provision_all_orgs()
    org_cache = {}

    def _org(org_id):
        if org_id and org_id not in org_cache:
            org_cache[org_id] = Organization.query.get(org_id)
        return org_cache.get(org_id)

    counts = {}
    with unfiltered():
        for entity_type, model, fields, org_getter in entities:
            count = 0
            for row in model.query.all():
                values = [getattr(row, f) for f, _ in fields]
                if not any(v and not is_ciphertext(v) for v in values):
                    continue  # nothing plaintext left to encrypt on this row
                encrypt_instance(row, _org(org_getter(row)), entity_type, fields)
                count += 1
            counts[entity_type] = count
        db.session.commit()
    return counts
