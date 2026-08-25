# Architecture

## Stack

**Backend:** Python, Flask, Flask Blueprints, Flask-CORS, Flask-Limiter, Flask-Migrate (Alembic), SQLAlchemy, SQLite (dev).

**Frontend:** React 19, Vite 7, React Router 7 (`createHashRouter` data router), Bootstrap 5.3 (native dark mode), CSS Custom Properties design tokens, React Icons.

## Module map

```text
ems-workflow-system/
├── backend/
│   ├── app.py                            (Flask app factory, blueprint registration, default-user seeding)
│   ├── models.py                         (all SQLAlchemy models — 1,137 lines, largest backend file)
│   ├── limiter.py                        (Flask-Limiter setup)
│   ├── storage.py                        (storage-provider abstraction — Local default, S3-compatible via EMS_STORAGE=s3)
│   ├── notification_utils.py             (in-app + push notification creation, role-based + single-user delivery)
│   ├── audit_utils.py                    (global audit log writer)
│   ├── settings_utils.py                 (per-user settings blob: load/save/deep-merge)
│   ├── push_utils.py                     (Web Push / VAPID delivery)
│   ├── migrations/                       (Alembic migration files — schema is Flask-Migrate-only, see "Database" below)
│   ├── scripts/
│   │   ├── migrate_notes_to_columns.py   (one-time data migration, already run)
│   │   └── backup_db.py
│   ├── utils/
│   │   ├── employee_utils.py
│   │   └── validation_utils.py           (check_length, is_valid_date, is_valid_time, etc.)
│   └── routes/                           (one blueprint per module; identity + role come from the
│                                           shared session guard + @require_role, not per-route
│                                           header parsing — see "Authentication" below)
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
│       ├── settings_routes.py
│       └── calendar_routes.py            (read-only unified calendar events API; aggregates
│                                          Calls + DailyCrewUnits, role-filtered, per-day summaries)
│
├── frontend/
│   ├── src/
│   │   ├── api/                          (one thin fetch-wrapper module per backend blueprint)
│   │   ├── pages/                        (one file per route)
│   │   │   ├── DispatchBoardPage.jsx     (~890 lines after its component/hook split; date-mode + URL logic)
│   │   │   ├── CalendarPage.jsx          (operational calendar — month view + Day Operations drawer)
│   │   │   ├── PatientsPage.jsx          (~437 lines — thin composition root after decomposition)
│   │   │   ├── CrewPlannerPage.jsx       (1,576 lines)
│   │   │   ├── CallFormPage.jsx          (1,283 lines)
│   │   │   ├── EmployeesPage.jsx         (1,278 lines)
│   │   │   ├── UserManualPage.jsx        (1,339 lines — mostly static reference content, lower refactor priority)
│   │   │   └── CallsPage.jsx, TasksPage.jsx, PayrollPage.jsx, HomePage.jsx,
│   │   │       ComplianceDashboardPage.jsx, AuditLogPage.jsx, KioskPage.jsx,
│   │   │       UserManagementPage.jsx, NotificationSettingsPage.jsx,
│   │   │       SupervisorDashboardPage.jsx, LoginPage.jsx
│   │   ├── components/
│   │   │   ├── CallForm.jsx              (1,025 lines — Classic call intake form)
│   │   │   ├── DocumentsTab.jsx, TimePayTab.jsx, PriceCalculator.jsx, ExportButtons.jsx
│   │   │   ├── patients/                 (decomposed Patients: DetailItem, PatientFormSection,
│   │   │   │                              PatientToolbar, PatientList, PatientOverviewTab,
│   │   │   │                              PatientEditTab, PatientAlertsTab, PatientContactsTab, …)
│   │   │   ├── calendar/                 (CalendarToolbar, CalendarGrid, CalendarDayCell,
│   │   │   │                              CalendarSidebar, DayOperationsDrawer)
│   │   │   ├── dispatch/                 (StatusPill, UnitTable, UnitDetailPanel, BoardToolbar,
│   │   │   │                              OpenCallsPanel, CallDetailModal, CallDrawer, …)
│   │   │   ├── crew/                     (CrewPresetsSection, PatientOrderSection, PlannedUnitsList,
│   │   │   │                              ShiftAlertsBlock, UnassignedEmployeesCard, VehicleRegistrySection)
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

### Resolved: Patients page directory split

`frontend/src/pages/PatientsPage.jsx` used to be a thin wrapper re-exporting a
1,700-line component from `components/PatientsPage.jsx`. The decomposition is
complete: the real page now lives in `pages/PatientsPage.jsx` (~437 lines) as a
composition root, with hooks in `hooks/` and presentational pieces in
`components/patients/`. There is no longer a `components/PatientsPage.jsx`.

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
     Payroll (via employee time entries, independent of call data), Reports & analytics (shipped: /api/reports/*, /api/analytics/*)
```

