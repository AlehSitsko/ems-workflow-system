"""Object storage for employee documents, behind a provider abstraction.

- **Local** (default): files under the Flask instance dir — standalone/dev needs no
  external infrastructure.
- **S3-compatible** (``EMS_STORAGE=s3``): an object store (AWS S3, MinIO, …) for
  multi-instance server deployments.

The object key is generated **server-side** and org-scoped
(``organizations/{org_id}/employees/{employee_id}/{uuid}.ext``) — never taken from
the client. Every download goes through auth -> tenant -> authorization in the route
*before* touching storage; files are always served as an attachment with
``nosniff`` and there are no public permanent URLs. Switching providers changes only
this file; callers keep using save_file / delete_file / get_file_response.
"""

import os
import uuid

from flask import current_app, send_file, Response

_UPLOAD_FOLDER = "uploads/documents"


def _base_path():
    """Local filesystem root for document storage (patched by tests)."""
    return os.path.join(current_app.instance_path, _UPLOAD_FOLDER)


def _validate_key(key):
    """Reject a key that could escape the namespace (defence in depth — keys are
    server-generated, but the stored value is still validated before use)."""
    norm = os.path.normpath(key).replace("\\", "/")
    if norm.startswith("/") or norm.startswith("..") or "/../" in norm or os.path.isabs(key):
        raise ValueError("invalid storage key")
    return norm


def build_key(org_id, employee_id, ext):
    """A server-side, org-scoped object key. ``ext`` includes the dot."""
    org_part = str(org_id) if org_id is not None else "none"
    name = f"{uuid.uuid4().hex}{ext}"
    return f"organizations/{org_part}/employees/{int(employee_id)}/{name}"


# ── Providers ────────────────────────────────────────────────────────────────

class LocalStorageProvider:
    def _full(self, key):
        base = os.path.realpath(_base_path())
        full = os.path.realpath(os.path.join(base, _validate_key(key)))
        if full != base and not full.startswith(base + os.sep):
            raise ValueError("refusing to access a path outside the storage base")
        return full

    def save(self, file_storage, key):
        full = self._full(key)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        file_storage.save(full)
        return os.path.getsize(full)

    def delete(self, key):
        try:
            os.remove(self._full(key))
        except FileNotFoundError:
            pass

    def response(self, key, download_name):
        full = self._full(key)
        if not os.path.isfile(full):
            # A record can outlive its file (deleted out of band). Return a clean
            # 404 rather than letting send_file raise FileNotFoundError -> 500.
            from werkzeug.exceptions import NotFound
            raise NotFound()
        return send_file(full, as_attachment=True, download_name=download_name)


class S3StorageProvider:
    """S3-compatible object storage (AWS S3, MinIO, …). Streams downloads through the
    app so the auth/tenant checks in the route stay in the request path — no public
    or presigned URLs for sensitive documents."""

    def __init__(self):
        self.bucket = os.environ.get("EMS_S3_BUCKET")
        if not self.bucket:
            raise RuntimeError("EMS_STORAGE=s3 requires EMS_S3_BUCKET")
        import boto3  # lazy: only server/S3 deployments need the dependency
        self._client = boto3.client(
            "s3",
            endpoint_url=os.environ.get("EMS_S3_ENDPOINT_URL") or None,
            region_name=os.environ.get("EMS_S3_REGION") or None,
        )

    def save(self, file_storage, key):
        _validate_key(key)
        file_storage.stream.seek(0, os.SEEK_END)
        size = file_storage.stream.tell()
        file_storage.stream.seek(0)
        self._client.upload_fileobj(file_storage.stream, self.bucket, key)
        return size

    def delete(self, key):
        self._client.delete_object(Bucket=self.bucket, Key=_validate_key(key))

    def response(self, key, download_name):
        obj = self._client.get_object(Bucket=self.bucket, Key=_validate_key(key))
        body = obj["Body"]
        resp = Response(body.iter_chunks(), mimetype="application/octet-stream")
        resp.headers["Content-Disposition"] = f'attachment; filename="{download_name}"'
        return resp


_provider = None


def get_provider():
    global _provider
    if _provider is None:
        backend = (os.environ.get("EMS_STORAGE") or "local").lower()
        _provider = S3StorageProvider() if backend == "s3" else LocalStorageProvider()
    return _provider


def reset_provider():
    """Drop the cached provider (tests switch backends)."""
    global _provider
    _provider = None


# ── Public API (unchanged for callers) ───────────────────────────────────────

def save_file(file_storage, employee_id: int, ext: str = None, org_id=None) -> tuple[str, str, int]:
    """Save an uploaded FileStorage. Returns (object_key, stored_filename, size).

    ``ext`` is the canonical extension from content validation (preferred over the
    client filename so the stored name reflects the file's actual type). ``org_id``
    scopes the object key for tenant separation in object storage.
    """
    ext = (ext or os.path.splitext(file_storage.filename)[1]).lower()
    key = build_key(org_id, employee_id, ext)
    size = get_provider().save(file_storage, key)
    return key, os.path.basename(key), size


def delete_file(key: str) -> None:
    """Delete a stored object by its key. Silently ignores a missing object."""
    if not key:
        return
    get_provider().delete(key)


def get_file_response(key: str, download_name: str = None):
    """A response that downloads the stored object as an attachment with `nosniff`.

    Never inline: an uploaded document is arbitrary user content, so rendering it
    same-origin could run script in the app's origin (stored XSS). Forcing a
    download and disabling MIME sniffing makes the browser save it instead.
    """
    response = get_provider().response(key, download_name or os.path.basename(key))
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
