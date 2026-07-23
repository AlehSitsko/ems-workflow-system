# Testing

## Current state

Three layers of tests, in order of reliability:

1. **Backend pytest (isolated) — 206 tests.** Run under `pytest` against an
   in-memory SQLite database built by the application factory; no live server,
   no dev database touched. Domains covered:
   - `test_auth.py` (6) — login success/failure, unknown/inactive user, bad body
   - `test_tasks.py` (37) — Task Management CRUD, close-permission workflow,
     comments/activity, list/filter, dispatcher + HR permission matrices, archive,
     **participants + assign-to-all visibility**
   - `test_patients.py` (30) — CRUD, duplicate detection (case/whitespace
     insensitive, incl. archived), archive/restore, alerts, contacts, JSON 404,
     audit log
   - `test_payroll.py` (22) — FLSA per-ISO-week overtime, week boundaries,
     overnight/zero/negative durations, config/rate edge cases, CSV export
   - `test_calendar.py` (30) — calendar events API (range validation, calls/crew
     in range, cancelled/completed, assignment info, day-summary counts &
     readiness, ALS-on-BLS critical, role filtering, HR-no-PHI, stable contract;
     **overlay sources** — patient/employee birthdays incl. year-independent
     recurrence, certification name-hiding for dispatcher, task visibility,
     vehicle events, `otherEventsCount`) **and** a smoke check of the Dispatch
     date-mode guard
   - `test_date_modes.py` (22) — backend enforcement of Planning/Live/History,
     driven through the API (never via the UI): `operational_dates` helper units
     (impossible dates, leap day, mode classification); board date validation
     (`400` for 2026-99-99 / 2026-02-30, `200` for 2028-02-29); assignment rules
     (past rejected, cross-date rejected, future planning allowed,
     completed/cancelled call not assignable); live-only lifecycle (future/past
     complete + reopen rejected, past unassign/queue/status rejected); crew shift
     + pickup-time history guards; and a full **Live workflow regression** proving
     assign → status → queue → pickup-time → complete → reopen → unassign still
     works today
   - `test_taxonomy.py` (43) — canonical vocabulary + normalization against the
     legacy values actually found in the database (`bls`/`als` casing, `BARI`,
     `BLS4`); `emergency` rejected as a service level; qualification vs
     administrative role; shift role derived from the crew slot; the published
     `GET /api/taxonomy` contract matching the module; and the cleanup CLIs —
     `normalize-taxonomy` (canonicalizes, never rewrites an unresolved value,
     dry run writes nothing) and `migrate-emergency-service-level` (moves
     `emergency` to `call_type` only when the slot is free, **never** overwriting
     an existing type such as `return`)
   - `test_fleet.py` (16) — Fleet permission matrix (dispatcher read-only, HR
     `403`, unknown role `403`), taxonomy-on-write (`BARI` → `Bariatric`,
     invalid type `400`), and the audit trail behind the Workspace Activity tab
2. **Frontend Vitest (isolated) — 127 tests.** Vitest + React Testing Library +
   jsdom. Utility coverage (`timeUtils`, `dispatchBoardUtils` incl.
   `getShiftAlertSeverity` with a faked clock, date-mode helpers + timezone-safe
   `addDays` month/year/leap boundaries, `licenseUtils`, `holidayUtils`,
   `calendarUtils`, `calendarLinks`, `taxonomy` mirror) plus component tests
   (`StatusPill`, `CalendarDayCell`, `DayOperationsDrawer`, `BoardToolbar` mode
   badge + day nav, `UnitDetailPanel` live-status gating, `TaxonomyBadges`
   accessibility — label readable without colour, unknown degrades to a neutral
   badge — and `EntityWorkspace` routing: URL-synced tabs, deep link,
   loading/error/not-found/permission states, back-to-list, unsaved-changes).
