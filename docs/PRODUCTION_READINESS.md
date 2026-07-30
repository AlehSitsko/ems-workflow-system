# Production Readiness

This document exists to answer one question honestly: **what would it take to run this in production, and why hasn't that been done yet?**

The short answer: this is currently a stabilization/portfolio-stage project. The simplified authentication, SQLite database, and Flask dev server are all deliberate choices that make local development and demoing fast and frictionless — not accidental gaps. Production hardening is scoped as its own final phase (see [ROADMAP.md](ROADMAP.md), Priority 6) so it happens once, deliberately, on a stable feature set — not piecemeal while the feature set is still moving.

None of the items below are urgent today. They become urgent the moment there's a real plan to deploy this for actual (non-demo) EMS/NEMT operations.

## Authentication

**Current state: server-side session cookies.** Signing in at `/api/auth/login`
starts a session; the cookie is signed with `SECRET_KEY`, `HttpOnly`,
`SameSite=Lax`, and `Secure` when `EMS_ENV=production`. `utils/auth_utils.py`
reads identity from that session and nowhere else.

**What this replaced.** Identity used to be the `X-User-Id` / `X-User-Role` /
`X-User-Name` headers, which the server believed — anyone who could reach the
API could claim `admin` with a single curl flag. Those headers are now inert,
pinned by `tests/test_security.py::test_forged_identity_headers_are_ignored`.

**Default-deny.** Every route under `/api/` requires a session unless it is
named in `PUBLIC_ENDPOINTS` (login, logout, health, the kiosk, and the VAPID
public key). A new route is therefore protected by omission rather than exposed
by it — the property this document previously listed as the plan.

> **Two serious exposures were found and closed while doing this**, both
> predating it:
>
> * **User administration was completely ungated.** An anonymous `POST
>   /api/auth/users` created an admin account; anyone could list, edit or
>   disable users. The frontend hid the page behind an admin-only route, which
>   was never protection.
> * **74 routes had no gate at all.** Probing them anonymously returned ~22KB of
>   patient records and ~22KB of call records — PHI, to a caller who had never
>   logged in. `/api/employees`, `/api/payroll/*` and `/api/analytics/*` were
>   likewise open. Two tests had even been written to *document* the missing
>   gate as accepted behaviour; they now assert the opposite.

**Failure modes stay distinct** (`utils/auth_utils.py`):

| Request | Result |
|---|---|
| No session | `401 Authentication required` |
| Session present, role not permitted | `403 Insufficient permissions` |
| Permitted role | Handler runs |

**Session cookies vs tokens.** Cookies were chosen over JWT in localStorage: the
cookie is unreadable from JavaScript, so a cross-site scripting bug cannot walk
off with the session, and ending a session is a server-side act rather than a
revocation list. `SameSite=Lax` means the browser will not attach it to
cross-site POSTs, which removes the common CSRF shape without a token scheme.

**Role-correctness audit (done).** Every one of the 142 API routes was
enumerated against its guard, and the ones relying only on the default-deny
(i.e. "any signed-in user") were checked against the documented policy —
*"Dispatcher never sees payroll/salary/HR-private data; HR never sees patient
data"* (ROADMAP.md). Several were more permissive than that policy, empirically
reachable by the wrong role, and were tightened (`tests/test_security.py`):

| Route(s) | Was | Now | Why |
|---|---|---|---|
| `/api/patient(s)/*` (16) | any signed-in | admin/supervisor/dispatcher | PHI — HR excluded |
| `/api/payroll/*` (7) | any signed-in | admin/supervisor/hr | salary — dispatcher excluded |
| `/api/employees/<id>/pay-config` | any signed-in | admin/supervisor/hr | salary config |
| employee detail + create/edit/delete | any signed-in | admin/supervisor/hr | HR record; the **list** stays open — the board/planner need it, and it carries no salary |
| `GET /employees/<id>/documents` | any signed-in | admin/supervisor/hr | matched the rest of its blueprint |
| `/api/analytics/dispatchers` | any signed-in | admin/supervisor | supervisor analytics |
| employee **kiosk PIN** | in every roster payload | HR-gated detail only | a clock-in credential was readable by every signed-in user |

