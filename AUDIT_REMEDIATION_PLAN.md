# Audit Remediation Plan — Cycle 3 (final audit)

Living work journal. **Constraints this cycle:** all work on `dev`; **no `dev → main` merge, no
GitHub Release, no new/changed tags** without the owner. Owner actions are prepared as exact
commands, not executed. Source of truth = the current code, re-verified.

> **Prior cycles (shipped):** v1.1.10 (audit) · v1.1.11 (quality gates) · v1.1.12 (deps) ·
> v1.1.13 (coverage follow-ups + a tenant 500→400 fix). This cycle is the closing pass.

## Baseline (verified 2026-08-27)

- **Branch:** `dev`. **dev = main = `6f9f84a`**, divergence **0/0** (in sync after the v1.1.13
  release merge — expected, not an artificial split).
- **Version:** frontend + desktop both **1.1.13** (consistent).
- **Last tag:** `v1.1.13`. **Last published Release:** `v1.1.13` (Latest, installer + SHA-256) —
  **no release desync.**
- **Open PRs:** none. **Working tree:** clean.
- **CI on `6f9f84a`:** green (all 6 jobs).
- **Tests (to confirm in Stage I):** backend ~1150 @ ~84.8%; frontend ~500 @ ~69.8%; E2E 20.

## Work items

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked · `[-]` n/a after check.

### `[x]` A (P1) — Documentation sync to v1.1.13
README line 363 still says "1068 backend + 466 frontend, snapshot at v1.1.12" (actual 1150/500,
version 1.1.13). Update to measured values pinned to v1.1.13 / de-brittle; sweep docs for stale
v1.1.12; keep historical reports labelled historical; no false HIPAA/prod-scale/CAD-ePCR claims.

### `[x]` B (P2) — Backend coverage for weak zones
Targets: `settings_utils`, `audit_routes`, `crew_routes`, `models/dispatch`, `push_utils`,
`notification_utils`. Real-risk tests (RBAC, tenant isolation, validation, no PHI/secret leak).

### `[x]` C (P2) — Frontend API-wrapper tests
Untested: employeesApi, patientsApi, vehiclesApi, operationsApi, portalApi (+ crew/auth/audit).
Own-logic: URL/query/encoding, method, body, credentials, CSRF/caller headers, error normalization
(400/401/403/404/409/422/429/500 + fallback), no client-trusted org_id/role/identity. Fetch stubbed.

### `[x]` D (P1) — Multi-tenancy / security adversarial review
Verify existing tenant-isolation + upload + CSRF tests cover org_id spoofing (body/query/header),
IDOR, CSV injection, HTML-as-PDF. Add adversarial tests where a gap is proven.

### `[x]` E (P2) — Migrations & schema drift
Verify Alembic head (claimed `f1a2b3c4d5e6`), clean upgrade on empty SQLite, idempotency, drift test.
PostgreSQL upgrade BLOCKED (no Docker) — document command.

### `[x]` F (P2) — Performance / load
Run `qa_test.py` + `stress_test.py` (seeded ≥500/100/300). `pg_benchmark.py` vs PostgreSQL BLOCKED
(no Docker) — document command + expected metrics. Never call SQLite+Flask a production load test.

### `[x]` G (P3) — Dead code & repo hygiene
Re-verify: no console.log/print/debugger in shipped src, no stray artifacts, `.gitignore` sound,
`pass` intentional. Remove only proven-dead code.

### `[x]` H (P1) — Branch/release hygiene + owner checklist
Confirmed in baseline. Prepare the owner PR/merge/release checklist — do NOT execute.

### `[x]` I (P0) — Full final regression

### `[x]` J (P0) — Final report
Delivered (chat + this journal). **Historical note:** Cycle 3 finished with NO tag/Release
(per its constraints); afterwards the owner authorized shipping, so **v1.1.14 was published**
(merge `530b6d8`, tag `v1.1.14`, Release with installer + SHA-256). Cycle 4 below runs on top of
the published v1.1.14. Item D said "CSV injection fixed" — accurate for the reports/payroll-names
scope of v1.1.14, but **v1.1.14's guard was incomplete** (punctuality/call-log/ADP still raw) —
completed in Cycle 4. Item C covered employees/patients/vehicles wrappers only; the rest are
dispositioned in Cycle 4 Item C4-3.

## Progress log

- **A** — README snapshot synced to v1.1.13 (1150/500, measured). Only stale spot; other docs
  clean or historical-labelled.
- **C** — +18 wrapper tests (employeesApi, patientsApi, vehiclesApi): URL/query/encoding, method,
  body, credentials, error normalization. eslint clean.
- **B baseline (measured):** push_utils 37.8%, notification_utils 54.2%, crew_routes 66.1%,
  settings_utils 68.3%, audit_routes 69.0%, payroll_routes 69.6%, models/dispatch 73.0%.

- **B** — audit_routes 69→**100%** (pagination cap/floor, all filters, malformed id, RBAC),
  settings_utils 68.3→**85%** (legacy prefs migration + corrupt-blob skip), crew_routes lifted
  (+12 CRUD/validation/RBAC/alerts), notification_utils fan-out+dedup (+5). push_utils internals
  wrap pywebpush → tested at the route level (send_push mocked); library-boundary mocking skipped.

- **D** — existing suite already covers the cited vectors (test_tenant_isolation ×19, test_security_
  adversarial: client org_id-on-create ignored, AAD/ciphertext relocation, key rotation, realtime
  isolation, invite escalation; test_upload_security; test_org_id_in_payload_is_ignored). **One real
  gap found & fixed: CSV formula injection** in reports/payroll exports (csv_safe guard + tests).

