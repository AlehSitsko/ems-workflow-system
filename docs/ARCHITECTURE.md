# Architecture

## Stack

**Backend:** Python, Flask, Flask Blueprints, Flask-CORS, Flask-Limiter, Flask-Migrate (Alembic), SQLAlchemy, SQLite (dev).

**Frontend:** React 19, Vite, React Router (HashRouter), Bootstrap 5.3 (native dark mode), CSS Custom Properties design tokens, React Icons.

## Module map

```text
ems-workflow-system/
├── backend/
│   ├── app.py                            (Flask app factory, blueprint registration, default-user seeding)
│   ├── models.py                         (all SQLAlchemy models — 1,137 lines, largest backend file)
│   ├── limiter.py                        (Flask-Limiter setup)
│   ├── storage.py                        (file storage abstraction — local filesystem now, S3-ready)
│   ├── notification_utils.py             (in-app + push notification creation, role-based + single-user delivery)
│   ├── audit_utils.py                    (global audit log writer)
│   ├── settings_utils.py                 (per-user settings blob: load/save/deep-merge)
│   ├── push_utils.py                     (Web Push / VAPID delivery)
│   ├── migrate.py                        (CLI helper)
│   ├── migrations/                       (Alembic migration files — schema is Flask-Migrate-only, see "Database" below)
│   ├── scripts/
│   │   ├── migrate_notes_to_columns.py   (one-time data migration, already run)
│   │   └── backup_db.py
│   ├── utils/
│   │   ├── employee_utils.py
│   │   └── validation_utils.py           (check_length, is_valid_date, is_valid_time, etc.)
│   └── routes/                           (one blueprint per module; each duplicates its own small
│                                           X-User-Id/X-User-Role header-parsing helpers rather than
│                                           sharing one — see "Authentication" below for why)
│       ├── auth_routes.py                (login, user CRUD)
│       ├── employee_routes.py
│       ├── crew_routes.py                (crew units + shift alert computation)
│       ├── crew_preset_routes.py
│       ├── vehicle_routes.py
│       ├── patient_routes.py             (largest route file, 637 lines — patients, alerts, contacts)
│       ├── call_routes.py
│       ├── dispatch_routes.py            (assignment, unit status, call ordering)
│       ├── analytics_routes.py           (supervisor dashboard aggregates)
│       ├── notification_routes.py
│       ├── time_routes.py                (time entries, pay config)
│       ├── payroll_routes.py             (pay periods, CSV/Gusto/ADP export)
│       ├── document_routes.py            (HR document upload/preview/compliance)
│       ├── task_routes.py                (Staff Tasks module — second-largest route file, 616 lines)
│       ├── audit_routes.py
│       └── settings_routes.py
│
├── frontend/
│   ├── src/
│   │   ├── api/                          (one thin fetch-wrapper module per backend blueprint)
│   │   ├── pages/                        (one file per route — see "Known inconsistency" below)
│   │   │   ├── DispatchBoardPage.jsx     (2,461 lines — largest frontend file by far; refactor plan in ROADMAP.md)
│   │   │   ├── CrewPlannerPage.jsx       (1,576 lines)
│   │   │   ├── CallFormPage.jsx          (1,283 lines)
│   │   │   ├── EmployeesPage.jsx         (1,278 lines)
│   │   │   ├── UserManualPage.jsx        (1,339 lines — mostly static reference content, lower refactor priority)
│   │   │   ├── CallsPage.jsx, TasksPage.jsx, PayrollPage.jsx, HomePage.jsx,
│   │   │   │   ComplianceDashboardPage.jsx, AuditLogPage.jsx, KioskPage.jsx,
│   │   │   │   UserManagementPage.jsx, NotificationSettingsPage.jsx,
│   │   │   │   SupervisorDashboardPage.jsx, LoginPage.jsx
│   │   │   └── PatientsPage.jsx          (10-line wrapper — see "Known inconsistency" below)
│   │   ├── components/
│   │   │   ├── PatientsPage.jsx          (1,747 lines — the *real* Patients page component; see below)
│   │   │   ├── CallForm.jsx              (1,025 lines — Classic call intake form)
│   │   │   ├── DocumentsTab.jsx, TimePayTab.jsx, PriceCalculator.jsx, ExportButtons.jsx
│   │   │   ├── crew/                     (CrewPresetsSection, PatientOrderSection, PlannedUnitsList,
│   │   │   │                              ShiftAlertsBlock, UnassignedEmployeesCard, VehicleRegistrySection)
│   │   │   ├── dispatch/CallDrawer.jsx
│   │   │   ├── settings/                 (TimeFormatSettings, BrowserNotificationSettings,
│   │   │   │                              NotificationTypeSettings, DispatchVisualAlertsSettings)
│   │   │   ├── layout/                   (AppLayout, Topbar, Sidebar, NotificationBell, navigationConfig)
│   │   │   └── ui/                       (EntityDrawer, ConfirmDialog, ToastProvider, TimeInput —
│   │   │                                   see docs/UI_STANDARD.md for usage rules)
│   │   ├── context/                      (ThemeContext, UserSettingsContext)
│   │   ├── hooks/                        (useNotifications, usePushNotifications)
│   │   ├── utils/                        (callUtils, employeeRoleUtils, timeUtils)
│   │   ├── styles/theme.css              (all `--ems-*` design tokens, light + dark)
│   │   ├── App.jsx                       (routes, lazy-loading, role-gated route wrappers)
│   │   └── App.css
│   ├── package.json
│   └── vite.config.js
│
├── qa_test.py                            (integration/functional test script — see docs/TESTING.md)
├── stress_test.py                        (load test script — see docs/TESTING.md)
└── docs/                                 (this file, API.md, ROADMAP.md, TESTING.md,
                                            PRODUCTION_READINESS.md, DEVELOPMENT_WORKFLOW.md,
                                            COMPLETED_BLOCKS.md, UI_STANDARD.md)
```