**Two contradictions the audit surfaced have since been resolved** toward the
documented policy, each after checking no excluded-role flow depended on it:
- **Calls now exclude HR.** The call blueprint's `ALLOWED_ROLES` had included
  `hr`, contradicting the policy and the `/calls` route guard; calls reference
  patients, so it also undercut "HR never sees patient data". Every `/api/calls`
  consumer is a dispatch/patient/supervisor surface — none HR-facing.
- **Time-entry management now excludes dispatcher** (admin/supervisor/hr, like
  payroll). It is reached only from the Employee Workspace "Time & Pay" tab,
  already gated to those roles; the public kiosk clock-in routes are separate
  and untouched.

**Still open before this can face an untrusted network:**
- CSRF is enforced. Every state-changing request must echo a per-session token
  in an `X-CSRF-Token` header; the server hands the token to the client in the
  login/`me` response (and a same-origin cookie), and a fetch interceptor
  attaches it. A forged cross-site POST cannot read the token, so it is refused
  with 403 — the layer `SameSite=Lax` does not fully cover (e.g. a same-site
  subdomain). Verified end to end on the running app. `test_security.py`,
  `csrf.test.js`
- Password **complexity** is enforced on account create/edit (≥10 chars, a
  letter, a number, not the username — `validate_password_strength`); login is
  rate limited (10/min). Still missing: expiry/rotation, and a breach-corpus
  check. Enforced on the management routes only, so existing and demo accounts
  are unaffected
- **Revocation** works for the case that matters: the signed-in user is
  re-validated against the database on every request, so disabling or deleting an
  account, or changing its role, takes effect on that account's very next request
  rather than lingering until the 12-hour cookie expires (`register_api_auth_guard`,
  tests in `test_security.py`). What still needs a session store is revoking *one*
  specific device's session while the user stays active elsewhere — the cookie
  carries no per-session id to target

## Database

**Development:** SQLite — fast and frictionless for local/demo and the test suite. It does not handle concurrent writes well (parallel dispatch actions from 2+ users can hit lock errors), which is why production uses Postgres.

**Production:** PostgreSQL. The prod stack (`docker-compose.prod.yml`) runs a `postgres:16` service and points the backend at it via a `postgresql+psycopg://` `DATABASE_URL` (psycopg 3, in `requirements-prod.txt`). No model or query change was needed — every query already goes through SQLAlchemy, and the same Alembic migrations apply on both backends (verified: all 26 run cleanly on Postgres, and the full stack serves against it). The prod image runs migrations on startup.

**Backups:** `scripts/backup-db.sh` writes a timestamped, gzipped `pg_dump` (`--clean --if-exists`, so it restores onto a non-empty database) and `scripts/restore-db.sh` restores one. Both find the running `db` container by its Compose labels and dump over its local socket, so they need neither the app's secrets nor the DB password. Schedule the backup from cron/systemd for real use; the full cycle (backup → wipe → restore) is verified.

**Still open:** a one-time SQLite→Postgres data-copy script, needed only to carry an existing SQLite deployment's data over (a fresh deployment just migrates + seeds).

## Server

**Current state:** Flask's built-in development server — single-threaded, one request processed at a time. Stress-test baseline: 184 req/s.

**Production plan:**
- `gunicorn -w 4 -b 0.0.0.0:5050 app:app` (expect roughly a 4× throughput improvement with 4 workers)
- `nginx` as a reverse proxy for static files and TLS termination
- Consider `gunicorn --worker-class gevent` for I/O-bound workloads (this app is mostly I/O-bound — DB queries, not CPU work)

## Observability

**Logging is structured** (`logging_config.py`). One format is chosen by
environment: JSON — one object per line on stdout — when `EMS_ENV=production`, so
a log aggregator can index the fields; a compact human-readable line otherwise.
An access log records every API request with method, path, status, duration and
the acting `user_id`, and deliberately never the request body, since a call or
patient payload is PHI. Health checks and CORS preflight are excluded as noise.
No third-party logging dependency — the JSON formatter is stdlib.

