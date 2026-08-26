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

### `[ ]` Stage 2 — Release desync (P0) — PREPARE ONLY (publish blocked, rule 11)
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

### `[ ]` Stage 5 — Backend tests for risky zones (P1)
- **Approach:** target genuinely-weak zones by *current* coverage (measured in Stage 0, not the old
  list). Priority: time & payroll → documents → tenant isolation → notifications/push → patients →
  crews. Real-risk cases (RBAC, tenant isolation, invalid input, date/time edges, idempotency,
  rollback, no sensitive-data leakage), not mechanical 100%.

### `[ ]` Stage 6 — Frontend tests for weak components (P1)
- **Verified:** `TimeInput.jsx` (no test), `NotificationBell.jsx` (no test), `CallCard.jsx` (the
  open/unassigned card — the old audit's "UnassignedCallCard" no longer exists; `AssignedCallCard`
  already tested), and several `api/` wrappers (own logic: URL/CSRF/error-normalization). Add
  targeted component/integration tests.

### `[ ]` Stage 7 — Flaky/slow `sharedComponents.test.jsx` (P2)
- **Verified exists:** `src/components/ui/sharedComponents.test.jsx`. Investigate root cause (timers,
  cleanup, shared state, waitFor) by repeated/isolated/randomized runs; fix the cause, not the global
  timeout.

### `[!] ` Stage 8 — Reproducible PostgreSQL benchmark (P2) — BLOCKED (no local Docker/Postgres)
- **Plan:** author a reproducible benchmark script + documented method (seed, dataset ≥500/100/300,
  scenarios, ≥3 reps, warm-up, metrics) that runs where Docker/Postgres is available; do not claim
  scalability from a single local SQLite run. Actual Postgres run is BLOCKED locally.

### `[ ]` Stage 9 — Safe decomposition of large files (P2)
- **Approach:** assess each candidate (size/responsibilities/duplication/testability); refactor only
  where clearly beneficial, behaviour-preserving, with characterization tests first. Priority:
  CrewPlannerPage, DispatchBoardPage, call_routes, patient_routes. `UserManualPage` (static) only if
  it truly helps.

### `[ ]` Stage 10 — Dead code & repo cleanliness (P2)
- **Approach:** re-scan for unused imports/components/utils, console.log/print, stray artifacts;
  prove non-use (refs, dynamic imports, routes, tests, CI, desktop/PyInstaller) before removing.

### `[ ]` Stage 11 — Full final regression (P0)
- Backend: ruff, compileall, pytest+coverage, migration upgrade (clean + seeded DB), dependency
  audit. Frontend: lint, Vitest+coverage, build, npm audit. E2E Playwright. Live QA + stress.
  Docker/prod-stack: BLOCKED locally → rely on CI at the final SHA.

### `[ ]` Stage 12 — Final report + PR (P0)
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
  open/unassigned card is `CallCard.jsx`; will test that instead.