3. **Live QA scripts (`qa_test.py`, `stress_test.py`).** Standalone Python scripts
   that hit a **running** backend over HTTP. They create real rows and clean most
   up afterward, so they are smoke/regression tools, **not** isolated unit tests.

### Not yet covered

- Notifications and analytics have isolated coverage only through the live
  `qa_test.py` script, not pytest. Dispatch and crew-unit date rules are now
  covered by `test_date_modes.py` (including the live assign → complete → reopen
  → unassign loop); the remaining crew/notification happy paths still rely on
  `qa_test.py`.
- Frontend integration coverage of the full Dispatch Board page (URL param
  parsing → board load → linked selection) is exercised manually / via the
  browser preview; the unit-level pieces (mode helpers, link builder, toolbar,
  unit panel) are covered by Vitest.
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

10 sections / **104 checks** against the live backend, cleaned up at the end: Vehicles, Crew Units
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

## Navigation & role matrix

The sidebar, the dashboard quick links, the module tabs and the command palette
all read one config (`frontend/src/config/routeMetadata.js`), so the tests below
cover every navigation surface at once.

**`src/config/routeMetadata.test.js`** — the config itself:

* every nav node points at a real route (a typo fails here, not in front of a user);
* no page appears in two places;
* every visible route is reachable from the menu — this is what would catch a
  page being lost in a future regrouping;
* `/call-form` is deliberately out of the menu while keeping its route and permission;
* the top level stays short and keeps its hubs;
* role scoping, including `/audit` matching its route guard rather than the old
  wider menu entry;
* hubs and sections disappear when a role may open none of their children;
* a single-permitted-child hub collapses into a link — asserted for all four roles,
  so the rule cannot be applied inconsistently;
* `getActiveHub` resolves detail routes (`/calls/42`) through their parent.

**`src/components/layout/Sidebar.test.jsx`** — behaviour:

* sections render, and a section with nothing in it is dropped;
* a hub is a `<button>` with `aria-expanded` / `aria-controls`, not a hovered div;
* click and keyboard both open it; only one hub is open at a time;
* the hub containing the current page opens itself, including for detail routes;
* a closed hub holding the current page is marked (`contains-active`);
* collapsed rail: no `aria-expanded` for a submenu that isn't rendered — pressing
  the parent expands the sidebar instead;
* mobile drawer closes after picking a page inside a hub;
* badges: shown only where work is waiting, rolled up onto a closed hub, and
  never rendered for a queue the role cannot open.

**`src/components/layout/ModuleTabs.test.jsx`** — local navigation: tabs list the
hub's pages, each keeping its own route; the current page is marked; counts sit
on the tab that owns them; nothing renders outside a hub.

**`src/pages/HomePage.test.jsx`** — the dashboard: it is an overview rather than a
copy of the menu; counts come from the API and match it; empty queues render
nothing; today's board is counted the way the board counts it; **no board request
is made for a role without dispatch access**; the call CTA and quick links follow
the role.

### Role matrix as shipped

| Role | Sections | Top-level entries |
|---|---|---|
| admin | Operations, Resources, Workforce, Management, Administration, Help | 15 |
| supervisor | same, without Users | 14 |
| dispatcher | Operations, Resources, Workforce, Administration, Help | 11 |
| hr | Operations, Workforce, Administration, Help | 8 |

HR sees no Resources section at all (Patients, Crew Planner and Vehicles are
operational); dispatcher sees no Payroll, Compliance, Leave or Users.

### Route compatibility

The refactor changed **no route**. Hubs are grouping in the navigation config, so
every existing URL, query parameter and bookmark keeps working and no redirects
were needed. `routeMetadata.test.js` reads `App.jsx` directly and fails if the
router and the metadata drift apart in either direction.

### Accessibility checks covered by tests

`aria-expanded`, `aria-controls`, `role="group"` on submenus, accessible names for
icon-only controls (including waiting counts, e.g. "Scheduling Inbox, 3 waiting"),
keyboard operation of hub toggles, and the mobile drawer's dialog semantics and
focus handling.
