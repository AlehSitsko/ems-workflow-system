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

**Role-correctness audit (done).** Every one of the `/api/` routes (203 as of
commit `47ef647`; regenerate the list from the running app — see API.md) was
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
  rate limited (10/min). Enforced on the management routes only, so existing and
  demo accounts are unaffected.
- Password **expiry / rotation** is available and off by default:
  `Config.PASSWORD_MAX_AGE_DAYS` (0 disables it, so nothing changes unless a
  deployment opts in — set e.g. 90 in production). `User.password_changed_at` is
  stamped on every password set and backfilled for existing rows so the clock
  starts at the upgrade rather than expiring everyone at once. When a password is
  past the limit the auth guard restricts that session to change-password, `/me`
  and logout (`403 {"code": "password_expired"}` everywhere else) and the SPA shows
  a forced change screen. Self-service `POST /api/auth/change-password` verifies
  the current password, applies the same strength policy, and rejects reusing the
  current password.
- Password **history** refuses reuse of a recent password: `PasswordHistory` records
  every password set (create, admin edit, self-change), pruned to a 24-entry bound
  and backfilled for existing users. `Config.PASSWORD_HISTORY_DEPTH` (0 by default,
  so nothing changes unless opted in) makes a change reject a new password matching
  any of the last N stored hashes; recording is always on, so raising the depth
  later works against the history already retained. Still missing: a breach-corpus
  (HaveIBeenPwned) lookup, which needs an external service.
- **Revocation** works at two levels. Account-level: the signed-in user is
  re-validated against the database on every request, so disabling or deleting an
  account, or changing its role, takes effect on that account's very next request
  rather than lingering until the 12-hour cookie expires (`register_api_auth_guard`,
  tests in `test_security.py`). Device-level: a `UserSession` registry gives each
  login a random `sid` (carried in the cookie) that the guard checks every request,
  so revoking one row signs *that one device* out on its next call while the user
  stays signed in elsewhere. Users manage their own devices from Settings → Active
  sessions (`GET/DELETE /api/auth/sessions`, `POST /api/auth/sessions/revoke-others`,
  scoped to the caller); `test_sessions.py`. Pre-upgrade cookie sessions carry no
  sid and are asked to sign in once

## Database

**Development:** SQLite — fast and frictionless for local/demo and the test suite. It does not handle concurrent writes well (parallel dispatch actions from 2+ users can hit lock errors), which is why production uses Postgres.

**Production:** PostgreSQL. The prod stack (`docker-compose.prod.yml`) runs a `postgres:16` service and points the backend at it via a `postgresql+psycopg://` `DATABASE_URL` (psycopg 3, in `requirements-prod.txt`). No model or query change was needed — every query already goes through SQLAlchemy, and the same Alembic migrations apply on both backends (verified: all 26 run cleanly on Postgres, and the full stack serves against it). The prod image runs migrations on startup.

**Backups:** `scripts/backup-db.sh` writes a timestamped, gzipped `pg_dump` (`--clean --if-exists`, so it restores onto a non-empty database) and `scripts/restore-db.sh` restores one. Both find the running `db` container by its Compose labels and dump over its local socket, so they need neither the app's secrets nor the DB password. Schedule the backup from cron/systemd for real use; the full cycle (backup → wipe → restore) is verified.

**SQLite→Postgres data copy.** `scripts/copy_sqlite_to_postgres.py` carries an existing SQLite deployment's data onto Postgres (a fresh deployment just migrates + seeds, so this is only for an in-place move). It is schema-driven and works at the SQLAlchemy Core level, so the ORM's tenant events never fire and every row lands verbatim — `org_id` included. It copies each table in `db.metadata.sorted_tables` (foreign-key) order, refuses a non-empty target unless `--force` (which clean-reloads, since the copied rows keep their primary keys), and fast-forwards each Postgres sequence past the copied maximum id so the next insert does not collide. The target must already carry the schema — create it exactly as production does, `DATABASE_URL=<target> flask db upgrade`, so its `alembic_version` matches. Tested SQLite→SQLite with foreign keys enforced on the target (`test_copy_db.py`); verified against the real dev database copying 6,280 rows across 32 tables.

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

