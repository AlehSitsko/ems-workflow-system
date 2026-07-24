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

**Still open before this can face an untrusted network:**
- CSRF tokens for state-changing requests. `SameSite=Lax` covers the common
  case, not every case (e.g. a same-site subdomain compromise)
- Password policy, lockout after repeated failures, and rotation. Login is rate
  limited (10/min) but passwords have no complexity or expiry rules
- Session storage is the signed cookie itself; server-side revocation of a
  specific live session is not possible without a session store
- An audit of *role* correctness on every route. Authentication is now
  guaranteed; whether each route allows exactly the right roles is a separate
  review

## Database

**Current state:** SQLite. Fine for single-user local development and demo use; does not support concurrent writes well — parallel dispatch actions from 2+ simultaneous users can produce lock errors.

**Production plan:**
- Migrate to PostgreSQL — no model changes required, the app already goes through SQLAlchemy's abstraction for every query
- Update `SQLALCHEMY_DATABASE_URI`, write a one-time data migration script from the SQLite file
- Alembic migrations already work identically against either backend

## Server

**Current state:** Flask's built-in development server — single-threaded, one request processed at a time. Stress-test baseline: 184 req/s.

**Production plan:**
- `gunicorn -w 4 -b 0.0.0.0:5050 app:app` (expect roughly a 4× throughput improvement with 4 workers)
- `nginx` as a reverse proxy for static files and TLS termination
- Consider `gunicorn --worker-class gevent` for I/O-bound workloads (this app is mostly I/O-bound — DB queries, not CPU work)

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

**Current state:** no containerization; `frontend/package.json` has a `deploy` script (`gh-pages -d dist`) but GitHub Pages deployment is currently on hold and not an active priority — it exists from earlier exploration, not as part of the current workflow.

**Production plan:**
- Dockerfile for backend and frontend
- `docker-compose.yml` with nginx reverse proxy
- Environment-based configuration throughout (no hardcoded URLs/secrets)

## Security review

Once the above are in place, a dedicated pass over the whole application — auth, tenant isolation, file upload handling, rate limiting, dependency audit — before calling any of this production-ready. Not a checkbox to rush through at the end; the actual gate.