Crew Planning is a parallel, connected flow: Crew Units are planned per shift date (day/night, with vehicle assignment and certification-checked staff), and the Dispatch Board is really the same units viewed operationally on the current day — crew planning and dispatch are one integrated page, not two separate systems that sync.

The **Calendar** and **Dispatch Board** are two views over the *same* records — the calendar never stores its own copy of a call or crew unit. The Calendar reads a role-filtered `GET /api/calendar/events?start=&end=` that derives events from `Call` (`scheduled_call`), `DailyCrewUnit` (`crew_shift`), `Patient`/`Employee` birthdays, employee certification expirations, `Task` due dates, and `Vehicle` compliance/maintenance dates, returning per-day operational summaries (counts + readiness). The Dispatch Board reads the operational date from the URL (`?date=&call=&unit=`) and runs in one of three **date modes** — **Planning** (future), **Live** (today), **History** (past).

**Date modes are a backend rule, not a UI affordance.** `utils/operational_dates.py` is the single source of truth: it parses/validates a local operational date, derives the mode, and exposes the guards every mutating dispatch/crew/call route calls (`require_live_date`, `prohibit_historical_mutation`, `validate_call_unit_dates`). Planning allows crew-shift editing, assignment and queue changes but no live lifecycle; Live allows everything; History is read-only — with **no** supervisor/admin override (adding one requires a dedicated reason+audit workflow). Cross-date assignment (`trip_date != shift_date`), assignment of a completed/cancelled call, and any mutation on a past board are rejected with `409`; malformed dates are rejected with `400`. Planning assignments reuse the existing `CallAssignment` model — nothing is duplicated.

`Call.trip_date` and `DailyCrewUnit.shift_date` are **local operational dates** throughout: they are never parsed as UTC, so a shift on 2026-07-14 is that calendar day for the crew working it regardless of server offset. The frontend applies the same validation meaning (`isIsoDate` round-trips through a local `Date`), and dispatch API helpers surface the backend's specific rejection reason rather than a generic failure string.

Staff Tasks, Notifications, and Settings are cross-cutting: any module can create a task or trigger a notification; every user has one settings blob (`User.settings_json`) covering notification prefs, dispatch alert thresholds, UI panel sizes, and time format.

## Operational taxonomy

`backend/utils/taxonomy.py` is the **single source of truth** for the strings
that classify employees, vehicles, daily units, patients and calls. It is
published at `GET /api/taxonomy` and mirrored (display layer only) by
`frontend/src/utils/taxonomy.js`. Before it existed the same vocabulary was
re-declared in half a dozen components, which is how the database acquired `bls`
alongside `BLS`, `BARI` alongside `Bariatric`, and `emergency` stored as a
*service level*.

Four vocabularies that are deliberately distinct:

| Vocabulary | Applies to | Note |
|---|---|---|
| Service level | `Patient.default_service_level`, `Call.service_level` | The patient value is a **preference**; the call value is the **actual requirement of that trip**. Changing a patient default never rewrites existing calls. |
| Unit type | `DailyCrewUnit.unit_type` | How a crew is deployed for a day |
| Vehicle capability | `Vehicle.unit_type` (single-value today) | Real multi-capability support arrives with Fleet Management |
| Qualification | `Employee.role` | What the person is qualified to do |

**Qualification ≠ shift role.** The role an employee works on a given shift comes
from the `DailyCrewUnit` slot they occupy (`driver_id` / `medical_id` /
`assist1_id` / `assist2_id`), so a Paramedic can be rostered as Driver.
`Employee.role` currently mixes qualification (EMT, Paramedic) with an
administrative role (Supervisor); the normalizer interprets both, and splitting
the column is a future migration.

Normalization happens **on write**. Values that cannot be resolved are preserved
verbatim and surfaced as "Unknown" — never silently rewritten or blanked. Legacy
cleanup is a deliberate CLI (`flask normalize-taxonomy`, dry run by default), not
an implicit side effect.

## Entity Workspace routes