**Implemented** as tenant-scoped **Server-Sent Events** (`/api/events/stream`,
`events_routes.py`): a signed-in client holds one long-lived connection and receives
its own organisation's domain events (`call.created`, `dispatch.assignment_changed`,
`unit.status_changed`), driving live board refresh and the notification engine. The
org is taken from the session, never the client. (The notification bell still polls
`/api/notifications` for the persistent, historical list; SSE carries the live push.)

### Broker: single-process vs multi-worker

The event bus (`events.py`) has one surface behind two brokers, chosen by
`EMS_REDIS_URL`:

| Deployment | Broker | Notes |
|---|---|---|
| local / standalone / dev / tests / E2E | **InMemoryEventBus** | process-local; correct for a single worker; no dependency |
| production, `--workers > 1` | **RedisEventBus** | fans events through Redis Pub/Sub so every worker delivers, regardless of which worker handled the request |

**Why it's mandatory:** the prod image runs Gunicorn with 3 workers. The in-memory
bus is process-local, so without a shared broker a client's SSE stream on one worker
misses events published on another — realtime looks fine in a demo and silently drops
~2/3 of events under real load. `gunicorn.conf.py` **fails closed**: it refuses to
boot >1 worker in production without `EMS_REDIS_URL`, so the broken combination can
never ship. Either provide Redis, or run `WEB_CONCURRENCY=1`.

**Required environment:** `EMS_REDIS_URL` (e.g. `redis://redis:6379/0`). The prod
compose bundles a `redis` service and sets it by default.

**Failure behavior (by design):**
- **Redis outage:** `publish` is best-effort with short socket timeouts — a failed
  publish drops that event and **never hangs the request**; the client re-fetches
  current state on reconnect. The listener thread reconnects with exponential backoff.
- **Slow SSE client:** per-subscriber queues are bounded and drop on overflow, so one
  slow client cannot block publishers or other subscribers.
- **Malformed message:** the listener logs and skips it, staying alive.
- **Worker restart:** clients' `EventSource` reconnects automatically and re-subscribe.

**Tests:** `test_redis_events.py` (cross-worker delivery, org isolation, outage,
malformed message) and the CI prod-stack realtime smoke
(`scripts/prod_realtime_smoke.py`) prove delivery across 3 real workers + Redis + Nginx.

## Encryption in production

Field-level encryption at rest (AES-256-GCM, per-org envelope keys) is **opt-in
locally but mandatory in production**: with `EMS_ENV=production` the app refuses to
start without a valid `EMS_MASTER_KEY` (missing or malformed → a clear, key-free error
visible to health checks), so a cloud deployment can never silently store PHI in
plaintext. Local/standalone keeps the plaintext fallback. Field coverage and the
staged plan for wider encryption are in [DATA_CLASSIFICATION.md](DATA_CLASSIFICATION.md).

## Multi-tenancy

**Runtime isolation is active** (`tenant.py`). Enforcement is global at the ORM
layer, not per query — the app has 200+ `Model.query` call sites and one missed
filter would leak across tenants. Two SQLAlchemy session events do it: a
`do_orm_execute` hook adds `WHERE org_id = :current_org` to every SELECT of an
org-owned entity (so reads, including `.get(pk)` via a fresh request session, can
only return the caller's org), and a `before_flush` hook stamps `org_id` on new
org-owned rows (so writes land in the caller's org without any route touching the
column). The current org is set by the auth guard from the signed-in user
(`utils/auth_utils.py`); with no org context — the CLI, seeding, the pre-login
lookup, the existing test suite — both hooks are inert.

The 14 org-owned models are named once in `models.ORG_SCOPED_MODELS`. Child/detail
tables (documents, assignments, task comments, …) have no `org_id` and are isolated
transitively through their org-filtered parent; the one security-boundary child,
`EmployeeDocument`, is resolved through a filtered employee lookup so a document
cannot be fetched by id across tenants. A migration seeds a default organisation
and backfills all existing rows to it. Cross-tenant isolation is proved end to end
by `tests/test_tenant_isolation.py`.

The audit trail is scoped too — `AuditLog` carries `org_id`, stamped on every
in-request write, so no organisation's admin can read another's history.

### v2 — subdomain login, per-org users, platform super-admin

Each organisation is reached at its own subdomain (`acme.<BASE_DOMAIN>`).
`utils/tenant_host.py` turns the request Host into an org; a bare host
(localhost / the apex / an unknown host) resolves to **no org**, and the app then
behaves as the pre-v2 single tenant — the back-compat lever that keeps existing
deployments and the whole test suite working. Usernames are unique **per org**
(`uq_user_org_username`), and login is scoped to the subdomain's organisation; a
suspended workspace refuses login and locks out its live sessions on the next
request, and a session is bound to its org's subdomain (defence against a
cross-subdomain cookie replay if the cookie is ever domain-scoped).

