# Operations & Disaster-Recovery Runbook

Actionable procedures for running the **production server profile** (Postgres +
Redis + Gunicorn + Nginx, `docker-compose.prod.yml`). For *why* each piece exists see
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md); for the server-profile environment
variables see [INFRASTRUCTURE_REPORT.md](INFRASTRUCTURE_REPORT.md). Commands assume a
Linux/Docker host (this is the Docker/production profile, not the Windows desktop
build).

> **This is not a HIPAA-ready deployment.** It is a portfolio project. Do not store
> real patient data. The steps below are operational hygiene, not a compliance
> program.

---

## 1. TLS termination (required in production)

The prod stack's Nginx listens on plain HTTP `:8080` and is designed to sit **behind
a TLS-terminating reverse proxy** (a cloud load balancer, or Caddy / Nginx / Traefik
you run). Never expose `:8080` directly on the internet.

The terminating proxy must:

- Terminate HTTPS and forward to the stack's `frontend:8080`.
- Send `X-Forwarded-Proto: https` (the app trusts it for `Secure`-cookie and redirect
  logic). Keep `SESSION_COOKIE_SECURE=1` (the production default — `0` is only for the
  local plain-HTTP smoke test).
- Stream Server-Sent Events: do not buffer `/api/events/` (the stack's own Nginx
  already sets this internally; a proxy in front must not re-buffer it — `proxy_buffering off`, HTTP/1.1).
- Send **HSTS** (`Strict-Transport-Security: max-age=63072000; includeSubDomains`).
- For **subdomain multi-tenancy**, present a **wildcard certificate** for
  `*.${BASE_DOMAIN}` (and `admin.${BASE_DOMAIN}` for the platform console), and route
  every org subdomain to the same stack.

Minimal Caddy example (automatic Let's Encrypt, wildcard needs a DNS plugin):

```
*.ems.example.com, ems.example.com {
    reverse_proxy localhost:8080
}
```

## 2. Secrets & encryption keys

All secrets are read via `config.py._secret()`, which prefers a mounted
`{NAME}_FILE` over the `{NAME}` env var — use file mounts (Docker/K8s secrets) in
production so values never sit in the process environment.

| Secret | Loss impact | Backup |
|---|---|---|
| `SECRET_KEY` | All sessions invalidated (users re-login) | Recoverable — rotate per PRODUCTION_READINESS → Secrets |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | No DB access | Store in the secret manager |
| **`EMS_MASTER_KEY`** | **Every encrypted field (PHI) is permanently unrecoverable** | **See below — most critical** |

### EMS_MASTER_KEY is the single most important thing to back up

Encrypted fields (patient/employee contact PII, patient free-text, insurance
identifiers, document numbers) are stored as ciphertext wrapped by a per-org key that
is itself wrapped by `EMS_MASTER_KEY`. **A database backup without the master key is
useless for those fields** — restoring the DB then recovers only ciphertext.

- Back up `EMS_MASTER_KEY` **separately from the database**, in a dedicated secret
  manager (Vault, AWS Secrets Manager, KMS) or offline escrow. Do not keep it only in
  the compose `.env`.
- **Rotation** (no field re-encryption needed — only the wrapped org keys are
  re-wrapped): set `EMS_MASTER_KEY="v1:<old-b64>,v2:<new-b64>"`, deploy, run
  `docker compose -f docker-compose.prod.yml exec backend flask rewrap-org-keys`, then
  drop `v1`. The highest version is always the one used to wrap new keys.
- Provision keys for any org created before encryption was enabled:
  `flask provision-org-keys`. Backfill existing plaintext to ciphertext (backup
  first): `flask encrypt-existing-fields --yes`.

## 3. Backups

Back up **all three** together, and keep them consistent in time:

1. **Database** (ciphertext for encrypted fields):
   ```bash
   docker compose -f docker-compose.prod.yml exec -T db \
     pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > ems-$(date +%F).sql.gz
   ```
2. **`EMS_MASTER_KEY`** — from the secret manager (see §2). Without it the DB dump
   cannot decrypt PHI.
3. **Uploaded documents** — the object store: the `EMS_STORAGE=s3` bucket, or the
   local `instance/uploads/` volume if using local storage.

(The **desktop** build backs itself up from the app's **File → Create backup…** menu —
a WAL-aware SQLite snapshot; that path does not apply to the server profile.)

## 4. Restore & disaster recovery

1. Bring up a clean stack with the **same `EMS_MASTER_KEY`** (and `SECRET_KEY`,
   `POSTGRES_PASSWORD`) as the backup.
2. Create the schema, then load the dump:
   ```bash
   docker compose -f docker-compose.prod.yml up -d db
   gunzip -c ems-YYYY-MM-DD.sql.gz | \
     docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"
   ```
   (Or start the backend once so `flask db upgrade` creates an empty schema, then
   restore data.) The startup **schema-drift guard** logs a loud warning if the DB is
   behind the code's migration head — run `flask db upgrade` if so.
3. Restore the uploads bucket/volume.
4. Verify: `GET /api/health` returns `{"status":"ok"}`; sign in; open a patient and
   confirm an encrypted field (e.g. member id) decrypts (proves the key matches). If it
   shows blank where data is expected, the master key does not match the backup.
5. **Lost all admins for an org?** Use an unused **organization recovery code**
   (`POST /api/org/recovery/redeem`) — it restores an admin/owner and revokes that
   org's sessions. Generate codes ahead of time from the org security settings and
   store them offline.

## 5. Object storage (S3-compatible)

Set `EMS_STORAGE=s3`, `EMS_S3_BUCKET`, `EMS_S3_ENDPOINT_URL` (for MinIO/non-AWS),
`EMS_S3_REGION`, and standard AWS credentials. Verification checklist after switching:

- Upload a document for an employee → it succeeds and an object appears under
  `organizations/{org_id}/employees/{employee_id}/…` in the bucket.
- Download it through the app (`/api/documents/<id>/file`) → streamed as an attachment
  (the app never hands out public/presigned URLs for these).
- Object keys are server-generated and org-scoped; a user of one org cannot reach
  another org's document (returns 404), proven by the tenant-isolation tests.

> **Not runtime-verified in CI.** The S3 provider is unit-tested against a fake client;
> a live MinIO/S3 endpoint and a local→S3 migration for an existing deployment are not
> exercised here — run the checklist above against your real endpoint before relying
> on it.

## 6. Monitoring & health

- **Liveness:** `GET /api/health` (used by the container healthcheck).
- **Metrics:** `GET /metrics` (Prometheus — request count + latency).
- **Fail-closed guards** surface misconfiguration as a refused boot (visible to health
  checks): production without a valid `EMS_MASTER_KEY`; more than one Gunicorn worker
  without `EMS_REDIS_URL` (multi-worker SSE would silently drop events). A stale DB is
  a loud startup warning, not a crash.
