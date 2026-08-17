"""Storage provider abstraction: org-scoped keys, a traversal-guarded local
provider, and an S3-compatible provider selected by env (exercised against a fake
boto3 so it needs no real object store)."""

import io
import sys
import types

import pytest
from werkzeug.datastructures import FileStorage

import storage


@pytest.fixture(autouse=True)
def _reset_provider():
    storage.reset_provider()
    yield
    storage.reset_provider()


def _fs(content=b"hello", filename="x.pdf"):
    return FileStorage(stream=io.BytesIO(content), filename=filename)


# ── Keys ─────────────────────────────────────────────────────────────────────

def test_build_key_is_org_scoped_and_unique():
    k1 = storage.build_key(5, 42, ".pdf")
    k2 = storage.build_key(5, 42, ".pdf")
    assert k1.startswith("organizations/5/employees/42/") and k1.endswith(".pdf")
    assert k1 != k2  # uuid per file

    # No org still produces a namespaced key (never a bare filename).
    assert storage.build_key(None, 7, ".png").startswith("organizations/none/employees/7/")


@pytest.mark.parametrize("bad", ["../secret", "/etc/passwd", "a/../../b", "\\..\\x"])
def test_validate_key_rejects_escapes(bad):
    with pytest.raises(ValueError):
        storage._validate_key(bad)


# ── Local provider ───────────────────────────────────────────────────────────

