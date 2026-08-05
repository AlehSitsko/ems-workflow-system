"""Security review — uploaded-file handling.

Mitigations under test: employee document files are served as downloads (never
rendered inline, so an uploaded .html/.svg can't run script in the app's origin);
uploads are validated by *content* (magic bytes + a real OOXML check for .docx,
cross-checked against the extension and declared MIME), rejecting polyglots; and
the request body is capped at the framework level so an oversized upload is
refused before it is buffered.
"""

import io
import os
import zipfile

import pytest
from werkzeug.datastructures import FileStorage

import storage
from utils.file_validation import (
    UploadValidationError, safe_display_name, validate_upload,
)


# ── Content fixtures ─────────────────────────────────────────────────────────
_PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"\x00" * 32
_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x00" * 32
_HTML = b"<!DOCTYPE html><html><script>alert(document.cookie)</script></html>"
_SVG = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"


def _docx_bytes():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<?xml version='1.0'?><Types/>")
        z.writestr("word/document.xml", "<?xml version='1.0'?><document/>")
    return buf.getvalue()


def _fs(content, filename, content_type):
    return FileStorage(stream=io.BytesIO(content), filename=filename, content_type=content_type)


# ── Content validation (unit) ────────────────────────────────────────────────
def test_real_pdf_is_accepted():
    d = validate_upload(_fs(_PDF, "scan.pdf", "application/pdf"))
    assert d.name == "pdf" and d.ext == ".pdf"


def test_real_png_and_jpeg_are_accepted():
    assert validate_upload(_fs(_PNG, "photo.png", "image/png")).name == "png"
    assert validate_upload(_fs(_JPEG, "photo.jpg", "image/jpeg")).name == "jpeg"


def test_real_docx_is_accepted():
    d = validate_upload(_fs(_docx_bytes(), "cert.docx",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
    assert d.name == "docx" and d.ext == ".docx"


def test_fake_pdf_html_content_is_rejected():
    # HTML body, but named .pdf and declared application/pdf — the classic polyglot.
    with pytest.raises(UploadValidationError):
        validate_upload(_fs(_HTML, "evil.pdf", "application/pdf"))


def test_fake_image_html_content_is_rejected():
    with pytest.raises(UploadValidationError):
        validate_upload(_fs(_HTML, "evil.png", "image/png"))


def test_svg_polyglot_is_rejected():
    with pytest.raises(UploadValidationError):
        validate_upload(_fs(_SVG, "evil.png", "image/png"))


def test_extension_not_matching_content_is_rejected():
    # Real PNG bytes but a .pdf extension — the extension lies about the content.
    with pytest.raises(UploadValidationError):
        validate_upload(_fs(_PNG, "photo.pdf", "application/pdf"))


def test_declared_mime_not_matching_content_is_rejected():
    # Real PDF bytes, .pdf extension, but the browser declared image/png.
    with pytest.raises(UploadValidationError):
        validate_upload(_fs(_PDF, "scan.pdf", "image/png"))


def test_random_zip_is_not_accepted_as_docx():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("hello.txt", "not a word document")
    with pytest.raises(UploadValidationError):
        validate_upload(_fs(buf.getvalue(), "x.docx",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))


def test_disallowed_extension_is_rejected():
    with pytest.raises(UploadValidationError):
        validate_upload(_fs(_PDF, "payload.exe", "application/octet-stream"))


def test_empty_file_is_rejected():
    with pytest.raises(UploadValidationError):
        validate_upload(_fs(b"", "empty.pdf", "application/pdf"))


def test_octet_stream_declaration_falls_back_to_content():
    # A generic declaration is fine as long as the content is a real allowed type.
    assert validate_upload(_fs(_PDF, "scan.pdf", "application/octet-stream")).name == "pdf"


def test_safe_display_name_strips_paths_and_control_chars():
    assert safe_display_name("../../etc/passwd") == "passwd"
    assert safe_display_name("a\\b\\c.pdf") == "c.pdf"       # last component only
    assert safe_display_name("na\x00me.pdf") == "name.pdf"   # control chars stripped
    assert safe_display_name("") == "document"


def test_document_files_download_and_never_render_inline(app, tmp_path, monkeypatch):
    # Point storage at a temp dir so the test never touches the real instance/.
    monkeypatch.setattr(storage, "_base_path", lambda: str(tmp_path))
    folder = tmp_path / "7"
    folder.mkdir()
    (folder / "abc.html").write_text("<script>alert(document.cookie)</script>")

    with app.test_request_context():
        resp = storage.get_file_response("7/abc.html")

    # Forced download, not inline rendering — this is what neutralises stored XSS.
    assert "attachment" in resp.headers.get("Content-Disposition", "")
    # And no MIME sniffing, so a text/html-looking body isn't treated as HTML.
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"


def test_upload_route_rejects_fake_pdf_and_accepts_real_one(clients, tmp_path, monkeypatch):
    # Keep uploaded bytes off the real instance/ folder.
    monkeypatch.setattr(storage, "_base_path", lambda: str(tmp_path))
    admin = clients["admin"]
    emp = admin.post("/api/employees", json={"firstName": "Doc", "lastName": "Owner", "role": "EMT"})
    assert emp.status_code == 201, emp.get_json()
    emp_id = emp.get_json()["id"]
    url = f"/api/employees/{emp_id}/documents"

    # HTML disguised as a PDF -> 400 (content validation), nothing stored.
    bad = admin.post(url, data={
        "file": (io.BytesIO(_HTML), "evil.pdf", "application/pdf"),
        "doc_type": "other", "title": "Evil",
    }, content_type="multipart/form-data")
    assert bad.status_code == 400

    # A real PDF -> 201, stored with the detected mime.
    good = admin.post(url, data={
        "file": (io.BytesIO(_PDF), "scan.pdf", "application/pdf"),
        "doc_type": "other", "title": "Real",
    }, content_type="multipart/form-data")
    assert good.status_code == 201, good.get_json()
    doc = good.get_json()
    assert doc["mime_type"] == "application/pdf"

    # The download is forced as an attachment with nosniff.
    dl = admin.get(f"/api/documents/{doc['id']}/file")
    assert dl.status_code == 200
    assert "attachment" in dl.headers.get("Content-Disposition", "")
    assert dl.headers.get("X-Content-Type-Options") == "nosniff"


def test_an_oversized_request_body_is_refused(app):
    # A tiny cap for the test; Werkzeug rejects a larger body with 413 before the
    # request is routed.
    app.config["MAX_CONTENT_LENGTH"] = 100
    client = app.test_client()
    resp = client.post("/api/auth/login", data="x" * 5000,
                       content_type="application/json")
    assert resp.status_code == 413


def test_the_default_cap_is_configured(app):
    # A cap exists by default (defence in depth over the route's own 10 MB check).
    assert app.config.get("MAX_CONTENT_LENGTH")
