"""EmployeeDocument.document_number encrypted at rest (tenant via the parent
employee's org), decrypted through the API, with plaintext fallback + backfill."""

import base64
import os

import pytest

from models import db, Organization, EmployeeDocument
from conftest import make_user, login
from core.security import org_crypto
from core.security.crypto import is_ciphertext


@pytest.fixture()
def master(monkeypatch):
    monkeypatch.setenv("EMS_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    org_crypto.clear_cache()
    yield
    org_crypto.clear_cache()


def _org(slug="orgd"):
    o = Organization(name=slug, slug=slug)
    db.session.add(o)
    db.session.commit()
    return o.id


def _admin_in(app, org_id, username="admin_d"):
    c = app.test_client()
    login(c, make_user("admin", username=username, org_id=org_id).username)
    return c


def _employee(client):
    return client.post("/api/employees", json={"firstName": "Doc", "lastName": "Owner",
                                               "role": "EMT"}).get_json()["id"]


def _create_doc(client, emp_id, number):
    r = client.post(f"/api/employees/{emp_id}/documents", data={
        "doc_type": "cpr_cert", "title": "CPR Card", "document_number": number,
    }, content_type="multipart/form-data")
    assert r.status_code == 201, r.get_json()
    return r.get_json()["id"]


def _stored(doc_id):
    from tenant import unfiltered
    with unfiltered():
        return db.session.get(EmployeeDocument, doc_id).document_number


def test_document_number_encrypted_and_decrypted(app, master):
    c = _admin_in(app, _org())
    doc_id = _create_doc(c, _employee(c), "CERT-12345")

    assert is_ciphertext(_stored(doc_id))                       # ciphertext at rest
    assert c.get(f"/api/documents/{doc_id}").get_json()["document_number"] == "CERT-12345"

    # Update re-encrypts and the API returns the new plaintext.
    c.patch(f"/api/documents/{doc_id}", json={"document_number": "CERT-99999"})
    assert is_ciphertext(_stored(doc_id))
    assert c.get(f"/api/documents/{doc_id}").get_json()["document_number"] == "CERT-99999"


def test_document_plaintext_mode_without_key(app, monkeypatch):
    monkeypatch.delenv("EMS_MASTER_KEY", raising=False)
    org_crypto.clear_cache()
    c = _admin_in(app, _org())
    doc_id = _create_doc(c, _employee(c), "CERT-1")
    assert _stored(doc_id) == "CERT-1"   # stored plaintext
    assert c.get(f"/api/documents/{doc_id}").get_json()["document_number"] == "CERT-1"


def test_document_backfill_encrypts_existing_plaintext(app, master):
    c = _admin_in(app, _org())
    emp_id = _employee(c)
    # A pre-existing plaintext doc (as if created before encryption was enabled).
    from tenant import unfiltered
    with unfiltered():
        d = EmployeeDocument(employee_id=emp_id, doc_type="cpr_cert", title="Old",
                             document_number="CERT-LEGACY")
        db.session.add(d)
        db.session.commit()
        doc_id = d.id
    assert _stored(doc_id) == "CERT-LEGACY"

    result = app.test_cli_runner().invoke(args=["encrypt-existing-fields", "--yes"])
    assert result.exit_code == 0, result.output
    assert is_ciphertext(_stored(doc_id))
    assert c.get(f"/api/documents/{doc_id}").get_json()["document_number"] == "CERT-LEGACY"
