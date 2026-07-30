"""
Storage abstraction for employee documents.
Switch from local → S3 by replacing only this file.
"""
import os
import uuid

from flask import current_app, send_from_directory

_UPLOAD_FOLDER = "uploads/documents"


def _base_path():
    return os.path.join(current_app.instance_path, _UPLOAD_FOLDER)


def save_file(file_storage, employee_id: int) -> tuple[str, str, int]:
    """
    Save an uploaded FileStorage object.
    Returns (relative_path, stored_filename, file_size_bytes).
    """
    base = _base_path()
    folder = os.path.join(base, str(employee_id))
    os.makedirs(folder, exist_ok=True)

    ext = os.path.splitext(file_storage.filename)[1].lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    full_path = os.path.join(folder, stored_name)

    file_storage.save(full_path)
    size = os.path.getsize(full_path)
    rel_path = os.path.join(str(employee_id), stored_name)
    return rel_path, stored_name, size


def delete_file(rel_path: str) -> None:
    """Delete a file by its relative path. Silently ignores missing files."""
    full = os.path.join(_base_path(), rel_path)
    try:
        os.remove(full)
    except FileNotFoundError:
        pass


def get_file_response(rel_path: str, download_name: str = None):
    """Return a response that downloads the stored file.

    Always served as an attachment, never inline, and with `nosniff`: an uploaded
    document is arbitrary user content, and the upload type check trusts the
    client-supplied Content-Type. Rendering it inline same-origin would let an
    attacker who uploads an .html/.svg (labelled as an allowed type) run script in
    the app's origin — stored XSS. Forcing a download and disabling MIME sniffing
    removes that: the browser saves the file instead of executing it.
    """
    base = _base_path()
    directory = os.path.join(base, os.path.dirname(rel_path))
    filename = os.path.basename(rel_path)
    response = send_from_directory(
        directory, filename, as_attachment=True, download_name=download_name or filename,
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
