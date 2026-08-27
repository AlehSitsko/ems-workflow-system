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

### `[ ]` B (P2) — Backend coverage for weak zones
Targets: `settings_utils`, `audit_routes`, `crew_routes`, `models/dispatch`, `push_utils`,
`notification_utils`. Real-risk tests (RBAC, tenant isolation, validation, no PHI/secret leak).

### `[x]` C (P2) — Frontend API-wrapper tests
Untested: employeesApi, patientsApi, vehiclesApi, operationsApi, portalApi (+ crew/auth/audit).
Own-logic: URL/query/encoding, method, body, credentials, CSRF/caller headers, error normalization
(400/401/403/404/409/422/429/500 + fallback), no client-trusted org_id/role/identity. Fetch stubbed.

### `[ ]` D (P1) — Multi-tenancy / security adversarial review
Verify existing tenant-isolation + upload + CSRF tests cover org_id spoofing (body/query/header),
IDOR, CSV injection, HTML-as-PDF. Add adversarial tests where a gap is proven.

### `[ ]` E (P2) — Migrations & schema drift
Verify Alembic head (claimed `f1a2b3c4d5e6`), clean upgrade on empty SQLite, idempotency, drift test.
PostgreSQL upgrade BLOCKED (no Docker) — document command.

### `[ ]` F (P2) — Performance / load
Run `qa_test.py` + `stress_test.py` (seeded ≥500/100/300). `pg_benchmark.py` vs PostgreSQL BLOCKED
(no Docker) — document command + expected metrics. Never call SQLite+Flask a production load test.

### `[ ]` G (P3) — Dead code & repo hygiene
Re-verify: no console.log/print/debugger in shipped src, no stray artifacts, `.gitignore` sound,
`pass` intentional. Remove only proven-dead code.

### `[ ]` H (P1) — Branch/release hygiene + owner checklist
Confirmed in baseline. Prepare the owner PR/merge/release checklist — do NOT execute.

### `[ ]` I (P0) — Full final regression

### `[ ]` J (P0) — Final report

## Progress log

- **A** — README snapshot synced to v1.1.13 (1150/500, measured). Only stale spot; other docs
  clean or historical-labelled.
- **C** — +18 wrapper tests (employeesApi, patientsApi, vehiclesApi): URL/query/encoding, method,
  body, credentials, error normalization. eslint clean.
- **B baseline (measured):** push_utils 37.8%, notification_utils 54.2%, crew_routes 66.1%,
  settings_utils 68.3%, audit_routes 69.0%, payroll_routes 69.6%, models/dispatch 73.0%.

_Appended per item._