- **E** — Alembic head verified `f1a2b3c4d5e6`; clean zero→head upgrade on empty SQLite + idempotent
  re-run OK; test_schema_drift 3 pass. PostgreSQL upgrade BLOCKED (no Docker) — CI Docker job covers it.
- **F** — qa_test.py 74/0/0; stress_test.py 0 errors, no slow reads, 142.5 req/s, P95 234ms, blind-index
  OK. pg_benchmark vs PostgreSQL BLOCKED (no Docker).
- **G** — clean: no console.log/print/debugger in shipped src, no stray artifacts tracked, ruff F401
  clean, `.gitignore` sound. Nothing to remove.

_Appended per item._

## Item H — Branch/release hygiene + owner checklist

**Verified state:** `dev = main = 6f9f84a` (pre-cycle), version 1.1.13 consistent (frontend+desktop),
last tag `v1.1.13`, last published Release `v1.1.13` (Latest, installer + SHA-256) — README
`releases/latest/download/...` serves v1.1.13. No release desync. This cycle's work is committed on
`dev` on top of that (docs + tests + one CSV-injection security fix). **No merge, tag, or Release
performed** (per constraints).

### Owner checklist (do NOT run automatically — owner's decision)
1. Review the cycle-3 commits on `dev` (all green in CI once pushed).
2. Open a PR `dev → main` (title suggestion: *"Cycle-3: CSV-injection fix + coverage (audit/settings/
   crew/notifications) + wrapper tests + docs sync"*).
3. Merge after CI is green (all 6 jobs).
4. This cycle is **docs+tests+a security fix** — if cutting a release, bump the patch version
   (`1.1.13 → 1.1.14`) in `frontend/package.json`, `desktop/package.json` and both lock files, then
   tag + build the installer + publish the Release with its SHA-256 (as done for v1.1.13). The
   CSV-injection fix is a reason to ship a patch release.
5. After merging, fast-forward `main` back into `dev`.

### Blocked (need a Docker/PostgreSQL host — exact commands)
- PostgreSQL migration upgrade: `DATABASE_URL=<pg-url> flask --app app db upgrade` (CI Docker job runs
  this on every push).
- Prod-stack + PostgreSQL benchmark: bring up `docker-compose.prod.yml`, seed, then
  `python scripts/pg_benchmark.py --base-url http://localhost:8080 --reps 3 --warmup 30 --concurrency 20`.
- E2E: `cd frontend && npx playwright install chromium && npm run test:e2e` (see Item I result).

## Item I — full regression (this branch)

| Check | Command | Result |
|---|---|---|
| Backend compileall | `python -m compileall ...` | ✅ OK |
| Backend ruff | `ruff check .` | ✅ All checks passed |
| Backend pytest + coverage | `pytest --cov=.` | ✅ **1188 passed**, **85.31%** (gate 80) |
| Backend pip-audit | `pip-audit -r requirements.txt` | ✅ No known vulnerabilities |
| Frontend lint | `npm run lint` | ✅ clean |
| Frontend Vitest + coverage | `npm run test:coverage` | ✅ **518 passed**, 72.12% lines (gate 67) |
| Frontend build | `npm run build` | ✅ OK |
| Frontend npm audit | `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Desktop npm audit | `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| E2E | `npm run test:e2e` | ✅ **20 passed** |
| Live QA | `python qa_test.py` | ✅ 74 passed, 0 failed, 0 warnings |
| Stress | `python stress_test.py` | ✅ 0 errors, no slow reads, 142.5 req/s |
| SQLite migration | zero→head + idempotent + drift | ✅ head f1a2b3c4d5e6, drift 3 pass |
| Docker / PostgreSQL | — | ⛔ BLOCKED (no local Docker) → CI covers |


---

# Cycle 4 — v1.1.14 security follow-up

Baseline (verified 2026-08-28): `dev = main = 530b6d8`, version **1.1.14**, tag `v1.1.14`, Release
`v1.1.14` (Latest, installer + SHA-256), no open PRs, main CI green. **Constraints:** dev only; no
merge/tag/Release/installer; do not touch the published v1.1.14 Release; prepare v1.1.15 only.

### `[x]` C4-1 (P0) — Complete CSV formula-injection across ALL exports
- **Evidence:** v1.1.14 left three exports writing user text raw — reports `punctuality/export`
  (group label), reports `call-log/export` (addresses/dispatcher/assignedBy/crew/truck/callType/
  serviceLevel/status), payroll `adp` (`employee_number`).
- **Files:** `utils/csv_utils.py`, `routes/reports_routes.py`, `routes/payroll_routes.py`.
- **Fix:** centralized `csv_safe_row()` applied to every data row of every CSV export; `csv_safe`
  hardened for leading-whitespace-before-trigger + leading tab/CR/LF (OWASP). Numeric/date columns
  not routed through it.
- **Tests:** `test_csv_injection.py` — unit policy + `csv_safe_row`, integration per endpoint parsed
  with `csv.reader` (calls, call-log, hours, punctuality-dispatcher, payroll generic/gusto/adp),
  RBAC, regression battery. 30 tests, all pass.
- **Commit:** `bacc9c8`. **Status: done.**

### `[ ]` C4-2 (P2) — Backend coverage follow-up (notification/push/dispatch/crew/payroll)
### `[ ]` C4-3 (P2) — Frontend API wrapper coverage (classify + test the ones with real logic)
### `[ ]` C4-4 (P1) — Documentation sync to v1.1.14 + honest historical narrative
### `[ ]` C4-5 (P1) — Prepare v1.1.15 (version bump + release notes + owner checklist; NO tag/Release)
### `[ ]` C4-6 (P0) — Full regression + final review
