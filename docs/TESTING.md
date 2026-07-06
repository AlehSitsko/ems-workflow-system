# Testing

## Honest current state

**There is no unit test framework in this project yet.** No pytest, no vitest/jest — `frontend/package.json` has no `test` script at all. What exists instead are two standalone Python scripts that exercise the API against a **live running backend**:

- `qa_test.py` — functional/integration test script
- `stress_test.py` — load/performance test script

Both need the backend already running (`python app.py` from `backend/`) and hit `http://127.0.0.1:5050` directly over HTTP. They are not isolated unit tests: they create real rows in the dev SQLite database (and clean most of them up afterward), and a failure in one section can occasionally cascade into an unrelated one if cleanup didn't run. Treat them as smoke/regression scripts, not a substitute for real test coverage — see Priority 3 in [ROADMAP.md](ROADMAP.md) for the plan to add one.

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

- **No backend unit tests.** Nothing runs in isolation from a live server + real SQLite file. A change to, say, the payroll overtime calculation can only be verified today by running the full server and either clicking through the UI or waiting for `qa_test.py`'s (currently thin) payroll coverage.
- **No frontend tests at all** — no component tests, no smoke tests, nothing. Every frontend change is verified manually.
- **No isolated permission/authorization tests.** The Task Management role matrix (admin/supervisor/hr/dispatcher × create/close/assign/view) — the most complex authorization logic in the app — is only covered by `qa_test.py`'s live assertions.
- **No tenant isolation tests**, which matters because `org_id` exists on every tenant-scoped table but nothing filters by it yet (see [ARCHITECTURE.md](ARCHITECTURE.md#multi-tenancy-foundation)). Before that filtering is turned on, a test proving cross-tenant leakage is impossible should exist first.

## Test roadmap (see [ROADMAP.md](ROADMAP.md) Priority 3 for full detail)

In rough order:

1. Add `pytest` + an in-memory/test-only SQLite DB (not the dev database) as the actual unit test foundation
2. Role permission tests for Task Management, ported from `qa_test.py`'s live assertions
3. Payroll/overtime edge-case tests (week boundaries, ISO week math)
4. Patient duplicate-prevention tests (exact match, near-match should-not-dedupe, archived-match)
5. Tenant isolation tests, written before tenant-scoped query filtering is turned on
6. Dispatch assignment conflict tests, once that feature (Priority 4) is built
7. A frontend test runner (vitest is the natural fit for this Vite project) with smoke tests for: login, create call, assign to unit, complete call
