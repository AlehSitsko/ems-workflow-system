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

### `[x]` C4-2 (P2) — Backend coverage follow-up
push_utils **37.8→94.6%** (send_push success/exception/410-reraise/malformed/no-key-leak + VAPID
resolution, pywebpush mocked at the boundary); notification_utils +2 (inactive user excluded,
no-recipient event records event but 0 user rows). crew/payroll/dispatch already lifted in cycle-3
+ the new CSV export tests; no low-value % padding added.
### `[x]` C4-3 (P2) — Frontend API wrapper coverage
**Tested (real own-logic):** callsApi, employeesApi, patientsApi, vehiclesApi (cycle-3) +
auditApi, operationsApi, crewApi (cycle-4, +14) — query/URL construction, encoding, method, body,
credentials, caller headers, error normalization. Plus pre-existing timeApi, calendarEventsApi,
csrf, reports, sessionExpiry tests.
**Dispositioned (no separate unit test — reason):**
- `holidaysApi`, `ptoApi`, `tenantApi` — thin CRUD (get/create/delete), body/query trivial and
  identical to already-tested wrappers; exercised by backend route tests + E2E. No unique logic.
- `authApi` (login/logout/session/user CRUD) — thin passthroughs; the non-trivial part (session
  expiry) is already unit-tested (`sessionExpiry.test.js`) and login/logout-as-role is covered by E2E.
- `portalApi`, `platformApi` — thin passthroughs to self-scoped / platform endpoints, E2E-covered.
None send a client-trusted org_id/role/identity (verified: wrappers pass only the caller's payload;
tenant/role come from the session server-side).
### `[x]` C4-4 (P1) — Documentation sync + honest narrative
README snapshot → 1217 backend / 532 frontend (measured), labelled for v1.1.15. SECURITY_AUDIT
documents the now-complete CSV guard (v1.1.14 partial → v1.1.15 complete). Cycle-3 J closed with the
historical note that v1.1.14 was published after cycle-3; no claim that v1.1.14 fully fixed CSV
injection. No HIPAA/prod-scale/CAD-ePCR overclaims introduced.
### `[x]` C4-5 (P1) — Prepare v1.1.15 (bump + release notes + owner checklist; no tag/Release). Done.
### `[x]` C4-6 (P0) — Full regression + final review. Done (E2E flake noted; CI authoritative).

## C4-5 — v1.1.15 prepared (NOT tagged/released)

Version bumped `1.1.14 → 1.1.15` in frontend/desktop package.json + both lock files. **No tag,
Release, or installer** — owner action only.

### Draft release notes — v1.1.15 (security patch)
> **v1.1.15 — complete the CSV export hardening**
>
> - **Security:** v1.1.14 added the first CSV / spreadsheet formula-injection guard (operational
>   reports and payroll names). v1.1.15 **completes it across every CSV export** — the punctuality
>   report, the call-log export (addresses, dispatcher, crew, truck, service level, …), and the
>   payroll ADP employee number were still written raw and are now neutralized. A single
>   `csv_safe_row` guard runs on every export row; the guard also handles a formula trigger after
>   leading whitespace and a leading tab/CR/LF (OWASP).
> - **Tests:** per-endpoint integration tests parse each export with `csv.reader` and assert no cell
>   is a live formula; push-notification edge cases; more frontend API-wrapper coverage.
> - **No API, schema, or migration changes.** All existing CSV column orders, names, filenames and
>   the Gusto / ADP / generic formats are unchanged. Upgrading is safe.

### Owner checklist for v1.1.15 (do NOT run automatically)
1. `git diff main...dev` — review the cycle-4 commits.
2. Confirm GitHub Actions green on the final `dev` SHA (all 6 jobs).
3. Open PR `dev → main`; merge only after green CI.
4. Build the Windows installer: `cd frontend && npm run build`; `cd ../backend && pyinstaller
   ems-backend.spec --noconfirm`; `cd ../desktop && npm ci && npm run dist`.
5. Compute the SHA-256 of `desktop/release/EMS-Workflow-System-Setup.exe`.
6. `git tag v1.1.15 && git push origin v1.1.15`.
7. `gh release create v1.1.15 <exe> --title "EMS Workflow System v1.1.15" --notes-file <notes>`.
8. Verify `releases/latest/download/EMS-Workflow-System-Setup.exe` resolves to v1.1.15 (HTTP 200,
   size-match).
9. Fast-forward `main` back into `dev`.
Do **not** modify or overwrite the existing published v1.1.14 Release.

## C4-6 — full regression