A **platform super-admin** (`User.is_platform_admin`, no org) runs the cross-org
console (`/api/platform`) on the platform host only: create an organisation and its
first admin, rename or suspend it, and reset an org admin's password. The auth guard
confines a platform admin to that console — with a NULL org they read unfiltered, so
they must never reach an ordinary tenant endpoint. Org admins manage their own org's
name and branding (`/api/tenant/org`); the login screen greets the workspace
(`/api/tenant/current`, public). Bootstrap without a UI via `flask create-org` and
`flask create-platform-admin`. CORS reflects any `*.BASE_DOMAIN` origin (still an
allowlist — a wildcard cannot carry credentials).

Tests: `test_tenant_host`, `test_multitenancy_login`, `test_multitenancy_session`,
`test_platform`, `test_tenant_routes`. **Still open:** running real subdomains in
production needs DNS records and a wildcard TLS certificate (infrastructure, not
application code); platform-admin impersonation was deliberately left out.

### Deploying multi-tenancy (operator runbook)

The app code is ready; standing it up multi-tenant is configuration and infra:

1. **Config.** Set `BASE_DOMAIN` to the real apex (e.g. `ems.example.com`) — it is
   required in `docker-compose.prod.yml` and defaults to `localhost`, under which
   **no subdomain resolves** and every host looks single-tenant. `PLATFORM_HOST`
   defaults to `admin.<BASE_DOMAIN>`; override only to move the console.
2. **DNS.** A wildcard `*.ems.example.com` (and `admin.ems.example.com`) A/AAAA
   record pointing at the ingress, so every org's subdomain reaches the same stack.
3. **TLS.** A **wildcard certificate** for `*.ems.example.com`, terminated at the
   edge (LB / ingress / a TLS-terminating Nginx in front of the app's Nginx, which
   listens on 8080). The app already trusts `X-Forwarded-Proto` and sets Secure
   cookies under `EMS_ENV=production`. `frontend/nginx.conf` uses `server_name _`
   and passes the Host through, so it serves every subdomain unchanged — no
   per-org server block. CORS reflects any `*.BASE_DOMAIN` origin automatically.
4. **Bootstrap.** Create the platform operator and the first org from the CLI (no
   chicken-and-egg UI):
   ```
   flask --app app create-platform-admin <user> <password>
   flask --app app create-org acme "Acme EMS" --admin-user admin --admin-pass <pw>
   ```
   Then the operator signs in at `https://admin.ems.example.com` to create the rest,
   and each org's admin signs in at `https://<slug>.ems.example.com`.
5. **Local dev.** `*.localhost` resolves to 127.0.0.1 on most systems, so
   `acme.localhost:5173` (and `admin.localhost:5173`) work with no `hosts` edits;
   add entries to `/etc/hosts` if your resolver does not do this.

## File storage

**Current state:** a storage-provider abstraction (`backend/storage.py`) with two
implementations, selected at runtime — no change required outside this file:

- **Local** (default, `EMS_STORAGE` unset or `local`): files under the Flask instance
  dir. Standalone/desktop and dev need no external infrastructure.
- **S3-compatible** (`EMS_STORAGE=s3`): AWS S3, MinIO, or any S3 API, for multi-instance
  server deployments. `boto3` is an optional prod dependency, imported lazily so the
  local/desktop profile never needs it.

**Security properties (both providers):**
- The object key is generated **server-side** and org-scoped —
  `organizations/{org_id}/employees/{employee_id}/{uuid}.ext` — never taken from the
  client, and validated against path escapes before use.
