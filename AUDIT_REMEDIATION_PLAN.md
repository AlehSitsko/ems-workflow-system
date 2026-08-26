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
| 3 | P1 | Synchronize documentation with actual `dev` state | ✅ COMPLETED | Docs honestly describe current `dev`; counts are snapshotted/commit-pinned; no code/CI contradictions. |
| 4 | P1 | Add backend quality gate (Ruff lint + format check) | ✅ COMPLETED | Reproducible backend lint/format check passes locally and in CI; dev-only deps. |
| 5 | P1 | Add measurable test coverage (pytest-cov + Vitest V8) with CI gate | ✅ COMPLETED | CI fails on significant coverage drop; report reproducible locally. |
| 6 | P1 | Dependency & supply-chain security (pip-audit, npm audit, Dependabot, SBOM) | ✅ COMPLETED | Reproducible audit in CI; no unexplained critical/high vulns. |
| 7 | P1 | Audit suppressed exceptions / silent failures | ✅ COMPLETED | Important failures diagnosable; security-sensitive paths fail closed; best-effort ops don't break requests; no PHI/secrets in logs. |
| 8 | P2 | Refactor largest frontend files (CrewPlanner, CallForm(Page), DispatchBoard, Tasks, Calls) | TODO | Files simpler, behavior unchanged, tests + build pass. |
| 9 | P2 | Extract backend service layer (calls, dispatch, calendar, patients, tasks) | TODO | Business logic testable off-HTTP; routes thinner; no regressions. |
| 10 | P2 | Dead code & repo cleanliness (proven-dead only) | ✅ COMPLETED | Only proven-dead removed; `.gitignore` correct; builds/tests pass. |
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

### Item #7 (P1) — suppressed-exceptions audit — ✅ COMPLETED

Reviewed every broad/silent handler in the named risk areas and decided per case:

- **Security paths already correct (no change):** `core/security/crypto.py` decrypt and
  `core/security/keyring.py` unwrap both **fail closed** — they re-raise as
  `DecryptionError` / `KeyManagementError` with generic messages, and log **no** ciphertext,
  keys, or plaintext. Confirmed and documented as verified-good.
- **`events.py` / `storage.py`:** their broad catches already carry `# noqa: BLE001` with a
  reason and `logger.warning(..., exc_info=True)` — legitimate best-effort. No change.
- **Narrowed over-broad catches (were hiding unrelated bugs):** `settings_utils.load_user_settings`
  (3×) and `notification_utils._get_user_prefs` JSON parses `except Exception` →
  `except (json.JSONDecodeError, TypeError)`; calendar reminder date parses `except Exception`
  → `except ValueError` / `(ValueError, AttributeError)`.
- **Made silent best-effort blocks diagnosable (still non-fatal):** the 6 `except Exception: pass`
  in `notification_utils.py` and the one in `routes/document_routes.py` now `logger.debug(..., exc_info=True)`.
  Best-effort notification/push failures still never break the originating request.
- **`routes/reports_routes.py`:** no broad catches — clean.
- **Logging is PHI/secret-safe:** every added log carries an **id only** (user id / document id),
  never blob contents, keys, ciphertext, or request bodies; a test asserts the corrupt-blob log
  does not echo the blob.
- **Tests added:** `backend/tests/test_settings_utils.py` — corrupt `settings_json` falls back to
  defaults + logs (id only, no contents); a valid partial blob merges over defaults.
- **Verification:** `ruff check .` clean; the 2 new tests pass; full backend suite re-run below.
- **Files:** `settings_utils.py`, `notification_utils.py`, `routes/document_routes.py`,
  `backend/tests/test_settings_utils.py`.

### Item #6 (P1) — dependency & supply-chain security — ✅ COMPLETED

- **Current state — clean:** `npm audit` (frontend + desktop, prod and all) → **0 vulnerabilities**;
  `pip-audit` on `requirements.txt`, `requirements-dev.txt`, `requirements-prod.txt`,
  `requirements-desktop.txt` → **no known vulnerabilities**.
- **Dependabot already comprehensive** (from the earlier audit): 7 ecosystems — pip `/backend`,
  npm `/frontend` + `/desktop`, docker `/backend` + `/frontend` + `/`, github-actions `/` — all
  targeting `dev`. Two Dependabot PRs (`pip`, `npm`) are currently open on `dev`; left for
  individual test-verified review (the rule is: never bulk-update).
- **Added a CI `security` job:** `pip-audit` on backend runtime + dev requirements (strict — the
  runtime is what ships), and `npm audit --omit=dev --audit-level=high` on the frontend and
  desktop production deps. `pip-audit==2.10.1` pinned in `requirements-dev.txt` for local repro.
- **SBOM: deferred (optional).** The task gates it on "reasonable complexity"; the audit tooling
  above plus Dependabot already covers the supply-chain surface. SBOM generation (cyclonedx) is a
  documented nice-to-have, not blocking.
- **Requirements split verified:** `requirements.txt` (runtime) ← `requirements-prod.txt`,
  `requirements-desktop.txt` (both `-r requirements.txt` + their server), `requirements-dev.txt`
  (`-r requirements.txt` + pytest/fakeredis/ruff/pip-audit). Prod/desktop never pull the test/lint
  toolchain.