| Check | Command | Result |
|---|---|---|
| Backend compileall | `compileall` | ✅ OK |
| Backend ruff | `ruff check .` | ✅ clean |
| Backend pytest+cov | `pytest --cov=.` | ✅ **1217 passed**, **85.72%** (gate 80) |
| Backend pip-audit | `pip-audit -r requirements.txt` | ✅ no known vulns |
| Frontend lint | `npm run lint` | ✅ clean |
| Frontend Vitest+cov | `npm run test:coverage` | ✅ **532 passed**, 72.81% lines (gate 67) |
| Frontend build / npm audit | `npm run build` / `npm audit` | ✅ OK / 0 |
| Desktop npm audit | `npm audit --omit=dev` | ✅ 0 |
| SQLite migration + drift | upgrade→`f1a2b3c4d5e6` + drift | ✅ 3 pass |
| Live QA | `python qa_test.py` | ✅ 74/0/0 |
| Stress | `python stress_test.py` | ✅ 0 errors, 155.7 req/s, P95 264ms |
| E2E (local) | `npm run test:e2e` | ⚠️ 19/20; the 1 fail (`roles.spec` link-redirect-403) is **flaky** — passes 3/3 in isolation, unrelated to cycle-4 (backend/CSV) changes. Authoritative check: CI E2E job on the pushed SHA. |
| Docker / PostgreSQL | — | ⛔ BLOCKED (no local Docker) → CI Docker job |

---

# Cycle 5 — v1.1.17 final quality freeze

Second re-audit of the shipped `v1.1.16`. Scope: fix concrete defects, add regression
tests at every layer, reconcile docs to actual behaviour, prepare (not publish) `v1.1.17`.
Work is confined to `dev`; **no merge/tag/Release/installer** without owner approval.

## Baseline (recorded before any change)

| Ref | SHA |
|---|---|
| `dev` (after safe `merge --ff-only origin/main`) | `22f5ce0603043c3df455d980bd746037d7511008` |
| `main` | `22f5ce0603043c3df455d980bd746037d7511008` |
| `v1.1.16` (annotated tag to commit `22f5ce0`) | tag `6fa7860a4c0dff8cc0ca6338ec2206d7bb7200ac` |

Branch state at start: `main` was one merge-commit ahead of `dev` with an identical tree;
`dev` fast-forwarded to `main` (no history rewrite). Baseline suites (v1.1.16): backend
**1235** pytest, frontend **532** Vitest; README snapshot was stale at **1217 / v1.1.15**.

## Defects (reproduced, then fixed)

1. **P1 — silent non-persistence on call update.** `CallDrawer.jsx` sends `patient_id` and
   `date_of_call` on update; the `PUT /api/calls/<id>` `EDITABLE` list omitted both, so the
   loop that applies fields silently dropped them — 200 returned, `to_dict()` echoed the
   *old* values, the reload showed no change. Root cause: the update allowlist was never
   extended when the drawer began sending these fields.
   Fix (`routes/call_routes.py`): add `patient_id` + `date_of_call` to `EDITABLE`; apply the
   same strict ISO validation to `date_of_call` on update as on create (`2026-02-30`,
   `2026-13-45`, `not-a-date`, `0000-00-00`, `2026-00-10`, `10/31/2026`, `2026-8-1` reject
   with 400; empty/`null` mean dateless, consistent with create); validate `patient_id`
   existence within the caller's org (the tenant read-filter makes a foreign patient resolve
   to None so a cross-org link is refused with 400, never silently honoured), allow unlink via
   `null`/empty, run the check before any mutation so a rejected update leaves the row
   untouched. Both flow through the existing `changed`-dict audit path, and `to_dict()`
   returns the live `patient_id` + `patient_name`.

2. **P2 — desktop lockfile corruption.** `desktop/package-lock.json` had
   `@peculiar/json-schema` `"version": "1.1.16"` (a version that does not exist on npm, 404)
   while its `resolved`/`integrity` and the installed package were the real `1.1.12`.
   Root cause: a blanket version find/replace during a prior app-version bump rewrote a
   *transitive* dependency's `version` field. `--package-lock-only` would not fix it (npm
   reused the corrupt entry from the hidden `node_modules/.package-lock.json`).
   Fix: regenerate from a clean state (remove `node_modules` + `package-lock.json`, then
   `npm install`) giving `@peculiar/json-schema@1.1.12`, `npm ci` clean, 0 vulnerabilities.
   Frontend lock scanned — clean. No standalone version-bump script exists (the corruption was
   a manual replace), so the future safeguard is (a) `scripts/check-lockfiles.mjs`, a pure-Node
   guard that fails when any entry's `version` disagrees with its resolved tarball or the lock
   root disagrees with `package.json`, wired into the CI `security` job, and (b) bumping only
   via `npm version --no-git-tag-version` (root package.json + lock root metadata only).

