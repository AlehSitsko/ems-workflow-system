# TODO

The **active** backlog only. Shipped work is not tracked here — its history lives in
[docs/COMPLETED_BLOCKS.md](docs/COMPLETED_BLOCKS.md) and
[docs/INFRASTRUCTURE_REPORT.md](docs/INFRASTRUCTURE_REPORT.md); the phased view is in
[docs/ROADMAP.md](docs/ROADMAP.md). Every `[ ]` below is genuinely not implemented.

## Planned (next reasonable work)

Decided to stay plaintext (not gaps):
- `last_name`/`first_name` — substring-searched and alphabetically paginated, so they
  can't use a blind index without a UX loss (see
  [docs/design/DOB_LASTNAME_ENCRYPTION.md](docs/design/DOB_LASTNAME_ENCRYPTION.md)).
- `Call.pickup_address`/`dropoff_address` — not searched/sorted, but carried by the
  realtime SSE event + stored notification bodies + the CSV export; encrypting them
  would be a behaviour change for low benefit (see
  [docs/DATA_CLASSIFICATION.md](docs/DATA_CLASSIFICATION.md) #5).

Both are covered by tenant isolation + RBAC + `is_sensitive` masking + operator
DB-at-rest encryption.
- [ ] **Deployment hardening — remaining bits.** Done in-repo: the DR / TLS / secrets
  runbook ([docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md)), the
  [TLS deployment guide](docs/DEPLOYMENT_TLS.md), live S3 verification against MinIO in
  CI, the local→S3 file migration (`flask migrate-documents-to-s3`), and automated
  dependency + base-image updates (Dependabot: pip, npm, Docker images, GitHub Actions —
  supersedes hand-pinning image digests, which without an update process just goes
  stale). Left: operator/external only — stand up the TLS-terminating proxy for a given
  environment.
- [ ] **Analytics at scale (only if volume warrants).** The dispatcher-analytics
  endpoint now projects just the five columns it aggregates (not whole Call rows, which
  carry wide/encrypted fields) and is covered by tests, incl. tenant isolation. The
  per-dispatcher tally parses a comma-separated `missing_fields` string, which is
  Python-shaped, not clean SQL; a full move to indexed SQL aggregation + operational-day
  rollups is only worth it at real volume (the query is already bounded by `limit`).

## Coverage & hardening follow-ups (post-v1.1.12 remediation)

Actionable items from the cycle-2 assessment — closing the remaining test gaps in the
weakest zones (same standard as the time/crew_preset/document work). Worked one at a time,
each with its own commit; this list is updated as each lands.

- [x] **A — Notifications/push backend tests.** Done (`test_notification_routes.py`, +14):
  list (role/prefs-filtered), mark-read/all, per-user isolation, prefs get/put, push
  subscribe/unsubscribe/test-push with mocked provider outcomes (failure -> clean 502/400 +
  cleared subscription, never a 500). `notification_routes` 58.8% -> 84.6%.
- [ ] **B — `tenant_routes.py` backend tests** (56%). Public `current`, org get/patch,
  invitation lifecycle, org-boundary (cannot read/modify another org), no org-id via payload.
- [ ] **C — `NotificationBell.jsx` frontend test.** Unread counter, open list, mark
  (all) read, empty state, failed request, accessible name/focus.
- [ ] **D — `payroll_routes.py` (65%) + `patient_routes.py` (65%) coverage top-up** —
  edge cases (already-calculated period, permission boundaries, archived/deleted).
- [ ] **E — `api/` wrapper tests** for a couple of untested wrappers with real own-logic
  (URL construction, CSRF, error normalization for 401/403/409/422).

**Blocked (need a Docker/Postgres host — not faked locally):**
- [ ] Run `scripts/pg_benchmark.py` against the prod PostgreSQL stack; compare to SQLite.
- [ ] DR drill on a live stack (backup→restore, container restart, Redis/S3 outage).
- [ ] Operator TLS-terminating proxy for a target environment (external, per deployment).

## Deferred (intentionally parked — not oversights)

- [ ] **External (Google/Outlook) two-way calendar sync** — needs an OAuth
  integration and a separate privacy/security policy before any patient data could
  cross the boundary. ICS **export** already ships.
- [ ] **Route optimization** — a research problem (routing engine, constraints), not a
  near-term build.
- [ ] **Configurable rate engine for trip pricing.** The Call Intake Price Calculator
  is a client-side *estimate helper* only (base + mileage×rate, ±return ride, one-time
  waiting fee) and is not persisted to a call. A real engine — per-org rate tables,
  service-level pricing, mileage tiers — would live in the backend as the source of
  truth for a persisted, billable amount. Not started.