- **Files:** `.github/workflows/ci.yml`, `backend/requirements-dev.txt`, `docs/TESTING.md`.

### Item #3 (P1) — documentation sync — ✅ COMPLETED

Fixed concrete drift against current `dev` (commit-pinned/snapshot-labelled, not frozen constants):

- **Stale test counts:** `README.md` (backend 1009→1066, frontend 458→461), `docs/TESTING.md`
  (458/52 → 461/53, snapshot `1211e31`), `docs/INFRASTRUCTURE_REPORT.md` (1009→1066, 458→461).
  E2E "8 spec files / 20 cases" was already correct.
- **Stale plaintext-DOB index (the task-flagged one):** `docs/ARCHITECTURE.md` listed
  `patient (last_name, dob)` as a performance index. `dob` is encrypted and deliberately not
  indexed in plaintext — reworded to name the blind index `dob_bidx` (search/dedup) and derived
  `dob_month_day` (calendar), consistent with the item #1 stress-test fix.
- **Prod stack described as future:** `docs/DEVELOPMENT_WORKFLOW.md` said "A future Postgres
  deployment would carry the constraints natively" — PostgreSQL is the implemented production DB
  (`docker-compose.prod.yml`, CI prod smoke), so reworded to present tense.
- **CI job list:** `docs/TESTING.md` "four jobs" → six (backend+ruff, frontend, e2e, docker,
  desktop, security) — updated as part of items #4/#6.
- **Verified honest, left as-is:** `TODO.md` (active backlog only; correctly documents the
  intentional plaintext `last_name`/`first_name`/addresses decisions), `PRODUCTION_READINESS.md`
  (accurate encryption-verification claims), and historical `COMPLETED_BLOCKS.md` entries.
- **Files:** `README.md`, `docs/TESTING.md`, `docs/INFRASTRUCTURE_REPORT.md`, `docs/ARCHITECTURE.md`,
  `docs/DEVELOPMENT_WORKFLOW.md`.

### Item #5 (P1) — measurable coverage with a ratchet gate — ✅ COMPLETED

- **Backend baseline 81.3%** (branch coverage; `pytest-cov`). Gate: `fail_under = 80` in
  `backend/.coveragerc` (ratchet just below baseline). `source = .`, omitting deps, tests,
  generated migrations, the disposable QA/E2E/desktop entry servers, and one-off scripts —
  each omission justified in the config. `pytest-cov==7.1.0` added to `requirements-dev.txt`.
- **Frontend baseline 68.5% lines / 60.7% branches** (`@vitest/coverage-v8`). Gate thresholds
  in `vite.config.js`: lines 67, statements 64, functions 60, branches 59. Uses V8's default
  include (the unit-tested surface): the large page components are covered by Playwright E2E,
  not Vitest, so forcing them in would report 0% and understate coverage — documented, not faked.
- **Ratchet, not fake-high:** thresholds sit just below the real baselines (prevent a drop),
  never an artificial 95–100%. Lowest-covered backend modules (audit/settings/events routes,
  push_utils, employee_shifts) recorded as the next targets rather than hidden by exclusions.
- **CI:** Backend job runs `pytest --cov` (honours `fail_under`); Frontend job runs
  `npm run test:coverage`. Coverage artifacts git-ignored (`.coverage`, `coverage/`), configs tracked.
- **Verification:** frontend `test:coverage` passes at the thresholds (exit 0, 68.5% lines);
  backend full `--cov` run measured 81.3% > 80 gate.
- **Files:** `backend/.coveragerc`, `backend/requirements-dev.txt`, `frontend/vite.config.js`,
  `frontend/package.json`, `frontend/package-lock.json`, `.github/workflows/ci.yml`, `.gitignore`,
  `docs/TESTING.md`.

### Item #10 (P2) — dead code & repo cleanliness — ✅ COMPLETED

- **Repo cleanliness — clean.** No stray artifacts tracked: no `.log`/`.sqlite`/`.env`/`dist`/
  `build`(py)/`.coverage`/`node_modules`/`__pycache__`. `desktop/build/{icon.ico,icon.png,installer.nsh}`
  are electron-builder **source** resources (kept); `docs/screenshots/*`, `docs/workflow.gif`, and
  `frontend/scripts/capture-screenshots.mjs` are documentation assets/tooling (kept). `.gitignore`
  gained the coverage-artifact rules in item #5.
- **Python:** ruff already removed the genuinely-unused imports (item #4). Vulture ≥90% hits are the
  usual SQLAlchemy/Flask event-listener callback args (false positives) plus one unused optional
  param `db_session` on `load_user_settings` — kept for call-site API compatibility.
- **JS:** one orphan candidate, `components/patients/DetailItem.jsx` (0 imports). **Kept, not removed:**
  it is documented in `docs/UI_STANDARD.md` as the standard component for labelled key-value pairs —
  documented use, so it fails the removal criteria. The real bug was the doc referencing a sibling
  `DetailGrid` that **never existed anywhere in the repo**; fixed `UI_STANDARD.md` to point only at
  the real `DetailItem`. Demonstrates the "don't delete merely-unused code" discipline.
- **Net:** nothing provably-dead this round (the earlier audit already removed `migrate.py` and
  `PatientOverviewTab.jsx`); one stale doc reference fixed.
- **Files:** `docs/UI_STANDARD.md`.
