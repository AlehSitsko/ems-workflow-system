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
* **Dispatch Board** — open calls, drag-and-drop assignment, unit status lifecycle with timestamps, return rides, cancel/reopen, priority queue, overdue/stuck alerts
* **Patients** — operational records, dispatch comments, transport instructions, alerts, contacts, soft archive
* **Crew Planner** — daily units, day/night shifts, shift duration & delay alerts, vehicle registry, certification-checked crew validation
* **Employees / HR** — records, certifications, document management with expiry tracking, compliance dashboard
* **Time / Payroll** — kiosk clock-in/out, time entries, pay periods, FLSA overtime, CSV/Gusto/ADP export
* **Tasks** — staff task assignment, comments, activity log, role-scoped permissions, creator/assigner-only closing
* **Notifications** — in-app bell, per-user preferences, browser push (VAPID)
* **Audit Log** — global action logging across every module
* **Settings** — server-side per-user preferences (time format, notification prefs, dispatch thresholds, panel layout)
* **UI System** — consistent sidebar/topbar layout, dark/light theme tokens, standardized drawer/modal/toast patterns (see [docs/UI_STANDARD.md](docs/UI_STANDARD.md))

For the full history of what shipped and when, see [docs/COMPLETED_BLOCKS.md](docs/COMPLETED_BLOCKS.md).

## Screenshots

*(placeholder — screenshots and a workflow GIF are tracked in [docs/ROADMAP.md](docs/ROADMAP.md), Priority 5)*

## Tech Stack

**Frontend:** React 19, Vite, React Router (HashRouter), Bootstrap 5.3 (native dark mode), CSS Custom Properties design tokens, React Icons.

**Backend:** Python, Flask, Flask Blueprints, Flask-CORS, Flask-Limiter, Flask-Migrate (Alembic), SQLAlchemy.

**Database:** SQLite (current, local development). PostgreSQL planned for production — see [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).

Full module map and data flow: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick Start

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
flask --app app db upgrade
python app.py
```

Backend runs on `http://127.0.0.1:5050`.

`db.create_all()` is intentionally disabled — the schema is managed entirely through Flask-Migrate. Running against a fresh/empty database **without** first running `flask --app app db upgrade` fails with errors like `no such table: user`. Always migrate before the first run.

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
python qa_test.py       # functional/integration checks (needs the backend running)
python stress_test.py   # load test (needs the backend running)
```

See [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) for the full pre-commit checklist and [docs/TESTING.md](docs/TESTING.md) for what these scripts do and don't cover.

## Demo Users / Demo Mode

Seeded automatically on first successful backend startup (skipped if a username already exists):

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
├── docs/          Architecture, API reference, roadmap, testing, production readiness, UI standard
├── qa_test.py     Functional/integration test script
├── stress_test.py Load test script
└── TODO.md        Actionable near-term backlog
```

Full breakdown: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Current Status

Stable. All core modules (Call Intake, Dispatch Board, Patients, Crew Planner, Vehicle Registry, Employees/HR, Time & Payroll, Staff Tasks, Notifications, Audit Log, Settings, Supervisor Dashboard) are implemented and passing the current QA suite (`qa_test.py`: 104/104, 0 failures). The project is currently in a documentation/stabilization pass — see [docs/ROADMAP.md](docs/ROADMAP.md) Priority 0 for what that covers.

Full changelog: [docs/COMPLETED_BLOCKS.md](docs/COMPLETED_BLOCKS.md).

## Roadmap

Organized by priority (documentation & stabilization → codebase maintainability → UI consistency → testing → operations features → portfolio polish → production hardening), not chronological "block" numbers. Full detail, including corrections made to previously-inaccurate planned-vs-shipped claims: [docs/ROADMAP.md](docs/ROADMAP.md).

Near-term actionable items: [TODO.md](TODO.md).

## Known Limitations

* Current authentication is simplified for development and demo use.
* Tenant schema/foundation exists (`Organization` model, `org_id` columns), but full tenant activation and isolation hardening is deferred.
* SQLite is used for local development and is not intended for concurrent production dispatch usage.
* The system does not include full clinical ePCR, NEMSIS export, insurance claims processing, or live GPS routing.
* Some large frontend modules (`DispatchBoardPage.jsx` in particular) are scheduled for refactoring — see [docs/ROADMAP.md](docs/ROADMAP.md) Priority 1.
* There is no unit test framework yet — current test coverage is two integration/load scripts run against a live server. See [docs/TESTING.md](docs/TESTING.md).
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
