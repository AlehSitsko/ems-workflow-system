"""Security review — uploaded-file handling.

Two mitigations: employee document files are served as downloads (never rendered
inline, so an uploaded .html/.svg can't run script in the app's origin), and the
request body is capped at the framework level so an oversized upload is refused
before it is buffered.
"""

import os

import storage


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
