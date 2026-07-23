# EMS Workflow System

**Developer:** [alehsitsko.dev](https://alehsitsko.dev)

## Portfolio Summary

EMS Workflow System is a full-stack React + Flask application built from real EMS dispatch and operations experience. It demonstrates operational workflow design, role-based interfaces, dispatch assignment logic, patient operational records, HR document tracking, payroll support, notifications, audit logging, and production-readiness planning.

## Overview

A lightweight EMS/NEMT operations management platform focused on call intake, dispatch workflow, crew planning, patient operational records, HR/staff management, time/payroll support, tasks, notifications, audit logging, and supervisor oversight.

It is not intended to replace primary dispatch software, CAD systems, EMR systems, clinical documentation systems, or billing platforms — see [Current Scope](#current-scope) below for the precise boundary.

## Current Scope

**In scope:**

* EMS/NEMT operations workflow
* Call intake (Classic and Guided modes)
* Live dispatch board with drag-and-drop assignment
* Patient operational records (not clinical documentation)
* Crew planning (day/night shifts, vehicle registry, shift timing)
* Employee/HR records and certification tracking
* Time tracking and payroll support (FLSA overtime, CSV/Gusto/ADP export)
* Staff task assignment and tracking
* In-app notifications (bell + browser push)
* Audit logging
* Per-user settings
* Supervisor oversight and analytics

**Not in current scope:**

* Full clinical ePCR
* NEMSIS / state submission
* Insurance claims processing
* HIPAA-grade production deployment
* Live GPS / routing
* Monitor integration
* Hospital EMR integration

## This System Is

* An EMS/NEMT operations workflow platform
* A dispatcher support platform
* A patient lookup and call intake tool
* A staff management platform
* An HR document management platform
* A crew planning platform (day and night shifts)
* A live dispatch board platform
* A time tracking and payroll support platform
* A supervisor analytics platform

## This System Is Not

* A replacement for primary dispatch software
* A CAD platform
* An EMR platform
* A hospital management system
* A clinical documentation system
* A full billing system

## Feature Highlights

* **Call Intake** — Classic and Guided modes, patient lookup with duplicate prevention, quality scoring, price calculator
* **Dispatch Board** — open calls, drag-and-drop assignment, unit status lifecycle with timestamps, return rides, cancel/reopen, priority queue, overdue/stuck alerts. Reads `?date=` and runs in **Planning / Live / History** modes, enforced **on the backend** (`409`), not just by disabled buttons: Planning (future) allows crew shifts + assignment + queue but no live lifecycle; Live (today) allows everything; History (past) is read-only. Cross-date assignment and past assignment are rejected; board dates must be real calendar dates
* **Calendar** — read-only operational calendar that aggregates existing records (never a duplicate store): month view with per-day readiness, weekend + US federal holidays, a Day Operations drawer, and one-click "Open Day in Dispatch Board". Sources: scheduled calls, crew shifts, patient & employee birthdays, certification expirations, task due dates, and vehicle compliance/maintenance dates. Role-filtered on the backend (HR gets crew-only, no PHI; dispatcher sees certifications without employee names), with per-user display settings
* **Patients** — operational records, dispatch comments, transport instructions, alerts, contacts, soft archive
* **Crew Planner** — daily units, day/night shifts, shift duration & delay alerts, certification-checked crew validation
* **Fleet** — the physical vehicles, separate from the daily crew units that use them: `/fleet/vehicles` list plus a full Vehicle Workspace (`/fleet/vehicles/:id`) with Overview, Compliance and Activity. Admin/supervisor manage, dispatchers get read-only availability, HR has no access
* **Employees / HR** — the Employees hub gathers the Directory, Compliance, Leave and Payroll; an employee's own page is a workspace with Overview, Qualifications, Documents, Time & Pay, Tasks, Schedule, Activity and Leave tabs, each backed by a real endpoint and deep-linkable via `?tab=`
* **Time / Payroll** — kiosk clock-in/out, time entries, pay periods, FLSA overtime, CSV/Gusto/ADP export
* **Tasks** — staff task assignment, comments, activity log, role-scoped permissions, creator/assigner-only closing
* **Notifications** — in-app bell, per-user preferences, browser push (VAPID)
* **Audit Log** — global action logging across every module
* **Settings** — server-side per-user preferences (time format, notification prefs, dispatch thresholds, panel layout)
* **UI System** — two-level role-filtered navigation from one config, consistent sidebar/topbar layout, dark/light theme tokens, standardized drawer/modal/toast patterns (see [docs/UI_STANDARD.md](docs/UI_STANDARD.md) and Navigation & Information Architecture below)

For the full history of what shipped and when, see [docs/COMPLETED_BLOCKS.md](docs/COMPLETED_BLOCKS.md).

## Navigation & Information Architecture

The sidebar is two levels deep. Related pages are grouped into **hubs** — a hub is
a disclosure control, not a route, so every page keeps its own URL and can still
be opened directly or bookmarked.

```text
Dashboard
OPERATIONS      Dispatch Board · Calls & Scheduling ▾ · Day Closeout · Calendar
RESOURCES       Patients · Fleet & Crews ▾
WORKFORCE       Employees ▾ · Tasks
MANAGEMENT      Supervisor Dashboard
ADMINISTRATION  Users · Audit Log · Settings
HELP            Kiosk · User Manual
```

Hubs and their pages:

| Hub | Pages | Routes |
|---|---|---|
| **Calls & Scheduling** | All Calls, Scheduling Inbox, Recurring Trips, Confirmations | `/calls`, `/scheduling-inbox`, `/recurring-trips`, `/confirmation-round` |
| **Fleet & Crews** | Crew Planner, Vehicles | `/crew-planner`, `/fleet/vehicles` |
| **Employees** | Directory, Compliance, Leave, Payroll | `/employees`, `/compliance`, `/leave`, `/payroll` |

**One source of truth.** `frontend/src/config/routeMetadata.js` holds both the
per-route metadata (title, subtitle, icon, permission, width) and `NAV_SECTIONS`,
the menu's shape. The shape references routes by path only — labels, icons and
permissions are always read back from the route entry, so the sidebar, the
dashboard's quick links, the module tabs and the command palette cannot disagree
about what a page is called or who may open it.

**Filtering cascades.** A hub whose every child is denied disappears; a section
left with no items disappears with it, so no role sees a heading over nothing. A
hub reduced to a single permitted child collapses into a plain link — the same
rule for every hub and every role.

**Global quick actions.** Taking a call is an action rather than a place: it has
no menu entry. **Start Taking Call** sits in the header on every page, the
dashboard carries the same action as its primary CTA, and **New Call** appears
beside the Calls & Scheduling tabs. The route (`/call-form`) and its permission
are unchanged, and both Classic and Guided intake modes are untouched.

**Menu visibility is not security.** `canAccess` decides what is *shown*. Route
guards in `App.jsx` and the API's own role checks are the boundary — see
`backend/utils/auth_utils.py` and `backend/tests/test_security.py`.

## Screenshots

*(placeholder — screenshots and a workflow GIF are tracked in [docs/ROADMAP.md](docs/ROADMAP.md), Priority 5)*

## Tech Stack

**Frontend:** React 19, Vite, React Router (HashRouter), Bootstrap 5.3 (native dark mode), CSS Custom Properties design tokens, React Icons.

**Backend:** Python, Flask, Flask Blueprints, Flask-CORS, Flask-Limiter, Flask-Migrate (Alembic), SQLAlchemy.

**Database:** SQLite (current, local development). PostgreSQL planned for production — see [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).

Full module map and data flow: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick Start

### Docker (everything at once)

```bash
docker compose up --build
```

Frontend on <http://127.0.0.1:5173/ems-workflow-system/>, backend on
<http://127.0.0.1:5050>. Migrations run on startup; demo users are seeded only
when you ask (`docker compose exec backend flask --app app seed-demo`).
Development environment only — see [docs/DOCKER.md](docs/DOCKER.md).

To run the two services directly instead:


### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
flask --app app db upgrade    # build the schema (Flask auto-detects the create_app factory)
flask --app app seed-demo     # create demo users (idempotent; local/demo only)
python app.py                 # dev server on http://127.0.0.1:5050
```

The backend uses a Flask **application factory** (`create_app` in `app.py`).
Importing it has no side effects — it does not open the database or seed data.
The schema is managed entirely through Flask-Migrate; a fresh database **must**
be migrated (`flask --app app db upgrade`) before first run, or you'll see
errors like `no such table: user`. Demo users are created **only** by the
explicit `seed-demo` command, never on normal startup.

### Frontend

```powershell
cd frontend
npm install
npm run dev      # dev server, http://localhost:5173
npm run lint      # ESLint
npm run build     # production build
```

### Tests

```powershell
# Backend — 206 isolated pytest tests (in-memory SQLite, no server needed)
cd backend; pytest -v

# Frontend — 127 Vitest tests (utilities + component tests)
cd frontend; npm test

# Live QA (optional) — needs the backend running; use a DISPOSABLE database
python qa_test.py       # functional/integration checks
python stress_test.py   # local load smoke (not a production benchmark)
```

CI (`.github/workflows/ci.yml`) runs the backend and frontend checks on every PR
and push to `dev`/`main`. See [docs/TESTING.md](docs/TESTING.md) for coverage
detail and the disposable-database rule for the live scripts, and
[docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) for the pre-commit
checklist.

## Demo Users / Demo Mode

Created by `flask --app app seed-demo` (idempotent — existing usernames are
skipped). **Not** seeded on normal startup. For local/demo use only:

| Username | Password | Role |
|---|---|---|
| admin | admin | admin |
| supervisor | supervisor | supervisor |
| dispatcher | dispatcher | dispatcher |
| hr | hr | hr |

## Project Structure

```text
ems-workflow-system/
├── backend/       Flask app, models, Alembic migrations, one blueprint per module
├── frontend/      React + Vite app — pages, components, api/ wrappers, context, hooks
├── docs/          Architecture, API reference, roadmap, testing, Docker, production readiness, UI standard
├── docker-compose.yml  Reproducible dev environment (development only)
├── qa_test.py     Functional/integration test script
├── stress_test.py Load test script
└── TODO.md        Actionable near-term backlog
```

Full breakdown: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Current Status

Stable. All core modules (Call Intake, Dispatch Board, Calendar, Patients, Crew Planner, Fleet/Vehicles, Employees/HR, Time & Payroll, Staff Tasks, Notifications, Audit Log, Settings, Supervisor Dashboard) are implemented. Automated coverage: **206 backend pytest tests + 127 frontend Vitest tests**, plus the live `qa_test.py` smoke suite (104 checks). The project is in a stabilization pass — see Current Development Direction below.

Full changelog: [docs/COMPLETED_BLOCKS.md](docs/COMPLETED_BLOCKS.md).

## Current Development Direction

Sequential phases — each starts only after the previous one lands. Full detail in
[docs/ROADMAP.md](docs/ROADMAP.md); near-term items in [TODO.md](TODO.md).

**Current — stabilization** (mostly done): application factory, explicit demo
seeding, CI, Patients & Payroll tests, frontend test foundation, and the
in-progress PatientsPage decomposition.

**Current — operational Calendar (in progress):** the Calendar foundation and the
first Calendar ↔ Dispatch integration slice have **shipped** — a role-filtered
`GET /api/calendar/events` API, a month view with per-day readiness, a Day
Operations drawer, and Planning/Live/History date modes on the Dispatch Board.
Remaining Calendar work: more event sources (birthdays, certifications, task
deadlines, vehicle dates), Week/Agenda views, and saved filters.

**Next — infrastructure (planned):** a Docker development environment — backend
and frontend Dockerfiles, Docker Compose, a named SQLite volume, health checks,
and a reproducible setup. *Docker is planned, not yet implemented, and a Docker
development environment does not make the project production-ready.*

## Known Limitations

* Current authentication is intentionally simplified for development and demo use, not an oversight — see Security Note below.
* Multi-tenancy exists as a schema foundation only (`Organization` model, nullable `org_id` columns) — the organization table isn't seeded, no row has an `org_id`, and runtime tenant isolation is not active. Full activation is deferred to the production hardening phase.
* SQLite is used for local development and is not intended for concurrent production dispatch usage.
* The system does not include full clinical ePCR, NEMSIS export, insurance claims processing, or live GPS routing.
* Docker is **planned, not implemented** — see Current Development Direction above. The operational Calendar is implemented for calls + crew shifts; additional event sources (birthdays, certifications, tasks, vehicles) and Week/Agenda views are still to come.
* Calendar readiness uses only reliably-computable conflicts today; shift time-overlap double-booking and vehicle out-of-service checks are deferred (see [TODO.md](TODO.md) → Tech debt / follow-ups).
* Test coverage is 206 backend pytest + 127 frontend Vitest tests plus live QA scripts (`qa_test.py`, 104 checks); some domains (crew, notifications) still have isolated coverage only through the live `qa_test.py` script. See [docs/TESTING.md](docs/TESTING.md).
* Some production-readiness tasks are intentionally deferred until the feature set stabilizes — see [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).

## Security Note

Current authentication is intentionally simplified for local development and demo testing. Production-ready authentication is planned as a final hardening phase and will include JWT or session-based authentication, backend role enforcement, tenant-safe queries, refresh/session handling, and protected API routes. See [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) for the full plan.

## Documentation

* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — module map, data flow, auth state, database/migration notes, multi-tenancy foundation
* [docs/API.md](docs/API.md) — full backend API endpoint reference
* [docs/ROADMAP.md](docs/ROADMAP.md) — prioritized roadmap (P0–P6)
* [docs/TESTING.md](docs/TESTING.md) — current test coverage and test roadmap
* [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) — production hardening plan
* [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) — branch strategy, pre-commit checklist, manual verification checklist
* [docs/UI_STANDARD.md](docs/UI_STANDARD.md) — UI patterns and design tokens
* [docs/COMPLETED_BLOCKS.md](docs/COMPLETED_BLOCKS.md) — full changelog
* [TODO.md](TODO.md) — actionable near-term backlog

## Author

Created by Aleh Sitsko.
Built from real EMS dispatch experience.
