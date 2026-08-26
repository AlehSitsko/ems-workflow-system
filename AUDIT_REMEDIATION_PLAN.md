# Audit Remediation Plan

Working journal for the post-audit technical remediation. All work happens on `dev`;
`main` is never touched directly.

## Session metadata

- **Baseline commit:** `19e7c4d` (chore(release): bump version to 1.1.10)
- **Start date:** 2026-08-25
- **Branch:** `dev`
- **`dev` vs `main`:** identical trees — `main` (`b9fc74e`) is the merge commit of this
  `dev`; `dev` has 0 commits `main` lacks except the merge commit itself. Content is in sync.
- **Open Dependabot PRs → dev (fetched, not yet handled):**
  `dependabot/npm_and_yarn/frontend/dev/...`, `dependabot/pip/backend/dev/...`.

## Baseline (Step 2)

_Recorded at baseline commit `19e7c4d`._

| Check | Result |
|---|---|
| Backend compileall (`backend qa_test.py stress_test.py qa_harness.py`) | ✅ OK |
| Backend pytest | ✅ **1063 passed** (~88s) |
| Frontend `npm ci` | ✅ OK, **0 vulnerabilities** |
| Frontend lint | ⚠️ 0 errors, **1 warning** — `App.jsx:396` `useMemo` missing deps (→ item #2) |
| Frontend unit tests (Vitest) | ✅ **461 passed** / 53 files |
| Frontend build | ✅ OK |
| Playwright E2E (`--list`) | ✅ **20 tests in 8 files** (disposable-backend config; prod-smoke excluded) |
| Live QA (`qa_test.py`) | ✅ **74 passed, 0 failed, 0 warnings**; load 180 req, 0 errors, P95 295ms, 107 req/s |
| Stress test (`stress_test.py`) | ⚠️ **false `MISSING INDEX: patient.dob`** (→ item #1, P0); throughput 148 req/s, P95 237ms, 0 errors, no slow reads |
| Docker compose config / prod smoke | ⛔ **BLOCKED** — Docker not available in this environment (`docker version` empty). CI covers it on GitHub runners. |

Baseline verdict: green except one false-positive stress warning (item #1) and one lint warning (item #2) — both real work items below, neither a functional defect.

## Work items

Legend: **P0** critical · **P1** high · **P2** medium · **P3** low.
Status: `TODO` · `IN PROGRESS` · `BLOCKED` · `COMPLETED`.

| # | Pri | Item | Status | Done-when |
|---|-----|------|--------|-----------|
| 1 | P0 | Fix false stress-test "MISSING INDEX: patient.dob" (blind-index arch) | ✅ COMPLETED | Stress report no longer demands a plaintext DOB index and confirms `dob_bidx`/`dob_month_day`. |
| 2 | P1 | Resolve React Hooks `useMemo` warning in `App.jsx` | ✅ COMPLETED | `npm run lint` clean (0 errors/warnings); all FE tests pass; auth/password-expired/platform-admin/route flows intact. |
| 3 | P1 | Synchronize documentation with actual `dev` state | TODO | Docs honestly describe current `dev`; counts are snapshotted/commit-pinned; no code/CI contradictions. |
| 4 | P1 | Add backend quality gate (Ruff lint + format check) | ✅ COMPLETED | Reproducible backend lint/format check passes locally and in CI; dev-only deps. |
| 5 | P1 | Add measurable test coverage (pytest-cov + Vitest V8) with CI gate | TODO | CI fails on significant coverage drop; report reproducible locally. |
| 6 | P1 | Dependency & supply-chain security (pip-audit, npm audit, Dependabot, SBOM) | TODO | Reproducible audit in CI; no unexplained critical/high vulns. |
| 7 | P1 | Audit suppressed exceptions / silent failures | TODO | Important failures diagnosable; security-sensitive paths fail closed; best-effort ops don't break requests; no PHI/secrets in logs. |
| 8 | P2 | Refactor largest frontend files (CrewPlanner, CallForm(Page), DispatchBoard, Tasks, Calls) | TODO | Files simpler, behavior unchanged, tests + build pass. |
| 9 | P2 | Extract backend service layer (calls, dispatch, calendar, patients, tasks) | TODO | Business logic testable off-HTTP; routes thinner; no regressions. |
| 10 | P2 | Dead code & repo cleanliness (proven-dead only) | TODO | Only proven-dead removed; `.gitignore` correct; builds/tests pass. |
| 11 | P2 | Performance & concurrency correctness | TODO | Core invariants confirmed under concurrency or honestly documented as BLOCKED. |
| 12 | P3 | Production recovery & operations (DR drill or documented runbook) | TODO | Confirmed or honestly-documented recovery procedure. |
| 13 | P3 | Final documentation & positioning honesty | TODO | No false compliance/scale/PHI/recovery claims; README complete. |

## Progress log

### Item #1 (P0) — stress-test false DOB-index warning — ✅ COMPLETED

- **Root cause:** `stress_test.py` `run_index_analysis()` had a hardcoded critical-index
  list expecting `("patient", "dob")`. `patient.dob` is encrypted at rest (Text, no
  plaintext index by design). Verified in `backend/models/patient.py`: `dob` is Text with
  no index; `dob_bidx` (String(64), `index=True`) backs exact search + duplicate detection;
  `dob_month_day` (String(5), `index=True`) backs the birthday calendar.
- **Change (minimal):** replaced `("patient","dob")` with `("patient","dob_bidx")` and
  `("patient","dob_month_day")` in the expected list, with a comment explaining the
  blind-index architecture; made `run_index_analysis()` return `missing` for testability.
- **Test added:** `backend/tests/test_stress_index_analysis.py` builds the real schema into
  a throwaway SQLite file, runs the analyzer, asserts `missing == []`. Guards against
  regressing to a plaintext-DOB expectation (that would report missing and fail). Passes.
- **SQLite/Postgres:** the analyzer is SQLite-only (reads `sqlite_master`/PRAGMA) and guarded
  to run only against the disposable QA DB; the same indexes exist on Postgres via the models'
  `index=True`, so no conflict.
- **Verification:** new test passes; full `stress_test.py` run now prints `OK patient.dob_bidx`
  and `OK patient.dob_month_day`, and no `MISSING INDEX`. Perf unchanged (148 req/s, P95 237ms,
  0 errors, no slow reads).
- **Files:** `stress_test.py`, `backend/tests/test_stress_index_analysis.py`.

### Item #2 (P1) — React Hooks `useMemo` warning in `App.jsx` — ✅ COMPLETED

- **Root cause:** the 12 route guards (`ProtectedLayout`, `PortalRoute`, `LoginRoute`, and
  9 access guards) were defined **inside** `App`, so they were new identities every render.
  The `router = useMemo(..., [currentUser])` referenced them but couldn't list them —
  listing them would rebuild the router every render (defeating the stable-instance point
  that `useBlocker` relies on); omitting them is the `exhaustive-deps` warning. It was also
  a define-a-component-in-render anti-pattern.
- **Fix (no rule disable):** moved all guards to **module scope** (stable identities) and had
  them read `currentUser` + `onLogout` from a small `GuardContext` that `App` provides, so
  the router config is unchanged (lowest routing risk). Stabilised `handleLogin`/`handleLogout`
  with `useCallback`, so the honest deps are now `[currentUser, handleLogin]` and the router
  still rebuilds only when the user changes. Also consolidated the 8 identical ops-guards into
  one `OpsGuard(allow=…)` — a behaviour-identical de-duplication.
- **Behaviour preserved:** login, logout, relogin, password-expired, platform-admin console,
  employee-portal split, every role redirect and 403, deep links.
- **Verification:** `npm run lint` clean (0 errors, **0 warnings**); Vitest 461 passed; build OK;
  **Playwright E2E 20/20** — incl. `roles.spec.js` (HR→Dispatch denied via missing link +
  URL redirect + API 403; dispatcher→Users denied; admin reaches both), sign-in, relogin
  persistence, deep links.
- **Files:** `frontend/src/App.jsx`.

### Item #4 (P1) — backend quality gate (Ruff) — ✅ COMPLETED

- **Scope decision:** correctness lint only — `select = ["F", "E9"]` (pyflakes + syntax).
  `ruff format` would rewrite **162 of 171 files** with zero behaviour change, so formatting
  and import-reordering enforcement are **deliberately deferred** (documented) to honour the
  "no huge mechanical reformat" rule. Package `__init__.py` `F401` is exempt (intentional
  re-exports). Config in `backend/ruff.toml`.
- **Findings fixed (60):** 55 auto-fixed (unused imports `F401`, redundant redefinitions
  `F811`) + 5 manual `F841` unused variables. Real prod dead code removed: unused `import redis`
  in `events.py._listen` (uses `self._redis`), unused `joinedload` import in
  `calendar_event_routes.py` (the `.joinedload()` chain is a method, not the symbol), unused
  imports in `employee_routes.py`/`notification_routes.py`/`org_security_routes.py`, and a dead
  `data = request.get_json()` read in `mark_all_read` (user id comes from the session). Test
  `F841`s kept the side-effecting call and dropped the unused name only.
- **Caught a real regression mid-fix:** an over-broad `sed` deleted 3 *used* `data` reads;
  the new ruff gate flagged them as `F821` undefined-name — proof the gate works — and I
  restored + redid the edit precisely.
- **Wired in:** `ruff==0.16.4` in `requirements-dev.txt` (dev-only); a `ruff check .` step in
  the CI `Backend` job (job **name unchanged** so branch-protection required checks still match);
  `docs/TESTING.md` documents the gate and the format-scope decision.
- **Verification:** `ruff check .` → **All checks passed**; full backend suite **1064 passed**.
- **Files:** `backend/ruff.toml`, `backend/requirements-dev.txt`, `.github/workflows/ci.yml`,
  `docs/TESTING.md`, `backend/events.py`, `backend/routes/{notification,employee,calendar_event,org_security}_routes.py`,
  `backend/scripts/{migrate_notes_to_columns,prod_realtime_smoke}.py`, ~15 `backend/tests/*.py`.