### Known inconsistency: Patients page split across two directories

`frontend/src/pages/PatientsPage.jsx` is a 10-line wrapper that re-exports the real component from `frontend/src/components/PatientsPage.jsx` (1,747 lines) — every other route renders its page component directly from `pages/`. Harmless today, tracked as a cleanup item in [ROADMAP.md](ROADMAP.md) (Priority 1).

## Data flow

The core operational loop:

```text
Call Intake (Classic or Guided form)
  → Patient lookup / duplicate-prevention / auto-create
  → Call record created (status: new)
  → Dispatch Board: call appears in Open Calls
  → Drag-and-drop assignment to a Crew Unit
  → Unit status lifecycle (en route → on scene → transporting → at destination → completed)
       — each transition writes a lifecycle timestamp on the Call record
  → Call completion or cancellation (mandatory reason)
  → Data available to: Supervisor Dashboard (aggregates), Audit Log (every mutating action),
     Payroll (via employee time entries, independent of call data), Reports (planned, see ROADMAP.md)
```

Crew Planning is a parallel, connected flow: Crew Units are planned per shift date (day/night, with vehicle assignment and certification-checked staff), and the Dispatch Board is really the same units viewed operationally on the current day — crew planning and dispatch are one integrated page, not two separate systems that sync.

Staff Tasks, Notifications, and Settings are cross-cutting: any module can create a task or trigger a notification; every user has one settings blob (`User.settings_json`) covering notification prefs, dispatch alert thresholds, UI panel sizes, and time format.

## Authentication

**Current state (intentional MVP, not an oversight):** header-based pseudo-auth. The frontend stores the logged-in user in `localStorage` after `POST /api/auth/login` and sends `X-User-Id` / `X-User-Role` / `X-User-Name` headers on subsequent requests; each route blueprint reads and trusts these headers directly (no JWT, no server-side session, no signed token). Role checks are inline per-route (`if role not in (...): return 403`), duplicated across files rather than centralized in a decorator.

This is a deliberate choice for local development and demo/portfolio use, not accidental weakness — see the Security Note in the main README and [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for the planned final hardening phase (JWT/session auth, centralized role decorators, protected-route audit). One defensive measure already in place: routes that write a header-supplied user id into a foreign-key column first verify the user actually exists (`_verified_user_id()` in `task_routes.py`, equivalent validation in `auth_routes.py`'s `update_user`) — added during the post-QA fix-pass after a stale/invalid `X-User-Id` caused `sqlite3.IntegrityError` crashes.

## Database & migrations

- SQLite for local development. `db.create_all()` is intentionally disabled — the schema is managed **entirely** through Flask-Migrate/Alembic. Running the app against a fresh database without first running `flask --app app db upgrade` fails with `no such table: ...` errors; this is expected, not a bug (see Quick Start in the README).
- PostgreSQL is planned for production (see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)) — no model changes are required, since everything already goes through the SQLAlchemy abstraction; only `SQLALCHEMY_DATABASE_URI` and a data-migration script are needed.
- Default demo users (`admin`, `supervisor`, `dispatcher`, `hr` — all `username`/`username` passwords) are seeded automatically on first successful startup by `create_default_users()` in `app.py`, skipped if a username already exists.
- Performance indexes (17 total, added in migration `a1b2c3d4e5f7`) cover the hot query paths: `call` (trip_date, status, patient_id), `patient` (last_name, dob), `call_assignment` (unit_id, call_id, is_active), `daily_crew_unit` (shift_date), `user_notification` (user_id, is_read), `notification_event` (created_at), `time_entry` (employee_id), `audit_log` (entity_type, timestamp), `employee_document` (employee_id, expiry_date).

## Multi-tenancy foundation

An `Organization` model (id, name, slug, is_active, settings_json) exists, and a nullable `org_id` foreign key has been added to every tenant-scoped table (`User`, `Employee`, `Patient`, `Call`, `DailyCrewUnit`, `PayPeriod`, `EmployeeDocument`, `TimeEntry`, and others). The `organization` table is not seeded — there is no default-organization creation logic anywhere in `app.py` (only demo users are seeded on first startup), and no row's `org_id` is backfilled.

**This is a schema foundation only — runtime tenant isolation is not active.** No query in the codebase currently filters by `org_id`. Full organization seeding, tenant resolution (subdomain routing → `g.current_org`), `org_id` backfill, tenant-safe query enforcement, and a superadmin UI are all deferred to the production hardening phase — see [ROADMAP.md](ROADMAP.md) Priority 6 and [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md). Enabling tenant-scoped queries without first adding the isolation tests described in [ROADMAP.md](ROADMAP.md) Priority 3 would risk shipping a cross-tenant data leak.

## UI architecture

See [UI_STANDARD.md](UI_STANDARD.md) for the full pattern reference (EntityDrawer usage, cards-vs-tables, toast/confirm rules, per-module conventions, design tokens). In short: every create/edit/view flow uses the shared `EntityDrawer` component (never a full-page form or inline expand/collapse), destructive actions use `ConfirmDialog`, and all colors come from `--ems-*` CSS custom properties defined in `frontend/src/styles/theme.css`.
