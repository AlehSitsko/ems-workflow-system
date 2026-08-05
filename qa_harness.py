"""Shared harness for the live QA and stress runners.

Two responsibilities:

1. **Give the runner a backend it is allowed to write to.** By default it boots a
   throwaway backend on a temp SQLite database (deleted on exit), so the runner
   can never touch real dev/production data. Pointing ``EMS_QA_BASE`` at an
   already-running backend is allowed *only* if that backend reports
   ``qa_mode: true`` on ``/api/health`` — otherwise the runner refuses to start.

2. **Real authentication.** ``ApiSession`` is a ``requests.Session`` that signs in
   through ``/api/auth/login`` and attaches the ``X-CSRF-Token`` header to every
   unsafe (POST/PUT/PATCH/DELETE) request automatically, mirroring what a browser
   does with the JS-readable ``csrf_token`` cookie.
"""

import atexit
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests

BACKEND_DIR = Path(__file__).resolve().parent / "backend"
_UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}

# Credentials the disposable backend seeds (see backend/qa_server.py).
ROLE_CREDENTIALS = {
    "admin": ("admin", "admin"),
    "supervisor": ("supervisor", "supervisor"),
    "dispatcher": ("dispatcher", "dispatcher"),
    "hr": ("hr", "hr"),
}


def free_port():
    """An ephemeral loopback port. Bound and released so the child can take it."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_health(base, timeout=45):
    """Poll ``/api/health`` until it answers 200, returning the parsed body."""
    deadline = time.time() + timeout
    last_err = None
    while time.time() < deadline:
        try:
            r = requests.get(f"{base}/api/health", timeout=2)
            if r.status_code == 200:
                return r.json()
            last_err = f"HTTP {r.status_code}"
        except Exception as exc:  # noqa: BLE001 - report whatever went wrong
            last_err = exc
        time.sleep(0.4)
    raise RuntimeError(f"backend at {base} did not become healthy ({last_err})")


class QaHarness:
    """Context manager yielding the base URL of a QA-safe backend.

    Default: boot a disposable backend on a temp DB and tear it down on exit.
    ``EMS_QA_BASE``: use that external backend instead, but only after confirming
    it reports ``qa_mode: true`` — a normal dev/production backend is refused.
    """

    def __init__(self):
        self.base = None
        # Path to the disposable SQLite file when self-booted (None for an external
        # target, where the runner has no filesystem access to the DB). Lets a
        # stress runner inspect indexes/stats on the throwaway DB, never the dev one.
        self.db_path = None
        self._proc = None
        self._tmpdir = None
        self._external = os.environ.get("EMS_QA_BASE")

    def __enter__(self):
        if self._external:
            base = self._external.rstrip("/")
            health = wait_health(base)
            if not health.get("qa_mode"):
                raise SystemExit(
                    f"\nREFUSING to run against {base}: it does not report qa_mode=true.\n"
                    "This runner seeds and deletes data, so it will only talk to a\n"
                    "disposable QA backend. Start one with EMS_QA=1 (and a throwaway\n"
                    "database), or unset EMS_QA_BASE to let the runner boot its own.\n"
                )
            self.base = base
            return base

        # Boot our own disposable backend on a temp database.
        self._tmpdir = tempfile.mkdtemp(prefix="ems_qa_")
        db_path = os.path.join(self._tmpdir, "qa.sqlite")
        self.db_path = db_path
        port = free_port()
        base = f"http://127.0.0.1:{port}"
        # Child logs go to a file in the temp dir, keeping the runner output clean;
        # the file (and DB) are removed on exit.
        self._logfile = open(os.path.join(self._tmpdir, "server.log"), "w", encoding="utf-8")
        self._proc = subprocess.Popen(
            [sys.executable, "qa_server.py", "--port", str(port), "--db", db_path],
            cwd=str(BACKEND_DIR),
            env=dict(os.environ, EMS_QA="1"),
            stdout=self._logfile,
            stderr=subprocess.STDOUT,
        )
        # Guarantee teardown even if the runner is killed mid-way.
        atexit.register(self._cleanup)
        try:
            health = wait_health(base)
        except Exception:
            self._dump_log()
            self._cleanup()
            raise
        if not health.get("qa_mode"):
            self._cleanup()
            raise RuntimeError("self-booted backend did not report qa_mode=true")
        self.base = base
        return base

    def __exit__(self, *exc):
        self._cleanup()
        return False

    def _dump_log(self):
        try:
            self._logfile.flush()
            with open(os.path.join(self._tmpdir, "server.log"), encoding="utf-8") as fh:
                sys.stderr.write("\n--- QA backend log ---\n" + fh.read() + "\n")
        except Exception:
            pass

    def _cleanup(self):
        if self._proc and self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=8)
            except Exception:
                self._proc.kill()
        self._proc = None
        try:
            if getattr(self, "_logfile", None):
                self._logfile.close()
        except Exception:
            pass
        if self._tmpdir and os.path.isdir(self._tmpdir):
            shutil.rmtree(self._tmpdir, ignore_errors=True)
        self._tmpdir = None


class ApiSession(requests.Session):
    """A signed-in session that auto-attaches the CSRF header on unsafe methods."""

    def __init__(self, base, username, password):
        super().__init__()
        self.base = base.rstrip("/")
        self.headers.update({"Content-Type": "application/json"})
        r = self.post(
            f"{self.base}/api/auth/login",
            json={"username": username, "password": password},
            _login=True,
        )
        if r.status_code != 200:
            raise SystemExit(f"QA login failed for {username!r}: {r.status_code} {r.text[:200]}")
        body = r.json()
        self.user = body.get("user")
        self.csrf = body.get("csrfToken") or self.cookies.get("csrf_token")

    def request(self, method, url, *args, _login=False, **kwargs):
        if method.upper() in _UNSAFE and not _login:
            token = getattr(self, "csrf", None) or self.cookies.get("csrf_token")
            if token:
                headers = dict(kwargs.get("headers") or {})
                headers.setdefault("X-CSRF-Token", token)
                kwargs["headers"] = headers
        return super().request(method, url, *args, **kwargs)


def role_sessions(base, roles=("admin", "supervisor", "dispatcher", "hr")):
    """Sign in one :class:`ApiSession` per requested role."""
    return {role: ApiSession(base, *ROLE_CREDENTIALS[role]) for role in roles}