3. **P2 — docs diverged from reality.** README test snapshot stale (`1217` / `v1.1.15`); the
   User Manual claimed "production authorization hardening ... planned as a final phase" while
   the app already ships signed HttpOnly session cookies, CSRF, server-side RBAC, tenant
   isolation, and per-device revocation (a later line in the same manual already said so).
   Fix: README updated to real counts (`1256 / 538 / 9 spec files (21 cases)`, `v1.1.17`); the
   manual Note rewritten to describe the security that exists and to state the client is never
   trusted for identity/role/org. No in-repo text falsely claims `date_of_call` update worked
   in v1.1.16; the honest v1.1.17 narrative is "completing an incomplete update contract." The
   published v1.1.16 Release is left untouched.

## Frontend/backend contract audit (systematic)

Compared every create/edit form's payload with its backend update handler. Call was the sole
silent-ignore. Verified consistent (each applies every field its form sends; several already
ISO-validate dates): Patient (`ALLOWED_FIELDS` allowlist), Employee (`apply_employee_data`
full apply), Vehicle (`incoming` full apply), Task (validates `due_date`, routes `assigned_to`
to its own endpoint), User (all fields incl. employee link), CrewUnit (full apply + shift
date/time validation). The codebase deliberately ignores *unknown* fields (allowlist) rather
than 400-ing them, because legitimate callers spread whole objects (e.g. `PatientsPage` sends
`...patient` incl. `id`/`org_id`); the defect class is a *legitimate editable* field being
dropped, which the Call fix closes.

## Tests added

- Backend `tests/test_call_update_contract.py` (21) — date_of_call persist/validate/clear/
  audit/RBAC/auth; patient_id link/change/unlink/nonexistent/cross-org-400/response summary/
  audit/rejected-leaves-unchanged.
- Frontend `src/components/dispatch/CallDrawer.test.jsx` (6) — edit-mode prefill; date + patient
  changes in payload; clear sends `patient_id: null`; backend error shown and `onSaved` not
  called; success not signalled until the API resolves.
- E2E `e2e/call-edit-persistence.spec.js` (1) — real browser session: create, edit (drawer
  payload), reload, persisted patient shown + API confirms both fields; invalid patient/date
  refused, link unchanged.
- CI: lockfile-integrity step added to the `security` job.

## Definition of Done — status

- [x] `date_of_call` persists on update (+ strict validation, dateless allowed)
- [x] `patient_id` link / change / unlink works; cross-tenant link impossible (400)
- [x] silent-ignore of legitimate editable fields removed (Call); contract audit done
- [x] backend + frontend + E2E regression tests added and green
- [x] `@peculiar/json-schema` back to `1.1.12`; `npm ci` clean from scratch; 0 vulns
- [x] version bump touches only root package.json + lock root metadata (no transitive drift)
- [x] README + User Manual reconciled to actual behaviour
- [x] Cycle 5 recorded (this section)
- [x] `v1.1.17` prepared (versions bumped); not tagged/released
- [x] coverage gates not lowered (backend 85.76% >= 80; frontend 72.65% >= gate)

## Full regression gate

| Check | Command | Result |
|---|---|---|
| Backend compileall | `python -m compileall` | PASS |
| Backend ruff | `ruff check .` | PASS (clean) |
| Backend pytest + cov | `pytest --cov=.` | PASS — 1256 passed, 85.76% (gate 80) |
| Backend pip-audit | `pip-audit -r requirements.txt` | PASS — no known vulns |
| Frontend lint | `npm run lint` | PASS (clean) |
| Frontend Vitest + cov | `npm run test:coverage` | PASS — 538 passed, 72.65% lines |
| Frontend build / audit | `npm run build` / `npm audit --omit=dev` | PASS / 0 |
| Desktop lockfile | `npm ci` + `npm ls @peculiar/json-schema` | PASS — clean, 1.1.12 |
| Desktop audit | `npm audit --omit=dev` | PASS — 0 |
| Lockfile integrity guard | `node scripts/check-lockfiles.mjs` | PASS (frontend + desktop consistent) |
| SQLite migration + drift | `flask db upgrade` + `flask db check` | PASS upgrade to `f1a2b3c4d5e6`; drift = pre-existing known `org_id` FKs (audit_log, task), no new migrations |
| Live QA smoke | `EMS_QA_BASE=... python qa_test.py` | PASS — 74/0/0 (load 180 req, 0 err, P95 309ms) |
| Stress | `EMS_QA_BASE=... python stress_test.py` | PASS — 0 errors, 132.6 req/s, P95 285ms |
| E2E (local) | `npm run test:e2e` | 20/21; the 1 fail (`roles.spec` HR home render) is a pre-existing flake — 3/3 in isolation, `retries:1` in CI absorbs it; new `call-edit-persistence` spec passes. CI E2E job authoritative. |
| PostgreSQL migration / Docker prod-stack | — | BLOCKED (Docker daemon not running locally) → CI Docker job authoritative |

Owner checklist for merge/tag/Release lives at the end of the final report; do not run automatically.