Complex entities get a full page with a canonical URL rather than an
ever-growing drawer (see [UI_STANDARD.md](UI_STANDARD.md) for the decision
rules). `components/workspace/EntityWorkspace.jsx` provides the shared shell:
URL-synced tabs (`?tab=`), back-to-list that restores the list's filters,
loading/error/not-found/permission states, and unsaved-changes protection.

```text
/fleet/vehicles            list (filters/search live in the URL)
/fleet/vehicles/:vehicleId workspace  <- reference implementation
```

Planned next: `/employees/:employeeId`, `/patients/:patientId`. Drawers remain
for quick peek / short create-edit forms.

## Authentication

**Session-cookie authentication.** `POST /api/auth/login` verifies the password and
starts a **server-side session**; identity lives in a signed, `HttpOnly`,
`SameSite=Lax` cookie (signed with `SECRET_KEY`) and the API reads the user from the
session alone — never from a client header. The old `X-User-*` trust headers are
gone and inert. The session id is regenerated on login (fixation defence), each
login is registered in a `UserSession` row so a device can be revoked server-side,
and the user is re-validated against the DB every request (a disable/delete/role
change takes effect on the next call).

Every `/api/` route is **default-deny**: the guard (`register_api_auth_guard`)
requires a session unless the endpoint is on a small, tested `PUBLIC_ENDPOINTS`
allowlist (login, health, the kiosk PIN), so a new route is protected by omission.
Role checks go through a shared `@require_role(...)` decorator. **CSRF:** a
per-session token is delivered in a JS-readable cookie and must be echoed in an
`X-CSRF-Token` header on every mutation (a fetch interceptor does this in the SPA).
A password policy (complexity, optional expiry, no-reuse history) and rate limiting
on login and the kiosk PIN complete the picture. See the README Security Note and
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Database & migrations

- SQLite for local development. `db.create_all()` is intentionally disabled — the schema is managed **entirely** through Flask-Migrate/Alembic. Running the app against a fresh database without first running `flask --app app db upgrade` fails with `no such table: ...` errors; this is expected, not a bug (see Quick Start in the README).
- PostgreSQL is **supported for production** (see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) and the production Docker stack) — no model changes are required, since everything goes through the SQLAlchemy abstraction; point `DATABASE_URL` at `postgresql+psycopg://…`. `scripts/copy_sqlite_to_postgres.py` carries existing data over.
- Demo users (`admin`, `supervisor`, `dispatcher`, `hr`) are **never** seeded automatically — importing or serving the app has no DB side effects. They are created explicitly by the `flask --app app seed-demo` / `seed-demo-data` CLI commands, for local/demo use only.
- Performance indexes (17 total, added in migration `a1b2c3d4e5f7`) cover the hot query paths: `call` (trip_date, status, patient_id), `patient` (last_name, dob), `call_assignment` (unit_id, call_id, is_active), `daily_crew_unit` (shift_date), `user_notification` (user_id, is_read), `notification_event` (created_at), `time_entry` (employee_id), `audit_log` (entity_type, timestamp), `employee_document` (employee_id, expiry_date).

## Multi-tenancy foundation

An `Organization` model (id, name, slug, is_active, settings_json) exists and a nullable `org_id` foreign key is on every tenant-scoped table (the 14 models in `models.ORG_SCOPED_MODELS`). A default organization is created and all existing rows backfilled by migration; new rows are stamped with the caller's org.

**Runtime tenant isolation is active.** It is enforced globally at the ORM layer (`tenant.py`): a `do_orm_execute` hook filters every SELECT of an org-owned model by the caller's `org_id`, and a `before_flush` hook stamps `org_id` on new rows — so no per-route query change is needed and a missed filter cannot leak. The current org is set by the auth guard from the session (multi-tenant v2 also resolves it from the request subdomain via `utils/tenant_host.py`); with no org context (CLI, seeding, tests) the hooks are inert. A platform super-admin (`is_platform_admin`, no org) runs a cross-org console (`/api/platform`). Cross-org isolation and the child-by-id IDOR paths are pinned by `test_tenant_isolation.py`.

## UI architecture

See [UI_STANDARD.md](UI_STANDARD.md) for the full pattern reference (EntityDrawer usage, cards-vs-tables, toast/confirm rules, per-module conventions, design tokens). In short: every create/edit/view flow uses the shared `EntityDrawer` component (never a full-page form or inline expand/collapse), destructive actions use `ConfirmDialog`, and all colors come from `--ems-*` CSS custom properties defined in `frontend/src/styles/theme.css`.
