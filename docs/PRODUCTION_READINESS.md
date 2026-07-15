# Production Readiness

This document exists to answer one question honestly: **what would it take to run this in production, and why hasn't that been done yet?**

The short answer: this is currently a stabilization/portfolio-stage project. The simplified authentication, SQLite database, and Flask dev server are all deliberate choices that make local development and demoing fast and frictionless — not accidental gaps. Production hardening is scoped as its own final phase (see [ROADMAP.md](ROADMAP.md), Priority 6) so it happens once, deliberately, on a stable feature set — not piecemeal while the feature set is still moving.

None of the items below are urgent today. They become urgent the moment there's a real plan to deploy this for actual (non-demo) EMS/NEMT operations.

## Authentication

**Current state:** header-based pseudo-auth (`X-User-Id`/`X-User-Role`/`X-User-Name`), backed by a `localStorage`-persisted login. See [ARCHITECTURE.md](ARCHITECTURE.md#authentication) for the full mechanism and why it's structured this way.

> **This is not authentication — it is identification the server takes on trust.**
> The caller states their own role in a request header, so anyone who can reach
> the API can claim `admin` with a single `curl` flag. It is acceptable **only**
> because this runs locally against demo data. Do not expose this API to an
> untrusted network in its current state.

**What the current scheme does guarantee.** Every gated route fails closed, and
the two failure modes are distinct (`utils/auth_utils.py`):

| Request | Result |
|---|---|
| No identity at all | `401 Authentication required` |
| Identity present, role not permitted | `403 Insufficient permissions` |
| Permitted role | Handler runs |

So the *gate* is real and regression-tested (`tests/test_security.py`); the
*identity behind it* is not trustworthy. Those are separate problems, and only
the second one is still open.

**History — why this is called out so bluntly.** An audit found the operational
routes had no gate at all: an anonymous `GET /api/dispatch/board` returned the
full board **including patient names**, and an anonymous `POST /api/crew-units`
created a crew unit. Both are fixed and pinned by negative tests per role. The
lesson is that "the frontend doesn't show it" was never protection, and no route
should be added without a gate.

**Production plan:**
- Replace headers with JWT (access + refresh tokens) or server-side session auth. Until then the trust boundary is the network, not the app
- Transparent to users — no UI changes beyond login mechanics
- Fail closed by default: prefer an explicit allowlist per blueprint over per-route opt-in, so a new route is protected by omission rather than exposed by it
- Audit every route for correct auth requirements before calling this phase done

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