**Metrics are exposed** (`metrics.py`) at `GET /metrics` in Prometheus format: a
request counter and a latency histogram, labelled by method, Flask *endpoint*
(the view name, never the raw path — so an id in the URL can't explode label
cardinality and no id reaches a metric) and status. The scrape and health probe
are excluded. `/metrics` is unauthenticated for scraping and exposes only
aggregates, but belongs on an internal network (restrict it at the proxy).

**Still open:**
- Ship the JSON logs somewhere (a file, or stdout to a collector) and set
  retention — the app writes them; where they go is a deployment concern
- Distributed tracing (an APM/OpenTelemetry agent) for cross-service latency
- Alerting on error-rate or latency thresholds (rules over the metrics above)

## Real-time updates

**Current state:** the notification bell polls `/api/notifications` every 10 seconds per user. With the existing index on `user_notification.user_id`, this is acceptable up to roughly 50 concurrent users (at 15 users today: ~90 requests/minute on that one endpoint).

**Production plan:**
- Replace polling with WebSocket push (Flask-SocketIO or a dedicated channel server) once concurrent user counts approach that threshold
- Short-term mitigation if needed sooner: increase the poll interval to 30s for non-dispatch roles (HR, supervisor), who don't need 10-second freshness

## Multi-tenancy

**Current state:** schema foundation only. `Organization` model and nullable `org_id` columns exist on every tenant-scoped table, but the `organization` table is not seeded, no row has an `org_id` assigned, and no query currently filters by it — see [ARCHITECTURE.md](ARCHITECTURE.md#multi-tenancy-foundation). Runtime tenant isolation is not active yet.

**Production plan:**
- Flask middleware reads subdomain from the Host header → looks up `Organization` by slug → sets `g.current_org`
- Every tenant-scoped query filtered by `org_id`
- Superadmin role + UI: create/deactivate organizations, assign org admins
- Frontend `OrgContext` reads `/api/org/current` on startup
- Local dev fallback: `lvh.me` subdomains or an `X-Org-Slug` header
- **Do this after** the tenant isolation tests described in [ROADMAP.md](ROADMAP.md) Priority 3 exist — enabling org filtering without a test proving cross-tenant isolation is the highest-risk order of operations here

## File storage

**Current state:** local filesystem, behind a storage abstraction (`backend/storage.py`).

**Production plan:**
- Swap the implementation for `boto3`/S3 — no changes required outside `storage.py`
- Config via environment: `STORAGE_BACKEND`, `S3_BUCKET`, AWS credentials

## Deployment

**Current state:** containerized for both development and production.
- **Development:** `docker-compose.yml` runs both dev servers (Flask reloader + Vite HMR) with SQLite on a named volume — reproducible local/demo, no reverse proxy or TLS.
- **Production:** `docker-compose.prod.yml` runs **Gunicorn** (`backend/Dockerfile.prod`, non-root, `wsgi:app`, gthread workers) behind an **unprivileged Nginx** (`frontend/Dockerfile.prod`, multi-stage Node build → static bundle) that serves the SPA and proxies `/api` — so the app and API are one origin and the `SameSite=Lax` session cookie is sent. `EMS_ENV=production` forces a real `SECRET_KEY` and Secure cookies; the frontend resolves its API base to same-origin in a production build. CI builds both prod images and validates the prod compose on every push.

**Still to do:**
- TLS termination in front of Nginx (the prod stack expects to sit behind it; `SESSION_COOKIE_SECURE=0` is only for local HTTP smoke tests)
- Pinned base image digests

## Secrets

**Current state:** the two production secrets — `SECRET_KEY` (signs session cookies; the app refuses to start in production without it) and the database password inside `DATABASE_URL` — are read via `config.py._secret()`, which prefers a `{NAME}_FILE` (a mounted Docker/Kubernetes secret) over the `{NAME}` environment variable. That keeps them out of the process environment, where they would otherwise be visible to `docker inspect`, crash dumps and child processes. The Postgres image reads `POSTGRES_PASSWORD_FILE` the same way.

**Still open:** a rotation story (swapping `SECRET_KEY` invalidates live sessions; a real deployment needs a documented, low-disruption rotation).

## Security review

Once the above are in place, a dedicated pass over the whole application — auth, tenant isolation, file upload handling, rate limiting, dependency audit — before calling any of this production-ready. Not a checkbox to rush through at the end; the actual gate.
