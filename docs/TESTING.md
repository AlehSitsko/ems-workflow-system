# Testing

## Current state

Three layers of tests, in order of reliability:

1. **Backend pytest (isolated) — 89 tests.** Run under `pytest` against an
   in-memory SQLite database built by the application factory; no live server,
   no dev database touched. Domains covered:
   - `test_auth.py` (6) — login success/failure, unknown/inactive user, bad body
   - `test_tasks.py` (31) — Task Management CRUD, close-permission workflow,
     comments/activity, list/filter, dispatcher + HR permission matrices, archive
   - `test_patients.py` (30) — CRUD, duplicate detection (case/whitespace
     insensitive, incl. archived), archive/restore, alerts, contacts, JSON 404,
     audit log
   - `test_payroll.py` (22) — FLSA per-ISO-week overtime, week boundaries,
     overnight/zero/negative durations, config/rate edge cases, CSV export
2. **Frontend Vitest (isolated) — 32 tests.** Vitest + React Testing Library +
   jsdom. Utility coverage (`timeUtils`, `dispatchBoardUtils` incl.
   `getShiftAlertSeverity` with a faked clock, `licenseUtils`) plus a `StatusPill`
   component smoke test proving the RTL setup.
3. **Live QA scripts (`qa_test.py`, `stress_test.py`).** Standalone Python scripts
   that hit a **running** backend over HTTP. They create real rows and clean most
   up afterward, so they are smoke/regression tools, **not** isolated unit tests.

### Not yet covered

- Dispatch, crew units, notifications, and analytics have isolated coverage only
  through the live `qa_test.py` script, not pytest.
- Frontend component/integration coverage is minimal (one smoke test) — most UI
  changes are still verified manually. Broader component tests follow the
  PatientsPage decomposition.
- No tenant-isolation tests (`org_id` exists on tenant-scoped tables but nothing
  filters by it yet; a cross-tenant-leakage test should exist before filtering is
  turned on).

## Running backend pytest

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pytest -v
```

No server or dev database needed. `backend/conftest.py` builds a fresh app per
test via the factory (`create_app({...})`) with `SQLALCHEMY_DATABASE_URI` set to
`sqlite:///:memory:` and `RATELIMIT_ENABLED=False`, creating/dropping the schema
around each test. This is a config override — it has zero effect on `python app.py`.

Add new modules under `backend/tests/`; the `app`, `client`, and `db_session`
fixtures are available without extra imports.

## Running frontend Vitest

```powershell
cd frontend
npm test          # vitest run (one-shot, used by CI)
npm run test:watch
```

Tests live next to their targets as `*.test.js` / `*.test.jsx`; jsdom + jest-dom
matchers are wired up in `src/test/setup.js`.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and pushes to `dev`/`main`:

- **Backend job:** `pip install -r backend/requirements.txt`,
  `python -m compileall backend`, `pytest`
- **Frontend job:** `npm ci`, `npm run lint`, `npm test`, `npm run build`

The live QA scripts are **intentionally excluded** from CI — they need a running
server and write to a database, which does not belong in CI.

## Running the live QA scripts (disposable database only)

`qa_test.py` / `stress_test.py` need the backend already running and hit
`http://127.0.0.1:5050` directly. **Run them against a throwaway database, never
your primary dev database** — they create and (mostly) delete rows:

```powershell
cd backend
$env:DATABASE_URL = "sqlite:///qa_disposable.db"   # a scratch file, not database.db
.\venv\Scripts\Activate.ps1
flask --app app db upgrade                          # build the schema
flask --app app seed-demo                           # demo users for the run
python app.py                                       # leave running in this terminal
```

```powershell
cd ..
python qa_test.py       # functional QA
python stress_test.py   # concurrent load smoke
```

Syntax-check without a server:

```powershell
python -m compileall backend qa_test.py stress_test.py
```

### What `qa_test.py` covers

10 sections against the live backend, cleaned up at the end: Vehicles, Crew Units
(shift timing, midnight crossover), Shift Alerts, Dispatch Board, Notifications,
Data Integrity (rollback), a light concurrent Load Test, Edge Cases (SQL-injection
safety, malformed params), Patient Module, and Task Management.

### What `stress_test.py` covers

Seeds a larger dataset and runs read/write benchmarks, N+1 detection, pagination,
concurrent load (20 workers), dispatch-board polling, notification polling, and DB
index/fragmentation checks.

**This is a local smoke test, not a production load benchmark.** It runs against
the Flask development server and SQLite on a single machine; the throughput and
latency numbers are useful for catching regressions, not for capacity planning.