- Downloads always go through **auth → tenant scope → role** in the route *before*
  storage is touched; the S3 provider streams the object through the app rather than
  handing out public or presigned URLs. Files are served as an attachment with
  `nosniff` (neutralises stored XSS from an uploaded `.html`/`.svg`).
- Upload, download, and delete of a document each emit an audit event
  (`document.uploaded` / `document.downloaded` / `document.deleted`).

**Config via environment (S3 mode):** `EMS_STORAGE=s3`, `EMS_S3_BUCKET`,
`EMS_S3_ENDPOINT_URL` (for MinIO / non-AWS), `EMS_S3_REGION`, plus standard AWS
credentials (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, read by boto3).

**Still to do:** migrate existing locally-stored files into the bucket when switching a
running deployment from local to S3 (new deployments start clean); verify against a live
S3/MinIO endpoint (the provider is unit-tested against a fake boto3 client).

## Deployment

**Current state:** containerized for both development and production.
- **Development:** `docker-compose.yml` runs both dev servers (Flask reloader + Vite HMR) with SQLite on a named volume — reproducible local/demo, no reverse proxy or TLS.
- **Production:** `docker-compose.prod.yml` runs **Gunicorn** (`backend/Dockerfile.prod`, non-root, `wsgi:app`, gthread workers) behind an **unprivileged Nginx** (`frontend/Dockerfile.prod`, multi-stage Node build → static bundle) that serves the SPA and proxies `/api` — so the app and API are one origin and the `SameSite=Lax` session cookie is sent. `EMS_ENV=production` forces a real `SECRET_KEY` and Secure cookies; the frontend resolves its API base to same-origin in a production build. CI builds both prod images and validates the prod compose on every push.

**Still to do:**
- TLS termination in front of Nginx — the operator supplies a terminating reverse proxy (the prod stack expects to sit behind it; `SESSION_COOKIE_SECURE=0` is only for local HTTP smoke tests). The full procedure (Caddy / Nginx / cloud-LB recipes, HSTS, wildcard cert for subdomains, the SSE-through-proxy gotcha, verification) is in [DEPLOYMENT_TLS.md](DEPLOYMENT_TLS.md).
- Pinned base image digests
- Live S3/MinIO verification (the provider is unit-tested against a fake client; run the [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) → Object storage checklist against a real endpoint)

Backups, restore, disaster recovery and — critically — **`EMS_MASTER_KEY` backup** (its loss permanently orphans all encrypted PHI) are documented in [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md).

## Secrets

**Current state:** the two production secrets — `SECRET_KEY` (signs session cookies; the app refuses to start in production without it) and the database password inside `DATABASE_URL` — are read via `config.py._secret()`, which prefers a `{NAME}_FILE` (a mounted Docker/Kubernetes secret) over the `{NAME}` environment variable. That keeps them out of the process environment, where they would otherwise be visible to `docker inspect`, crash dumps and child processes. The Postgres image reads `POSTGRES_PASSWORD_FILE` the same way.

**Key rotation:** swapping `SECRET_KEY` on its own would sign every live session out (their cookies no longer verify). `config.py` supports `SECRET_KEY_FALLBACKS` (Flask ≥3.1) — old keys still accepted for *verifying* a cookie, never for signing a new one — read from `SECRET_KEY_FALLBACKS_FILE` (one key per line) or the comma-separated `SECRET_KEY_FALLBACKS` env var. To rotate with no forced logout:

1. Generate a new key: `openssl rand -hex 32`.
2. Move the current key into the fallbacks: set `SECRET_KEY` = new key **and** `SECRET_KEY_FALLBACKS` = the old key, then roll the deployment. New cookies are signed with the new key; existing cookies still verify against the fallback.
3. After the session lifetime has elapsed (`SESSION_LIFETIME_SECONDS`, default 12h), remove the old key from `SECRET_KEY_FALLBACKS`. The rotation is complete and the old key is dead.

Verified by `test_secret_rotation.py`: a cookie signed with the old key authenticates under the new key while the old one is a fallback, and is rejected once it is dropped.

## Security review

Once the above are in place, a dedicated pass over the whole application — auth, tenant isolation, file upload handling, rate limiting, dependency audit — before calling any of this production-ready. Not a checkbox to rush through at the end; the actual gate.

