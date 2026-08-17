"""Production S3 storage smoke test.

Runs against the prod stack booted with the S3 overlay (Nginx -> Gunicorn ->
S3StorageProvider -> MinIO). Proves the real object-storage round-trip: upload an
employee document, download it back through the app, and confirm the bytes match
and it is served as a `nosniff` attachment (never inline, never a public URL).

    python prod_s3_smoke.py [BASE_URL]      # default http://localhost:8080

Exits non-zero on failure. Requires the demo users to be seeded.
"""

import io
import sys

import requests

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
API = f"{BASE}/api"

# A minimal but real PDF so content validation accepts the upload.
_PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def _login(username, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=15)
    r.raise_for_status()
    token = s.cookies.get("csrf_token")
    if token:
        s.headers["X-CSRF-Token"] = token
    return s


def main():
    s = _login("admin", "admin")

    r = s.post(f"{API}/employees",
               json={"firstName": "S3", "lastName": "Roundtrip", "role": "EMT"}, timeout=15)
    if r.status_code != 201:
        print(f"FAIL: create employee -> {r.status_code}: {r.text}", flush=True)
        return 1
    eid = r.json()["id"]

    # Upload a document — save() streams the bytes into MinIO via S3StorageProvider.
    up = s.post(f"{API}/employees/{eid}/documents",
                files={"file": ("scan.pdf", io.BytesIO(_PDF), "application/pdf")},
                data={"doc_type": "other", "title": "S3 roundtrip"}, timeout=30)
    if up.status_code != 201:
        print(f"FAIL: upload -> {up.status_code}: {up.text}", flush=True)
        return 1
    did = up.json()["id"]

    # Download it back — response() streams it out of MinIO through the app.
    dl = s.get(f"{API}/documents/{did}/file", timeout=30)
    if dl.status_code != 200:
        print(f"FAIL: download -> {dl.status_code}", flush=True)
        return 1
    if dl.content != _PDF:
        print(f"FAIL: byte mismatch (got {len(dl.content)} bytes, expected {len(_PDF)})", flush=True)
        return 1
    if "attachment" not in dl.headers.get("Content-Disposition", ""):
        print("FAIL: download was not served as an attachment", flush=True)
        return 1
    if dl.headers.get("X-Content-Type-Options") != "nosniff":
        print("FAIL: download missing nosniff", flush=True)
        return 1

    print("OK: employee-document upload + download round-trip through S3 (MinIO) verified", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: {type(exc).__name__}: {exc}", flush=True)
        sys.exit(1)
