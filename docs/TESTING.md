# Testing

## Honest current state

**Backend unit tests exist now, covering authentication and Task Management.** `backend/tests/test_auth.py` and `backend/tests/test_tasks.py` run under `pytest` against an in-memory SQLite database — no live server, no dev database touched. Everything else is still only covered by two standalone Python scripts that exercise the API against a **live running backend**:

- `qa_test.py` — functional/integration test script
- `stress_test.py` — load/performance test script

There is still no frontend test framework — no vitest/jest, `frontend/package.json` has no `test` script at all.

`qa_test.py`/`stress_test.py` need the backend already running (`python app.py` from `backend/`) and hit `http://127.0.0.1:5050` directly over HTTP. They are not isolated unit tests: they create real rows in the dev SQLite database (and clean most of them up afterward), and a failure in one section can occasionally cascade into an unrelated one if cleanup didn't run. Treat them as smoke/regression scripts — the pytest suite is where isolated, DB-free-of-side-effects coverage belongs going forward. See Priority 3 in [ROADMAP.md](ROADMAP.md) for the rest of the plan.

## Running the pytest suite

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pytest -v
```

No running server or dev database needed — `backend/conftest.py` points `SQLALCHEMY_DATABASE_URI` at `sqlite:///:memory:` via the `DATABASE_URL` env var (the app itself defaults to the real `sqlite:///database.db` when that env var isn't set, so this has zero effect on `python app.py`) and creates/drops the schema fresh around each test. Rate limiting is disabled per-test (`RATELIMIT_ENABLED=False`) so repeated login attempts across tests don't trip Flask-Limiter.

Add new test modules under `backend/tests/`; the `app`, `client`, and `db_session` fixtures in `backend/conftest.py` are available to all of them without extra imports.

## Running the current test scripts

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python app.py                  # in one terminal, from backend/
```

```powershell
cd ..                          # back to the repo root
python qa_test.py               # functional QA
python stress_test.py           # concurrent load test
```

Also useful before either of the above:

```powershell
python -m compileall backend qa_test.py stress_test.py   # syntax check, no server needed
```

## What `qa_test.py` covers

10 sections, run in order against the live backend, with cleanup at the end:

1. **Vehicles** — CRUD + edge cases
2. **Crew Units** — shift timing, midnight crossover, validation
3. **Shift Alerts** — near-end/overdue alert logic
4. **Dispatch Board** — board data propagation, concurrent request handling
5. **Notifications** — bell system, prefs, role-based visibility
6. **Data Integrity** — rollback behavior, no partial writes on invalid input
7. **Load Test** — baseline concurrent read/write benchmark (lighter than `stress_test.py`)
8. **Edge Cases** — boundary inputs, SQL injection safety, malformed query params
9. **Patient Module** — duplicate prevention, archive/restore, alerts, contacts
10. **Task Management** — full CRUD, role permission matrix, close-permission enforcement, comments, activity log

Expected result: **0 failed, 0 warnings**. If you see failures, read the printed reason for each — the script labels every assertion, so a failure points at exactly what broke.

## What `stress_test.py` covers

Seeds a larger dataset (500 patients, 300 calls, 100 employees by default) and then runs:

- Single-threaded read benchmarks (patients/calls/dispatch board list endpoints)
- Write benchmarks (create patient/call, update patient)
- N+1 query detection (via response-time scaling across dataset sizes)
- Pagination benchmarks
- Concurrent load (20 workers × 10 requests)
- Dispatch board polling load (10 concurrent dispatchers × 15 polls)
- Notification polling stress (15 users polling for 10s)
- DB index recommendation check
- DB file fragmentation stats

Expected result: no errors under concurrent load, no 500 responses, dispatch board polling completes cleanly.

## What's missing

- **Auth and Task Management are covered by pytest; everything else isn't.** Payroll overtime, crew units, dispatch, and patients still only run in isolation from a live server + real SQLite file via `qa_test.py`. A change to, say, the payroll overtime calculation can only be verified today by running the full server and either clicking through the UI or waiting for `qa_test.py`'s (currently thin) payroll coverage.
- **No frontend tests at all** — no component tests, no smoke tests, nothing. Every frontend change is verified manually.
- **No tenant isolation tests**, which matters because `org_id` exists on every tenant-scoped table but nothing filters by it yet (see [ARCHITECTURE.md](ARCHITECTURE.md#multi-tenancy-foundation)). Before that filtering is turned on, a test proving cross-tenant leakage is impossible should exist first.

## Test roadmap (see [ROADMAP.md](ROADMAP.md) Priority 3 for full detail)

In rough order:

1. ~~Add `pytest` + an in-memory/test-only SQLite DB (not the dev database) as the actual unit test foundation~~ — done: `backend/conftest.py` + `backend/tests/test_auth.py`
2. ~~Role permission tests for Task Management, ported from `qa_test.py`'s live assertions~~ — done: `backend/tests/test_tasks.py` (31 tests: CRUD, close-permission workflow, comments/activity, list/filter, dispatcher + HR permission matrices, archive workflow)
3. Payroll/overtime edge-case tests (week boundaries, ISO week math)
4. Patient duplicate-prevention tests (exact match, near-match should-not-dedupe, archived-match)
5. Tenant isolation tests, written before tenant-scoped query filtering is turned on
6. Dispatch assignment conflict tests, once that feature (Priority 4) is built
7. A frontend test runner (vitest is the natural fit for this Vite project) with smoke tests for: login, create call, assign to unit, complete call