**Dependency audit (re-run 2026-08):** `pip-audit` on the backend and `npm audit` on the frontend.
- **Fixed (runtime, shipped):**
  - `aiohttp` 3.14.1 → **3.14.3** (PYSEC-2026-3545/3546/3547) and `cryptography` 49.0.0 → **50.0.0** (PYSEC-2026-3552). Both are pulled by `pywebpush` / `py-vapid` / `http_ece` — the Web Push / VAPID crypto path — so after the bump the VAPID public-key derivation and the push + secret-rotation tests were re-verified green, then the full backend suite (880 passed).
  - `postcss` → 8.5.25 (build-time path-traversal advisory); `pytest` → 9.0.3 (test-only; suite re-verified).
  - `undici` 7.28.0 → **7.29.0** via `npm audit fix` — reached only through `jsdom` (the Vitest DOM), a **dev/test-only** dependency that is never in the browser bundle.
  - After these bumps: backend runtime + prod dependency sets report **no known vulnerabilities**.
- **Assessed and accepted, no code change:**
  - `react-router` — the flagged advisory (GHSA-qwww-vcr4-c8h2) is an *RSC-mode* CSRF bypass in the Server-Component "Action" flow. This app is a client-only SPA (Vite build, `createHashRouter`, no React Server Components and no router server actions), so the vulnerable mode is never loaded; the only offered "fix" is a breaking downgrade to 7.11.0, a regression for a non-applicable issue. Kept at 7.18.2.
  - `brace-expansion` — an OOM/ReDoS advisory with no published patch for any version; reached only through the dev toolchain (ESLint's glob matching over trusted local files), never the app or the shipped bundle.
  - `pip` itself is flagged (PYSEC-2026-196/1795/1796/2875/2876) — the installer, not a project dependency (it is not in `requirements*.txt` and never ships in an image or the Electron package). Upgrade the developer/CI `pip` out of band; nothing to pin in the app.

**File upload handling (reviewed & hardened):** employee document uploads (`storage.py`, `routes/document_routes.py`).
- **Fixed — stored XSS:** the upload type check trusts the client-supplied `Content-Type`, but the file was stored with its original extension and served **inline** (`as_attachment=False`). An attacker could upload `evil.html` labelled `application/pdf`, which landed as `<uuid>.html` and rendered as HTML same-origin when viewed — script execution in the app's origin (and the CSRF-token cookie is JS-readable by design). Files are now served **as downloads** with `X-Content-Type-Options: nosniff`, so the browser saves rather than executes them. Filenames are already server-generated UUIDs (no path-traversal from the client), and the on-disk path stays under the upload base.
- **Fixed — upload-size DoS:** added a framework-level `MAX_CONTENT_LENGTH` (16 MB) so an oversized body is refused with 413 before it is buffered, not only by the route's own after-the-fact 10 MB check.

**Rate limiting (reviewed & extended):** login was already capped (10/min). The other unauthenticated brute-force surface — the kiosk PIN endpoints (`verify-pin`, `clock-in`, `clock-out`), which authenticate an employee by a 4-digit PIN with no session — is now capped at 10/min **keyed by employee + IP**, so guessing one person's PIN is throttled while a shared wall kiosk stays free to clock a stream of different employees.

**Authorization (reviewed & hardened):** a pass over all 169 API routes mapping each to its role gate, focusing on the 38 that rely only on a session (any authenticated role) and on id-parameter routes (IDOR). Most session-only routes are correct by design (self-scoped settings/notifications, task routes with internal role + `_can_view_task` checks, the public PIN kiosk, read-only taxonomy). Three real gaps were found and fixed:
- **Notifications — IDOR (systemic).** The whole notification blueprint predated session auth and trusted a client-supplied `user_id` (query or body), so any signed-in user could read *or modify* another user's notifications and preferences by naming their id (`GET /notifications?user_id=…`, `PUT /prefs`, `mark-read`, push subscription). Every endpoint now derives the user from the session (`get_request_user_id()`) and ignores any client id.
- **Crew presets — missing role gate.** The four `/api/crew-presets` CRUD routes had no `@require_role`, so any signed-in role (HR, or an `employee` portal login) could read and edit crew layouts. Gated to the crew-planning roles (admin/supervisor/dispatcher), matching `crew_routes`.
- **Employee roster — over-broad after the `employee` role landed.** `GET /api/employees` was intentionally open to "any signed-in user" for crew dropdowns, but the new `employee` portal role then inherited access to the full roster (names + dates of birth). Narrowed to the four staff roles (`ALL_ROLES`); `employee` is excluded.

Regression tests: `test_authz_review.py` (8) plus the employee-roster lockout in `test_portal.py`.

### Tenant-isolation review (cross-org IDOR on org-less children)

Runtime tenant isolation filters every SELECT of an org-owning entity, but a child row that carries no `org_id` of its own (an employment event, disciplinary action, maintenance record, call assignment, patient alert/contact) cannot be scoped by that filter — it is only safe if the route reaches it *through* its org-owning parent. A pass over every route that loads such a child by a client-supplied id found six families that loaded it directly, so one organisation could read/modify another's child row by guessing its id:

- **Employment event** — `DELETE /api/employees/employment/<id>`.
- **Disciplinary action** — `PATCH`/`DELETE /api/employees/disciplinary/<id>`.
- **Vehicle maintenance** — `PATCH /api/vehicles/maintenance/<id>` (mutated the record before ever loading its vehicle).
- **Call assignment** — `DELETE /api/dispatch/assign/<id>` and its `…/complete` and `…/reopen` PATCHes (the assignment's `is_active` flipped regardless of the call's org).
- **Patient alert** — `PUT …/alerts/<id>` and `POST …/alerts/<id>/resolve`.
- **Patient contact** — `PUT`/`DELETE …/contacts/<id>`.

Each now resolves through an org-filtered parent (`Employee` / `Vehicle` / `Call` / `Patient` via `filter_by(id=…).first()`) and returns 404 when the parent is not in the caller's organisation. Org-scoped `.get(pk)` itself was confirmed to be correctly filtered per request — the leaks were only the org-less children reached without their parent. Regression tests: `test_tenant_isolation.py` (+5, each red before the fix).

### Adversarial security pass (consolidated)

A single attacker's-eye suite, `test_security_adversarial.py`, runs the multi-tenant / crypto / identity / realtime surface as attacks that must fail, and maps each scenario to where it is proven (this suite or the dedicated file). New cross-cutting attacks pinned down here:

- **`org_id` injection on create** — an admin posting `org_id`/`organization_id` for another org in the create body is ignored; the tenant write-stamp lands the row in the caller's org, and the target org still 404s it.
- **Ciphertext relocation (AAD binding)** — a field ciphertext moved (via direct DB write) into another org's row, or into a different field of the same row, fails to decrypt and reads back as `None` — never the original plaintext, never the raw token, never a 500.
- **Stolen DB without the key** — with the master key gone, every encrypted field reads as `None`; the ciphertext is inert.
- **Master-key rotation** — adding a new master version keeps existing (old-version-wrapped) DEKs readable with no field re-encryption, and newly provisioned orgs wrap under the newest version. Retiring an old version before re-wrapping the DEKs it protected makes those fields unrecoverable — so old versions must be retained until a re-wrap. The `flask rewrap-org-keys` CLI closes this: it re-wraps every org's DEK under the newest master version (field ciphertext untouched, safe to re-run), after which the old version can be dropped. A hardening fix landed here too: an unrecoverable DEK (missing master version) now degrades a *read* to `None` (`encrypted_fields._dek_for_read` swallows `KeyManagementError`) instead of surfacing a 500.
- **Realtime isolation** — a subscriber of one org never receives another org's published events at the bus.
- **Invite escalation** — an invitee posting `role`/`org_id`/`is_owner`/`is_platform_admin` at accept time is bound to the token's role and org; the client-supplied privilege fields are ignored.
- **Concurrent edit contract** — two editors of the same row both succeed with last-write-wins (advisory concurrency, matching the app's warn-not-block philosophy); neither corrupts the row nor leaks across the tenant boundary.

Master-key rotation is now fully supported end to end (add a version → `flask rewrap-org-keys` → drop the old version); see `test_org_crypto.py::test_rewrap_moves_dek_to_the_newest_master_version`.
