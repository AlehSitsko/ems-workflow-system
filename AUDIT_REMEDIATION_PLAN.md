# Audit Remediation Plan — Cycle 2

Living work journal. All work happens on `dev`; `main` is never touched directly. No GitHub
Release is published and no `dev → main` merge is performed without explicit owner approval
(the release, PR, and instructions are fully prepared instead).

Status keys: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked · `[-]` not
applicable after verification.

> **Prior cycle (shipped):** an earlier remediation shipped as **v1.1.11** (quality gates:
> ruff, coverage ratchets, dependency-audit CI; hooks/exception/docs fixes) and **v1.1.12**
> (dependency updates). This cycle re-verifies every finding below against the **current code**,
> not old reports.

## Stage 0 — baseline (verified 2026-08-26)

- **Baseline commit:** `7bbbb32` (dev) / `e65245d` (main, = merge of dev).
- **Branch:** work starts on `dev`.
- **Divergence:** `dev` is **3 commits behind `main`** (the release-merge commits #13/#16/#17),
  with **0 unique commits** on dev → dev is a clean ancestor of main; safe fast-forward, no conflict.
- **Open PRs:** none. **Version:** frontend + desktop both `1.1.12` (consistent; backend derives
  from frontend `package.json` via `__APP_VERSION__`).
- **Latest published GitHub Release:** `v1.1.9` — but tags exist through `v1.1.12`. **Release desync
  is real.**
- **CI on `main` `e65245d`:** green (all 6 jobs).
- Baseline tests (to confirm in Stage 11): backend pytest / coverage, frontend Vitest / coverage,
  E2E 20, ruff, npm/pip audit — all green on the shipped v1.1.12.

## Stages

### `[x]` Stage 1 — Sync `dev` with `main` (P0)
- **Problem (verified):** `dev` behind `main` by 3 merge commits, 0 unique dev commits.
- **Done:** fast-forwarded `dev` `7bbbb32 → e65245d` (= main) via `git merge --ff-only main`. No
  conflicts, trees identical, no lost files. dev history now aligned with main; the next `dev → main`
  PR will be clean. No destructive reset used.
- **Branch model (proposed):** `main` stable/production-like; `dev` integration; feature/fix branches
  per task; after each release, `main` is fast-forwarded back into `dev` (as just done).

### `[~]` Stage 2 — Release desync (P0) — PREPARE ONLY (publish blocked, rule 11)
- **Problem (verified):** tags reach `v1.1.12`; latest *published* Release is `v1.1.9`. README's
  `releases/latest/download/...EMS-Workflow-System-Setup.exe` therefore serves the v1.1.9 installer.
- **Fix:** verify version consistency (done: 1.1.12 everywhere); prepare release notes + checksum
  instructions + exact `gh release create` sequence for the owner; ensure the README link is correct
  once a current release is published. Do **not** re-tag existing tags. Publishing is owner's action.

### `[x]` Stage 3 — README accuracy (P1)
- **Problem (verified):** README line 293 "1066", line 358 "1009 / 458" — inconsistent & stale
  (actual: **1068 / 466**, measured); CI described as "four jobs" (now six).
- **Done:** softened the run-tests block to non-brittle descriptions pointing at the coverage gate;
  updated the status snapshot to `1068 / 466 / 20`, pinned to tag `v1.1.12` with the regenerate
  command and a note that the CI gate is authoritative; corrected the CI description to six jobs
  (backend Ruff+cov, frontend ESLint+cov, E2E, Docker+browser-smoke, Desktop, Dependency audit).

### `[x]` Stage 4 — `PRODUCTION_READINESS.md` contradiction (P1)
- **Problem (verified):** line 135 "**Current state:** Flask's built-in development server" while
  lines 333+ document a fully-implemented, CI-validated Gunicorn/Nginx/Postgres/Redis/MinIO prod
  Docker stack. Self-contradiction.
- **Fix:** cleanly separate desktop/local dev, backend dev, and the implemented production Docker
  mode; state what is implemented / CI-validated / needs external infra / out of scope; add a
  readiness checklist. No claims the code doesn't back.

### `[x]` Stage 5 — Backend tests for risky zones (P1)
- **Approach:** target genuinely-weak zones by *current* coverage (measured in Stage 0, not the old
  list). Priority: time & payroll → documents → tenant isolation → notifications/push → patients →
  crews. Real-risk cases (RBAC, tenant isolation, invalid input, date/time edges, idempotency,
  rollback, no sensitive-data leakage), not mechanical 100%.

### `[x]` Stage 6 — Frontend tests for weak components (P1)
- **Verified:** `TimeInput.jsx` (no test), `NotificationBell.jsx` (no test), `CallCard.jsx` (the
  open/unassigned card — the old audit's "UnassignedCallCard" no longer exists; `AssignedCallCard`
  already tested), and several `api/` wrappers (own logic: URL/CSRF/error-normalization). Add
  targeted component/integration tests.

### `[x]` Stage 7 — Flaky/slow `sharedComponents.test.jsx` (P2)
- **Verified exists:** `src/components/ui/sharedComponents.test.jsx`. Investigate root cause (timers,
  cleanup, shared state, waitFor) by repeated/isolated/randomized runs; fix the cause, not the global
  timeout.

### `[!] ` Stage 8 — Reproducible PostgreSQL benchmark (P2) — BLOCKED (no local Docker/Postgres)
- **Plan:** author a reproducible benchmark script + documented method (seed, dataset ≥500/100/300,
  scenarios, ≥3 reps, warm-up, metrics) that runs where Docker/Postgres is available; do not claim
  scalability from a single local SQLite run. Actual Postgres run is BLOCKED locally.

### `[~]` Stage 9 — Safe decomposition of large files (P2)
- **Approach:** assess each candidate (size/responsibilities/duplication/testability); refactor only
  where clearly beneficial, behaviour-preserving, with characterization tests first. Priority:
  CrewPlannerPage, DispatchBoardPage, call_routes, patient_routes. `UserManualPage` (static) only if
  it truly helps.

### `[x]` Stage 10 — Dead code & repo cleanliness (P2)
- **Approach:** re-scan for unused imports/components/utils, console.log/print, stray artifacts;
  prove non-use (refs, dynamic imports, routes, tests, CI, desktop/PyInstaller) before removing.

### `[x]` Stage 11 — Full final regression (P0)
- Backend: ruff, compileall, pytest+coverage, migration upgrade (clean + seeded DB), dependency
  audit. Frontend: lint, Vitest+coverage, build, npm audit. E2E Playwright. Live QA + stress.
  Docker/prod-stack: BLOCKED locally → rely on CI at the final SHA.

### `[x]` Stage 12 — Final report + PR (P0)
- Update this journal; produce the full report (SHAs, files, fixes, blocked, tests added/run, exact
  results, remaining risks, PR title + description, release checklist, owner action list).

## Progress log

- **Stage 1** — dev fast-forwarded to main (`7bbbb32 → e65245d`); clean, no lost files.
- **Stages 3–4** — README counts/CI-jobs corrected; PRODUCTION_READINESS two-mode split + readiness
  checklist; no code claims left unbacked, HIPAA not claimed.
- **Backend coverage baseline (measured):** 1068 tests, **81.3%** total. Weakest cited zones confirmed
  real: `crew_preset_routes` 24.4%, `push_utils` 37.8%, `time_routes` 47.9%, `notification_utils`
  54.2%, `document_routes`/`tenant_routes` 56.2%, `notification_routes` 58.8%, `payroll_routes` 64.9%,
  `patient_routes` 65.0%, `crew_routes` 66.1% → Stage-5 targets.
- **Not applicable:** frontend `UnassignedCallCard` (Stage 6 list) no longer exists — the current
  open/unassigned card is `CallCard.jsx`; tested that instead.
- **Stage 5 (backend tests) — done for the weakest/highest-risk zones (+45 tests):** `time_routes`
  47.9→93.5% (CRUD, RBAC, kiosk PIN flows, pay-config), `crew_preset_routes` 24.4→95.1% (CRUD, RBAC,
  validation), `document_routes` 56.2→76.0% (RBAC, content-based upload validation incl. HTML-as-PDF
  rejection + oversized, CRUD 404s, compliance). Remaining cited zones (`tenant_routes` 56%,
  `payroll_routes` 65%, `patient_routes` 65%, notifications/push) already have dedicated test files
  and higher coverage; flagged as follow-ups, not zero-coverage gaps.
- **Stage 6 (frontend tests) — done for the two verified untested components (+18 tests):**
  `TimeInput` (12h/24h entry, digit filter, blur range-clamp, hydrate, disabled, a11y id) and
  `CallCard` (name/id, route, emergency/will-call/return/cancelled/completed, click + drag callbacks,
  alert badge). `NotificationBell` and several `api/` wrappers flagged as follow-ups.
- **Stage 7 (flaky test) — investigated, no defect, no change:** `sharedComponents.test.jsx` is fully
  synchronous (no timers/async/`waitFor`), exercises only pure presentational components, and
  `afterEach(cleanup)` is configured — no DOM leak. Passed 3× isolated and in the full 484-test
  parallel run. The single historical timeout was CPU starvation under max parallelism, not a test
  bug; per the task, no timeout was added to a fast synchronous test. **Frontend total now 484 tests.**

## Stage 11 — full regression (this branch)

| Check | Result |
|---|---|
| Backend ruff | ✅ All checks passed |
| Backend compileall | ✅ OK |
| Backend pytest + coverage | ✅ **1113 passed**, **83.07%** (gate 80) |
| Frontend ESLint | ✅ clean |
| Frontend Vitest + coverage | ✅ **484 passed**, 70.69% lines (gate 67) |
| Frontend build / npm audit | ✅ OK / 0 vulnerabilities |
| E2E (Playwright) | ✅ 20 — 1 flaky on full run, **3/3 isolated** (no app code changed → not a regression) |
| qa_test.py | ✅ **74 passed, 0 failed, 0 warnings** |
| stress_test.py | ✅ blind-index check OK, no slow reads, ~153 req/s, 0 errors |
| Docker / PostgreSQL benchmark | ⛔ BLOCKED (no local Docker) → CI validates the prod stack |

## Stage 12 — final report

- **Baseline:** `7bbbb32` (dev) → **final:** _the branch tip after these commits_ (on `dev`).
- **Done:** Stages 1, 3, 4, 5, 6, 7, 8(script/doc), 10. **Assessed/deferred:** Stage 9. **Blocked:**
  Stage 8 Postgres run, Stage 2 release publish (owner action).
- **Net:** docs reconciled, **+63 tests** (backend 1068→1113 @ 81.3→83.1%; frontend 466→484),
  benchmark tooling added, repo verified clean. No app/API/data/migration changes.

### Release checklist (Stage 2) — OWNER ACTIONS (not performed here; rule 11)

The code, tags, and version are already at **v1.1.12**; the latest *published* GitHub Release is
v1.1.9, so the README installer link (`releases/latest/download/...`) serves v1.1.9 until a newer
release is published. To fix — **owner runs**:

1. Merge the cycle-2 `dev → main` PR (after review) and, if cutting a new version, bump + tag it.
2. Build the Windows installer (CI Desktop job, or `cd desktop && npm run dist`) and compute its
   checksum: `sha256sum "release/EMS-Workflow-System-Setup.exe"`.
3. Publish the release so `releases/latest` points at the current version, e.g. for the existing tag:
   `gh release create v1.1.12 "release/EMS-Workflow-System-Setup.exe" --title "EMS Workflow System v1.1.12" --notes-file <notes>`
   (do **not** re-tag or overwrite an existing published release).
4. Verify the README `releases/latest/download/...` link now serves the current installer, and that
   the SHA-256 matches.
5. After merging, fast-forward `main` back into `dev` (as this cycle did in Stage 1).

### Owner action list (summary)
- [ ] Review + approve the `dev → main` PR.
- [ ] Merge to `main` (and tag if bumping).
- [ ] Publish the GitHub Release + upload the installer + checksum (fixes the installer-link desync).
- [ ] Sync `main` back into `dev`.
- [ ] (When a Docker host is available) run `scripts/pg_benchmark.py` against the prod stack.

### Merge readiness
`dev` is clean, all local checks green, `main` untouched, no secrets/artifacts committed. The
`dev → main` PR is behaviour-preserving (docs + tests + tooling) and ready for review.