def test_local_provider_round_trip(app, tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_base_path", lambda: str(tmp_path))
    key = storage.build_key(1, 2, ".txt")
    size = storage.get_provider().save(_fs(b"payload"), key)
    assert size == len(b"payload")
    assert (tmp_path / "organizations" / "1" / "employees" / "2").exists()

    with app.test_request_context():
        resp = storage.get_file_response(key, download_name="doc.txt")
    assert "attachment" in resp.headers["Content-Disposition"]
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    resp.close()  # release the send_file handle (Windows won't unlink an open file)

    storage.delete_file(key)
    storage.delete_file(key)  # deleting a missing object is a no-op


def test_local_provider_refuses_traversal_key(app, tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_base_path", lambda: str(tmp_path))
    with pytest.raises(ValueError):
        storage.get_provider().save(_fs(), "../escape.txt")


def test_save_file_returns_org_scoped_key(app, tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_base_path", lambda: str(tmp_path))
    key, stored, size = storage.save_file(_fs(b"pdfdata"), employee_id=9, ext=".pdf", org_id=3)
    assert key == f"organizations/3/employees/9/{stored}"
    assert stored.endswith(".pdf") and size == len(b"pdfdata")


def test_local_missing_object_raises_not_found_not_a_crash(app, tmp_path, monkeypatch):
    # A key with no backing file (e.g. deleted out of band) yields a clean 404,
    # never a 500 or a path/content leak.
    from werkzeug.exceptions import NotFound
    monkeypatch.setattr(storage, "_base_path", lambda: str(tmp_path))
    key = storage.build_key(1, 2, ".pdf")
    with app.test_request_context():
        with pytest.raises(NotFound):
            storage.get_file_response(key, download_name="x.pdf")


# ── S3 provider (fake boto3, no real object store) ───────────────────────────

class _FakeBody:
    def __init__(self, data):
        self._data = data

    def iter_chunks(self):
        yield self._data


class _FakeS3Client:
    def __init__(self):
        self.objects = {}

    def upload_fileobj(self, fileobj, bucket, key):
        self.objects[(bucket, key)] = fileobj.read()

    def get_object(self, Bucket, Key):
        return {"Body": _FakeBody(self.objects[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)


@pytest.fixture()
def fake_boto3(monkeypatch):
    client = _FakeS3Client()
    module = types.ModuleType("boto3")
    module.client = lambda *a, **k: client
    monkeypatch.setitem(sys.modules, "boto3", module)
    monkeypatch.setenv("EMS_STORAGE", "s3")
    monkeypatch.setenv("EMS_S3_BUCKET", "docs")
    storage.reset_provider()
    return client


def test_s3_requires_a_bucket(monkeypatch):
    monkeypatch.setenv("EMS_STORAGE", "s3")
    monkeypatch.delenv("EMS_S3_BUCKET", raising=False)
    storage.reset_provider()
    with pytest.raises(RuntimeError):
        storage.get_provider()


class _FullFakeS3:
    """A fuller fake S3 client for the migration (head/put/get/delete)."""

    def __init__(self):
        self.objects = {}

    def upload_fileobj(self, fileobj, bucket, key):
        self.objects[(bucket, key)] = fileobj.read()

    def put_object(self, Bucket, Key, Body):
        self.objects[(Bucket, Key)] = Body if isinstance(Body, bytes) else Body.read()

    def get_object(self, Bucket, Key):
        return {"Body": _FakeBody(self.objects[(Bucket, Key)])}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)

    def head_object(self, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise KeyError("404")   # stands in for a botocore ClientError(404)
        return {}


def test_migrate_local_documents_to_s3(app, tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_base_path", lambda: str(tmp_path))
    monkeypatch.setenv("EMS_S3_BUCKET", "docs")
    from models import db, Employee, EmployeeDocument

    emp = Employee(first_name="Doc", last_name="Owner", role="EMT")
    db.session.add(emp)
    db.session.flush()
    # one document with a real local file, one whose local file is missing
    key = storage.build_key(None, emp.id, ".pdf")
    storage.LocalStorageProvider().save(_fs(b"filedata"), key)
    db.session.add(EmployeeDocument(employee_id=emp.id, doc_type="other", title="D", file_path=key))
    missing_key = storage.build_key(None, emp.id, ".pdf")
    db.session.add(EmployeeDocument(employee_id=emp.id, doc_type="other", title="M", file_path=missing_key))
    db.session.commit()

    fake = _FullFakeS3()
    target = storage.S3StorageProvider(client=fake)
    result = storage.migrate_documents_local_to_s3(target=target)

    assert result["migrated"] == 1
    assert result["missing"] == [missing_key]
    assert fake.objects[("docs", key)] == b"filedata"      # copied byte-for-byte

    # Idempotent: a re-run skips the object already present in S3.
    again = storage.migrate_documents_local_to_s3(target=target)
    assert again["migrated"] == 0 and again["skipped"] == 1

    # --delete-source removes the local copy after migrating.
    storage.LocalStorageProvider().save(_fs(b"second"), (k2 := storage.build_key(None, emp.id, ".pdf")))
    db.session.add(EmployeeDocument(employee_id=emp.id, doc_type="other", title="D2", file_path=k2))
    db.session.commit()
    storage.migrate_documents_local_to_s3(target=target, delete_source=True)
    assert not storage.LocalStorageProvider().exists(k2)
    assert fake.objects[("docs", k2)] == b"second"


def test_migration_refuses_a_local_target(app, tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_base_path", lambda: str(tmp_path))
    with pytest.raises(RuntimeError, match="target must be S3"):
        storage.migrate_documents_local_to_s3(target=storage.LocalStorageProvider())


def test_s3_provider_round_trip(app, fake_boto3):
    assert isinstance(storage.get_provider(), storage.S3StorageProvider)
    key, _stored, size = storage.save_file(_fs(b"objbytes"), employee_id=4, ext=".pdf", org_id=2)
    assert size == len(b"objbytes")
    assert ("docs", key) in fake_boto3.objects

    with app.test_request_context():
        resp = storage.get_file_response(key, download_name="report.pdf")
    body = b"".join(resp.response)
    assert body == b"objbytes"
    assert "attachment" in resp.headers["Content-Disposition"]
    assert resp.headers["X-Content-Type-Options"] == "nosniff"

    storage.delete_file(key)
    assert ("docs", key) not in fake_boto3.objects
