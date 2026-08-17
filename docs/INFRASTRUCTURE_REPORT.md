# Infrastructure Evolution — Consolidated Report

Status of the client/server infrastructure work that grew EMS Workflow System from a
mostly-local app into a multi-user, multi-tenant system **without giving up the
standalone/local deployment**. The guiding rule throughout: *extend what already works
with the minimum necessary architectural change; do not rewrite it.*

Legend: **Implemented** = shipped with tests. **Experimental** = implemented, but not
yet verified against live external infrastructure. **Planned** = designed, not built.

---

## Phase 0 — Architecture audit

**Implemented.** Established the seams the later phases build on: the Flask app-factory
with ~30 blueprints, SQLAlchemy models, SQLite (dev/standalone) vs PostgreSQL (server)
selected by `DATABASE_URL`, and the existing `storage.py` / `audit_utils.py` /
notification abstractions. No rewrite — every later phase attaches to these.

## Phase 1 — Server foundation & tenant isolation

**Implemented.** Runtime tenant isolation in `tenant.py`: a `do_orm_execute` hook adds
`WHERE org_id = :current_org` to every SELECT of an org-owning entity, and a
`before_flush` hook write-stamps `org_id` on new rows from the trusted request context.
`current_org_id()` lives in request-scoped `g`; `ORG_SCOPED_MODELS` lists the covered
models; `unfiltered()` is the audited escape hatch for cross-org ops.

- **Gate:** cross-tenant tests are exhaustive — `test_tenant_isolation.py` covers
  list/get/mutation scoping, org write-stamping, audit-log scoping, and (the subtle
  one) org-less child rows reached by id, which must resolve through their org-owning
  parent. `test_security_adversarial.py` adds `org_id`-injection-on-create.
- **Postgres:** `DATABASE_URL`-driven, Flask-Migrate/Alembic migrations, a
  SQLite→Postgres data-copy script (tested). CI now **boots the prod stack and
  smoke-tests it** (Postgres + Gunicorn + Nginx via `docker compose --wait` + a
  `/api/health` curl) — the migration chain runs against real PostgreSQL there,
  which surfaced and fixed several SQLite-only constructs (integer-vs-boolean,
  unquoted `user`, an anonymous-constraint drop). A startup check also warns when
  a database is behind the migration head instead of failing with an opaque 500.

## Phase 2 — Identity, onboarding & continuity

**Implemented.**
- **Invite-only onboarding** (`invitation_routes.py`): admin creates an invitation;
  only the SHA-256 **hash** of the token is stored; accept is one-time, and the new
  user's **org and role come from the token**, never the client body. Replay, expired,
  revoked, and bad-token paths are all tested, plus role/org tamper.
- **Sessions** — per-device `UserSession` registry with revocation; disabling a user or
  changing their role takes effect on the next request; subdomain↔session binding.
- **Owner continuity & recovery** (`org_security_routes.py`) — org **recovery codes**
  (hashed, one-time, org-scoped, shown once); a public emergency redeem restores an
  admin/owner account and revokes all of that org's sessions.

## Phase 3 — Event infrastructure

**Implemented (single-process *and* multi-worker).** `events.py` exposes one surface
(`subscribe`/`unsubscribe`/`publish`) behind two interchangeable brokers, selected at
import by `EMS_REDIS_URL`:
- **InMemoryEventBus** (default): in-memory, org-scoped; bounded per-subscriber queues
  drop for a slow client rather than blocking publishers. Correct for a single worker
  — dev, standalone/desktop, tests, E2E.
- **RedisEventBus** (`EMS_REDIS_URL` set): publishes to an org-scoped Redis channel; a
  per-process listener thread pattern-subscribes and fans each message into the local
  per-org queues, so **every** Gunicorn worker delivers an org's events regardless of
  which worker handled the originating request. Best-effort publish with short
  timeouts (a Redis outage drops the event, never hangs the request); the listener
  reconnects with backoff; queues stay bounded.

`events_routes.py` streams over **SSE** (`/api/events/stream`), tenant-scoped from the
session, publishing after commit.

