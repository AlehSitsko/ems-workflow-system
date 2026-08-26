"""Backend tests for employee documents (routes/document_routes.py).

Focus on the security-relevant surface: RBAC (dispatcher must never touch HR
documents), content-based upload validation (a real PDF is accepted; an HTML file
wearing a .pdf name is rejected; oversized is rejected), doc-type/title validation,
and 404s for unknown employees/documents. Encryption of `document_number` is covered
separately in test_document_encryption.py.

Run: pytest backend/tests/test_document_routes.py -v
"""

import io

from models import db, Employee, EmployeeDocument


def _employee(number="E1"):
    emp = Employee(first_name="Doc", last_name="Holder", employee_number=number)
    db.session.add(emp)
    db.session.commit()
    return emp


def _upload(api, employee_id, *, doc_type="cpr_cert", title="CPR card", file=None):
    data = {"doc_type": doc_type, "title": title}
    if file is not None:
        data["file"] = file
    return api.post(f"/api/employees/{employee_id}/documents",
                    data=data, content_type="multipart/form-data")


# ── RBAC ─────────────────────────────────────────────────────────────────────

def test_dispatcher_cannot_list_documents(clients, app):
    emp = _employee()
    assert clients["dispatcher"].get(f"/api/employees/{emp.id}/documents").status_code == 403


def test_anonymous_cannot_list_documents(anon, app):
    emp = _employee()
    assert anon.get(f"/api/employees/{emp.id}/documents").status_code == 401


def test_hr_may_list_documents(clients, app):
    emp = _employee()
    r = clients["hr"].get(f"/api/employees/{emp.id}/documents")
    assert r.status_code == 200 and r.get_json() == []


def test_list_for_unknown_employee_is_404(clients, app):
    assert clients["hr"].get("/api/employees/999999/documents").status_code == 404


# ── metadata validation ──────────────────────────────────────────────────────

def test_upload_metadata_only_happy_path(clients, app):
    emp = _employee()
    r = _upload(clients["hr"], emp.id, doc_type="drivers_license", title="License")
    assert r.status_code == 201
    body = r.get_json()
    assert body["title"] == "License" and body["doc_type"] == "drivers_license"
    assert body.get("file_name") in (None, "")


def test_upload_rejects_unknown_doc_type(clients, app):
    emp = _employee()
    r = _upload(clients["hr"], emp.id, doc_type="totally_made_up")
    assert r.status_code == 400 and "doc_type" in r.get_json()["error"].lower()


def test_upload_requires_title(clients, app):
    emp = _employee()
    r = _upload(clients["hr"], emp.id, title="   ")
    assert r.status_code == 400 and "title" in r.get_json()["error"].lower()


def test_upload_for_unknown_employee_is_404(clients, app):
    assert _upload(clients["hr"], 999999).status_code == 404


# ── content-based file validation (security) ─────────────────────────────────

def test_upload_accepts_a_real_pdf_and_stores_it(clients, app):
    emp = _employee()
    pdf = (io.BytesIO(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"), "cert.pdf")
    r = _upload(clients["hr"], emp.id, file=pdf)
    assert r.status_code == 201, r.get_json()
    body = r.get_json()
    assert body["mime_type"] == "application/pdf" and body["file_name"]
    # clean up the stored blob so the test leaves no artifact
    clients["hr"].delete(f"/api/documents/{body['id']}")


def test_upload_rejects_html_disguised_as_pdf(clients, app):
    emp = _employee()
    evil = (io.BytesIO(b"<html><script>alert(1)</script></html>"), "malware.pdf")
    r = _upload(clients["hr"], emp.id, file=evil)
    assert r.status_code == 400  # magic-byte check fails -> not a real PDF


def test_upload_rejects_oversized_file(clients, app):
    emp = _employee()
    big = (io.BytesIO(b"%PDF-1.4" + b"0" * (10 * 1024 * 1024 + 1)), "big.pdf")
    r = _upload(clients["hr"], emp.id, file=big)
    assert r.status_code == 400 and "large" in r.get_json()["error"].lower()


# ── single-document CRUD ─────────────────────────────────────────────────────

def test_get_patch_delete_document(clients, app):
    emp = _employee()
    api = clients["hr"]
    doc_id = _upload(api, emp.id, title="Original").get_json()["id"]

    assert api.get(f"/api/documents/{doc_id}").status_code == 200

    patched = api.patch(f"/api/documents/{doc_id}", json={"title": "Renamed"})
    assert patched.status_code == 200 and patched.get_json()["title"] == "Renamed"

    assert api.delete(f"/api/documents/{doc_id}").status_code == 200
    assert EmployeeDocument.query.get(doc_id) is None


def test_patch_rejects_bad_doc_type_and_empty_title(clients, app):
    emp = _employee()
    api = clients["hr"]
    doc_id = _upload(api, emp.id).get_json()["id"]
    assert api.patch(f"/api/documents/{doc_id}", json={"doc_type": "nope"}).status_code == 400
    assert api.patch(f"/api/documents/{doc_id}", json={"title": ""}).status_code == 400


def test_document_crud_404s(clients, app):
    api = clients["hr"]
    assert api.get("/api/documents/999999").status_code == 404
    assert api.patch("/api/documents/999999", json={}).status_code == 404
    assert api.delete("/api/documents/999999").status_code == 404
    assert api.get("/api/documents/999999/file").status_code == 404


def test_download_404_when_no_file_attached(clients, app):
    emp = _employee()
    doc_id = _upload(clients["hr"], emp.id).get_json()["id"]  # metadata-only, no file
    assert clients["hr"].get(f"/api/documents/{doc_id}/file").status_code == 404


# ── compliance summary ───────────────────────────────────────────────────────

def test_compliance_summary_structure(clients, app):
    _employee(number="C1")
    r = clients["hr"].get("/api/documents/compliance")
    assert r.status_code == 200
    body = r.get_json()
    assert "employees" in body and "doc_types" in body
    assert isinstance(body["employees"], list)