- **Why this matters:** the prod image runs `--workers 3`. With the in-memory bus
  (process-local) a client's SSE stream on one worker would miss events published on
  another — realtime works in a demo and silently drops ~2/3 of events in production.
  `gunicorn.conf.py` now **fails closed**: it refuses to boot >1 worker in production
  without `EMS_REDIS_URL`, so that broken configuration can never ship.
- **Isolation** proven at both brokers (`test_events.py`, `test_redis_events.py`,
  `test_security_adversarial.py`); cross-worker delivery is proven over fakeredis and
  again end-to-end in CI (`scripts/prod_realtime_smoke.py` against the real
  Postgres + Redis + 3-worker + Nginx stack).

## Phase 4 — Notification engine

**Implemented.** Event → rules → org policy → user preferences → visual/sound, with
quiet-hours / DND and own-action suppression (you don't get pinged for your own edit).
Web-Audio synthesised tones; per-user rule config in the frontend. Rules logic is unit
tested (`notificationRules.test.js`).

## Phase 5 — Field-level encryption at rest

**Implemented.** AEAD field encryption bound to a trusted org context.
- **Crypto** (`core/security/crypto.py`): AES-256-GCM, `scheme:nonce:ct` tokens,
  `DecryptionError` on tamper/wrong-key/wrong-AAD.
- **Envelope keys** (`keyring.py` + `org_crypto.py`): a master key wraps a per-org DEK;
  the master key is **never** in the DB; DEKs are cached per process. Not tied to any
  user, owner, or device.
- **AAD binding** (`encrypted_fields.py`): every ciphertext is bound to
  `org | entity_type | entity_id | field`, so it can't be silently relocated across
  orgs, rows, or fields.
- **Blind index**: a keyed HMAC column enables exact-match search without decryption.
- **Single-column storage model**: a field holds ciphertext *or* plaintext
  (`is_ciphertext` distinguishes), so enabling encryption needs no plaintext-drop
  migration, and no master key = plaintext mode (keeps local/standalone working).
- **Applied to** `Patient.member_id` (+ blind index), `policy_number`,
  `insurance_notes`, patient contact/facility/emergency PII (`phone`,
  `secondary_phone`, `address`, `facility_name`, `room_number`,
  `emergency_contact_name/phone`) and free-text (`notes`, `dispatch_comment`,
  `transport_instructions`, `access_instructions`, `special_equipment_notes`),
  `Employee.phone` / `email`, `Patient`/`Employee` `dob` (+ patient `dob_bidx` and a
  non-identifying `dob_month_day` for the calendar), `EmployeeDocument.document_number`,
  `Call.caller_phone` / `caller_note`, and hashed `Employee.kiosk_pin`. Backfill via
  `flask encrypt-existing-fields` — backup-first,
  idempotent, never destroys plaintext (replaces it with its own ciphertext).
- **Master-key rotation is complete end to end:** add a new `EMS_MASTER_KEY` version →
  `flask rewrap-org-keys` re-wraps every org DEK under it → the old version can be
  dropped. A read whose wrapping version is unavailable degrades to `None`, never a 500.
- **Tests:** `test_crypto.py`, `test_org_crypto.py` (incl. rewrap), `test_encrypted_fields.py`,
  `test_patient_encryption.py`, plus the adversarial relocation/rotation/stolen-DB cases.

## Phase 6 — Object storage

**Implemented (Local + S3; S3 CI-verified against MinIO).** `storage.py` is now a provider abstraction
selected at runtime — switching backends touches only this file:
- **LocalStorageProvider** (default): files under the Flask instance dir; standalone and
  desktop need no external infra. **Implemented + tested.**
- **S3StorageProvider** (`EMS_STORAGE=s3`): AWS S3 / MinIO / any S3 API; `boto3` is an
  optional prod dependency imported lazily. Downloads are streamed **through the app**
  (auth stays in the request path) — no public or presigned URLs for sensitive docs.
  **Implemented + verified end to end in CI against a real MinIO**: the Docker job boots
  the prod stack with the S3 overlay (`docker-compose.s3-test.yml`) and runs a document
  upload→download round-trip through S3StorageProvider (`scripts/prod_s3_smoke.py`), on
  top of the fake-boto3 unit tests. Moving an *existing* local deployment's files into
  S3 is a one-off `flask migrate-documents-to-s3` (idempotent, non-destructive; keeps
  object keys so downloads keep working).

Both providers: object keys are **server-generated and org-scoped**
(`organizations/{org_id}/employees/{employee_id}/{uuid}.ext`), never client-supplied,
validated against path escapes. Downloads are attachment-only with `nosniff`.
Upload/download/delete each emit an audit event (`document.uploaded` / `.downloaded` /
`.deleted`) into the **existing** audit log — no second audit trail.

**Env:** `EMS_STORAGE=s3`, `EMS_S3_BUCKET`, `EMS_S3_ENDPOINT_URL` (MinIO/non-AWS),
`EMS_S3_REGION`, plus standard AWS credentials.

## Phase 7 — Adversarial security pass

**Implemented.** `test_security_adversarial.py` runs the multi-tenant / crypto /
identity / realtime surface as attacks that must fail, mapping each scenario to where
it is proven. Cross-cutting attacks pinned here: `org_id` injection on create;
ciphertext relocation across org/field (AAD); stolen DB without the key; master-key
rotation (incl. the read-path hardening it surfaced); realtime cross-org isolation;
invite privilege escalation; and the concurrent-edit (last-write-wins) contract. See
the "Adversarial security pass" subsection in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

---

## Standalone/local invariant

Every phase preserves the local, single-tenant, no-infrastructure deployment:
- No `DATABASE_URL` → SQLite; no `EMS_MASTER_KEY` → plaintext fields; no `EMS_STORAGE`
  → local files; the event bus/SSE run in-process. The desktop (Electron + PyInstaller)
  build is unaffected.

## Environment variables (server profile)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL DSN (unset → SQLite) |
| `EMS_MASTER_KEY` | Envelope master key(s), e.g. `v1:<b64>,v2:<b64>`. **Required in production** (`EMS_ENV=production` refuses to start without a valid one); unset → plaintext only in local/standalone. `EMS_MASTER_KEY_FILE` mounts it as a secret. |
| `EMS_REDIS_URL` | Realtime broker (e.g. `redis://redis:6379/0`). **Required** for >1 Gunicorn worker in production (the gunicorn guard refuses to boot otherwise); unset → in-memory bus (single worker). |
| `WEB_CONCURRENCY` / `GUNICORN_THREADS` | Gunicorn worker / thread counts (read by `gunicorn.conf.py`). |
| `EMS_STORAGE` | `local` (default) or `s3` |
| `EMS_S3_BUCKET` / `EMS_S3_ENDPOINT_URL` / `EMS_S3_REGION` | S3 provider config |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 credentials (read by boto3) |
| `EMS_SSE_KEEPALIVE` | SSE keepalive interval (s) |

## Operational CLI

`flask provision-org-keys` · `flask rewrap-org-keys` · `flask encrypt-existing-fields --yes`
· `flask migrate-documents-to-s3` · `flask create-org` · `flask create-platform-admin`

## Remaining / planned

- **TLS termination** in front of the prod Nginx is an operator step (the stack is
  built to sit behind a TLS proxy). Documented end to end in
  [DEPLOYMENT_TLS.md](DEPLOYMENT_TLS.md) — Caddy / Nginx / cloud-LB recipes, certs,
  the required env, and the SSE-through-proxy gotcha.

*(Done since earlier drafts of this report: the Redis-backed multi-worker event broker
— Phase 3; live S3/MinIO verification — Phase 6, now exercised in the CI Docker job; and
the field-encryption / kiosk-PIN-hash rollout — see [DATA_CLASSIFICATION.md](DATA_CLASSIFICATION.md).)*

## Test posture

Full backend suite **1009 tests** (as of commit `47ef647`; the report was first
written at 982 and 993 — the number grows as tests land, so treat it as a snapshot
and regenerate with `pytest --co -q`); frontend **458**
Vitest tests. **8 Playwright E2E spec files (20 cases)** run in CI against a disposable
migrated+seeded backend (smoke, roles, dispatch, workflow, invitations, realtime,
cross-module realtime sync, responsive-viewport). CI runs four jobs — backend
(pytest), frontend (lint + Vitest + build), E2E (Playwright), and Docker (build
images + prod-stack smoke on PostgreSQL).
