# EMS Workflow System

## Overview

EMS Workflow System is a modular operational platform designed to support EMS and medical transportation organizations with dispatcher workflows, patient records, employee management, crew planning, dispatch board operations, time tracking, payroll management, HR document management, supervisor oversight, and structured operational record keeping.

The system is designed as an operational support platform. It is not intended to replace primary dispatch software, CAD systems, EMR systems, clinical documentation systems, or billing platforms.

## Primary Objectives

* Fast and reliable call intake
* Structured dispatcher workflows
* Guided call-taking support
* Patient record lookup and management
* Duplicate patient prevention during call intake
* Automatic patient creation during call intake when no existing patient is found
* Employee and certification management
* Daily crew planning with day and night shift support
* Crew preset workflows
* Live dispatch board with drag-and-drop assignment
* Unit status tracking and progression
* Return ride as two separate assignable trips
* Role-based access control
* Employee time tracking and kiosk clock-in/out
* Payroll period management with FLSA weekly overtime calculation
* CSV payroll export (generic, Gusto, ADP)
* HR document management with expiry tracking and in-app preview
* Supervisor analytics
* Call quality tracking
* Operational call status tracking
* Operational continuity during workflow disruptions
* Modular architecture
* In-app notification system with real-time polling
* Dark / light theme toggle in user menu
* Per-user settings system — notifications, dispatch thresholds, and UI panel sizes saved server-side per user account

The platform is intended to remain useful during normal operations, temporary software outages, communication disruptions, workflow failures, high-volume operational periods, and dispatcher training workflows.

## Technology Stack

### Frontend

* React
* Vite
* JavaScript ES6+
* React Router (HashRouter)
* React Icons
* Bootstrap 5.3 (with native dark mode via `data-bs-theme`)
* CSS Custom Properties design token system (`--ems-*` prefix)
* ThemeContext with localStorage persistence

### Backend

* Python
* Flask
* Flask Blueprints
* Flask-CORS
* Flask-Limiter (rate limiting)
* Flask-Migrate (Alembic schema migrations)
* SQLAlchemy

### Database

Current:

* SQLite

Planned:

* PostgreSQL

## Current Architecture

```text
ems-workflow-system/
├── backend/
│   ├── app.py
│   ├── models.py
│   ├── limiter.py
│   ├── storage.py                        (file storage abstraction, local → S3)
│   ├── notification_utils.py
│   ├── migrations/                       (Alembic migration files)
│   ├── routes/
│   │   ├── auth_routes.py
│   │   ├── employee_routes.py
│   │   ├── crew_routes.py
│   │   ├── crew_preset_routes.py
│   │   ├── patient_routes.py
│   │   ├── call_routes.py
│   │   ├── analytics_routes.py
│   │   ├── dispatch_routes.py
│   │   ├── notification_routes.py
│   │   ├── time_routes.py
│   │   ├── payroll_routes.py
│   │   └── document_routes.py
│   └── utils/
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── authApi.js
│   │   │   ├── callsApi.js
│   │   │   ├── crewApi.js
│   │   │   ├── crewPresetApi.js
│   │   │   ├── dispatchApi.js
│   │   │   ├── employeesApi.js
│   │   │   ├── patientsApi.js
│   │   │   ├── settingsApi.js
│   │   │   ├── timeApi.js
│   │   │   ├── payrollApi.js
│   │   │   └── documentsApi.js
│   │   ├── components/
│   │   │   ├── crew/
│   │   │   │   └── PlannedUnitsList.jsx
│   │   │   ├── TimePayTab.jsx
│   │   │   ├── DocumentsTab.jsx
│   │   │   └── layout/
│   │   │       ├── AppLayout.jsx
│   │   │       ├── Topbar.jsx
│   │   │       ├── Sidebar.jsx
│   │   │       ├── NotificationBell.jsx
│   │   │       └── navigationConfig.js
│   │   ├── context/
│   │   │   ├── ThemeContext.jsx
│   │   │   └── UserSettingsContext.jsx
│   │   ├── hooks/
│   │   │   └── useNotifications.js
│   │   ├── pages/
│   │   │   ├── HomePage.jsx
│   │   │   ├── KioskPage.jsx
│   │   │   ├── EmployeesPage.jsx
│   │   │   ├── CrewPlannerPage.jsx
│   │   │   ├── PayrollPage.jsx
│   │   │   ├── ComplianceDashboardPage.jsx
│   │   │   ├── AuditLogPage.jsx
│   │   │   ├── DispatchBoardPage.jsx
│   │   │   └── ...
│   │   ├── styles/
│   │   │   └── theme.css                 (CSS design tokens, light + dark)
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── App.css
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

## Authentication System

The application currently uses an MVP authentication system with local user records and role-aware frontend access.

### Current Roles

* admin
* supervisor
* dispatcher
* hr
* driver

### Current Features

* Login system with rate limiting (10 attempts/minute per IP)
* Role-aware navigation
* Protected frontend routes
* User management
* User activation and deactivation
* Dispatcher identity tracking
* Session persistence through local storage
* Role-based module visibility
* Link user account to employee record (for dashboard clock-in/out)

## Role Access

### Admin

Full system access.

Can access: Dashboard, Dispatch Board, Call Taking Form, Patients, Calls, Employees, Crew Planner, Payroll, Compliance Dashboard, Audit Log, Supervisor Dashboard, Users, Kiosk, Notifications, User Manual

### Supervisor

Operational and management access.

Can access: Dashboard, Dispatch Board, Call Taking Form, Patients, Calls, Employees, Crew Planner, Payroll, Compliance Dashboard, Audit Log, Supervisor Dashboard, Kiosk, Notifications, User Manual

### Dispatcher

Operational workflow access.

Can access: Dashboard, Dispatch Board, Call Taking Form, Patients, Calls, Crew Planner, Kiosk, Notifications, User Manual

Cannot access: Employees, Users, Payroll, HR-only features

### HR

Staff and crew planning access.

Can access: Dashboard, Employees, Crew Planner, Payroll, Compliance Dashboard, Kiosk, Notifications (cert_expiring, employee_added only), User Manual

Cannot access: Dispatch Board, Call Taking Form, Patients, Calls, Supervisor analytics

### Driver

Clock in/out only (via Kiosk or Dashboard widget).

## Current Modules

## Dashboard

The Dashboard is the main role-aware landing page.

Current features:

* Modern sidebar and topbar layout
* Role-specific navigation
* Quick access to available modules
* Clock In / Clock Out widget (when user account is linked to an employee record)
* Live shift timer during active clock-in
* Start Taking Call shortcut for call-taking roles
* Module cards organized by section

## Kiosk

The Kiosk is a PIN-based clock-in/out terminal that requires no login.

Current features:

* Accessible at `/kiosk` without authentication
* Employee name search and selection
* Optional PIN verification per employee
* Clock In / Clock Out with live duration display
* Auto-reset to employee select screen after 15 seconds
* Back to Dashboard button (shown only when accessed by an authenticated user)

## Dispatch Board

The Dispatch Board is the live operational dispatch interface. Crew planning, call management, and real-time dispatch are unified in a single page.

Current features:

* Date selector for viewing any shift date
* Open Calls column showing unassigned calls for the selected date
* Emergency calls section (red left border) separated from Scheduled calls
* Return ride calls displayed as two independent draggable slots (Outbound + Return)
* Calls sorted by pickup time
* Click on an open call to view full call details in a modal
* Drag-and-drop assignment from Open Calls to unit rows
* Service mismatch warning modal (ALS call on BLS unit)
* Insufficient crew warning modal with override option
* Vehicle Listing table showing all planned units for the date
* Unit type badges (ALS = blue glow, BLS = green glow)
* Unit status pills (Available, En Route, On Scene, Transporting, At Destination, Out of Service)
* Next status hint displayed on each unit row
* Crew count badge with danger color when below minimum
* Assigned call badges with +R indicator for return rides
* Completed call badges with strikethrough
* Patient queue sub-row under each unit row — shows assigned calls sorted by pickup time, derived from actual assignments (not manual entry)
* Single-click unit row to open the unit detail panel
* Double-click unit row to advance to the next operational status
* Unit detail panel with full status button controls
* Out of Service → Available dedicated button
* Assigned calls in unit panel sorted by pickup time
* First assigned call (current active trip) shows live unit status
* Queued calls show QUEUED badge instead of unit status
* Outbound and Return legs displayed separately within the unit panel
* Done button to mark a call as completed
* Completed calls displayed at bottom of unit panel with strikethrough and reduced opacity
* Unassign button to return call to Open Calls
* Reopen completed call from Done tab (restores to assigned status)
* Resizable Open Calls column via drag divider (width saved per user)
* Resizable unit detail panel via drag divider (height saved per user)
* ⊞ Reset layout button appears when panel sizes differ from defaults
* Call detail modal with sections and visual hierarchy
* Dispatch Timestamps section in call detail modal — shows dispatched / on scene / transporting / at destination / completed times with inline editing
* Call cancellation with mandatory reason field
* + New Call button — opens full call create/edit drawer directly from the board
* Edit Call button in call detail modal footer — opens call in edit drawer
* Full dark / light theme support via CSS design tokens
* Manual call priority queue: Set High Priority (⚡), move up/down (▲▼), reset to time order
* Overdue call animation: call flashes red when pickup time exceeded (threshold configurable)
* Unit stuck animation: unit status flashes red when no status change for N minutes (configurable)
* Dispatch timestamps write-once: lifecycle fields (dispatched_at etc.) never overwritten on repeated status clicks

Crew planning (integrated):

* + Day Unit and + Night Unit buttons in board header
* Edit and Delete buttons on each unit row
* Unit create/edit drawer embedded in the board — no separate Crew Planner page required
* Left panel Staff tab showing unassigned employees for the date
* Calls / Staff toggle in left panel
* Make Night flow from unit edit drawer
* All crew planner validation rules enforced inline

Operational rules enforced:

* BLS unit minimum 2 crew
* BLS-4 and BLS-6 unit minimum 4 crew
* ALS call on non-ALS unit triggers warning but allows override
* Emergency is a call priority, not a unit type
* Out of Service always returns to Available
* Return ride = two separate assignable trips
* Dispatch Board is not accessible to HR role

## Call Taking Form

The Call Taking Form supports two intake workflows.

### Classic Mode

Current features:

* Dispatcher identity from logged-in user
* Patient search and selection
* Duplicate patient prevention
* Automatic new patient creation when no existing patient is matched
* Trip details, service level, emergency level
* Return ride support with address auto-fill
* Call quality scoring
* Missing critical field detection with required explanation
* Price calculator
* Backend call persistence

### Guided Intake Mode

Current features:

* Step-by-step workflow: Patient lookup → Trip details → Review
* Patient search by date of birth, last name, and phone number
* Duplicate patient prevention
* Emergency warning at trip and review steps
* Call quality review before saving
* Backend call persistence

## Notifications

Current features:

* Bell icon in Topbar with unread badge (capped at "99+")
* Dropdown list with all unread notifications
* Per-notification: icon by type, title, body, time ago, severity color
* Click to mark individual notification as read
* Mark all read
* Polling every 10 seconds
* Role-filtered event delivery
* Per-user notification preferences (stored in unified user settings blob)

### Notification Event Types

| Type | Description | Roles |
|------|-------------|-------|
| call_unassigned_soon | Unassigned call with pickup < 30 min | admin, supervisor, dispatcher |
| call_new_today | New call created for today | admin, supervisor, dispatcher |
| call_als_on_bls | ALS call assigned to BLS unit | admin, supervisor, dispatcher |
| unit_stuck_status | Unit in same status > N min | admin, supervisor, dispatcher |
| unit_understaffed | Unit created with no crew | admin, supervisor |
| cert_expiring | Employee certification expiring | admin, supervisor, hr |
| doc_expiring | HR document expiring (90/60/30/14/7 day thresholds) | admin, supervisor, hr |
| employee_added | New employee added | admin, hr |

## Employees

Current features:

* Create, edit, delete employees
* Employee status and role tracking (EMT, Paramedic, Assist, Dispatcher, Driver, Supervisor, Manager)
* Employee number, hire date, contact info, notes
* Certification tracking (CPR, EVOC, EMT, Paramedic) with expiration dates
* Active/inactive status
* Kiosk PIN per employee
* Time & Pay tab: manual time entry, clock history, pay config (hourly rate, overtime rules)
* Documents tab: upload, view, download, and manage HR documents with expiry tracking
* Click employee card to open in edit drawer
* Card actions do not trigger drawer close

## HR Documents

Current features:

* Upload documents per employee (PDF, JPG, PNG, WEBP, DOCX — up to 10 MB)
* Document types: Driver's License, CDL, EMS License, EVOC Cert, BLS Cert, ALS Cert, Physical Exam, Employment Contract, Offer Letter, Background Check, Insurance Card, Other
* Document metadata: title, document number, issuing body, issue date, expiry date, notes
* Color-coded expiry status:
  * Green (Valid) — more than 90 days until expiry
  * Yellow (Expiring) — 30–90 days until expiry
  * Red (Expiring Soon) — 14 days or fewer until expiry
  * Dark (Expired) — past expiry date
  * Gray (No Expiry) — no expiry date set
* In-app document preview (PDF via browser viewer, images inline)
* Download to disk
* Edit document metadata after upload
* Delete document with file cleanup
* File storage abstraction (local filesystem now, S3-ready by replacing storage.py only)
* Compliance summary API endpoint (employee × doc type grid)

## Compliance Dashboard

Current features:

* Employee × document type grid view (all employees × 12 document types)
* Color-coded cell per status: ok / warning / critical / expired / missing
* Filter to show only expired and critical rows
* Click cell to open employee Documents tab
* CSV export of the full compliance grid
* Certification scan: upload a certificate image → extract type and expiry date

## Audit Log

Current features:

* Full action log: call status changes, unit assignment/removal, patient edits, manual time entries, document uploads and deletes
* Filter by entity type, user, date range
* Viewer accessible to admin and supervisor roles

## Crew Planner

Current features:

* Planning by shift date
* Create, edit, delete crew units
* Day and Night shift support (separate visual sections)
* Day unit: start time, truck, crew assignment
* Night unit: start time, end time, end date (for overnight shifts)
* Make Night button on day units to create a night crew from the existing crew
* Option to replace or keep existing night crew when converting
* Standalone night unit creation
* Unassigned employee list
* Certification validation for driver, medical, assist slots
* Patient order tracking
* Crew presets support
* Backend persistence

## Crew Presets

Current features:

* Save current crew as preset
* Apply existing preset
* Faster daily planning

## Time Tracking

Current features:

* TimeEntry model (clock_in, clock_out, break_minutes, entry_type, status)
* Kiosk clock entries (entry_type = clock)
* Manual time entries by HR/supervisor (entry_type = manual)
* Time entries default to approved status
* Time & Pay tab in employee drawer
* Dispute / clear dispute actions per entry
* Date range filter on time entry list

## Payroll

Current features:

* PayPeriod model (start_date, end_date, period_type, status, notes)
* Status workflow: open → review → approved → exported
* Edit and delete pay periods
* Per-employee summary: regular hours, OT hours, regular pay, OT pay, total pay
* FLSA weekly overtime calculation (OT after 40 hours per ISO week)
* Totals row across all employees
* CSV export (generic format)
* Gusto CSV export (Employee ID / Name / Hours / Amount / Type)
* ADP CSV export (Co Code / Batch ID / File # / Reg hours / OT hours)
* Export available when period is in approved or exported status

## Supervisor Dashboard

Current features:

* Dispatcher call totals
* Average quality score
* Missing critical field counts
* Missing optional field counts
* Calls with missing critical fields
* Calls with explanation

## User Management

Current features:

* Create, edit, activate, deactivate users
* Assign roles
* Link user account to employee record (enables dashboard clock-in widget)
* Employee column in users table showing linked employee name

## Theme System

Current features:

* Dark / light mode toggle in Topbar (moon / sun icon)
* Preference persisted in localStorage
* Bootstrap 5.3 native dark mode via `data-bs-theme` attribute on `<html>`
* CSS Custom Properties (`--ems-*`) for all surface, text, border, and semantic colors
* Dispatch Board uses separate `--ems-board-*` tokens for fine-grained control
* All pages respond to theme change without reload

## Backend Data Model

### User

* id, username, password_hash, display_name, role, is_active
* employee_id (nullable FK → Employee, for clock-in link)
* settings_json — unified per-user settings blob: `{notifications:{...}, dispatch:{...}, ui:{panels:{...}}}`

### Employee

* id, first_name, last_name, phone, email, employee_number, hire_date
* role, status, is_active
* cert_cpr, cert_evoc, cert_emt, cert_paramedic (with expiry dates)
* kiosk_pin, notes

### EmployeeDocument

* id, employee_id (FK → Employee)
* doc_type, title, document_number, issuing_body, issued_date, expiry_date, notes
* file_path, file_name, file_size, mime_type
* uploaded_by (FK → User), uploaded_at, updated_by (FK → User), updated_at

### TimeEntry

* id, employee_id, clock_in, clock_out, break_minutes
* entry_type (clock / manual), status (approved / disputed)
* flag_reason, notes

### EmployeePayConfig

* employee_id, pay_type, hourly_rate, overtime_rate, overtime_after

### PayPeriod

* id, start_date, end_date, period_type, status
* notes, created_by, created_at, exported_at, exported_to

### DailyCrewUnit

* id, shift_date, shift_type (day / night), unit_type, truck_number
* start_time, end_time, end_date
* driver, medical, assist1, assist2 (employee IDs)
* first_patient, next_patients, dispatch_status, notes

### AuditLog

* id, user_id, action, entity_type, entity_id, old_value, new_value, timestamp

### Call / Patient / CallAssignment / NotificationEvent / UserNotification / UserNotificationPrefs / Organization

See prior sections.

## Backend API

### Authentication

```text
POST   /api/auth/login
GET    /api/auth/users
POST   /api/auth/users
PUT    /api/auth/users/<user_id>
PATCH  /api/auth/users/<user_id>/toggle-active
```

### Employees

```text
GET     /api/employees
POST    /api/employees
PUT     /api/employees/<employee_id>
DELETE  /api/employees/<employee_id>
```

### HR Documents

```text
GET     /api/employees/<employee_id>/documents
POST    /api/employees/<employee_id>/documents
GET     /api/documents/<doc_id>
PATCH   /api/documents/<doc_id>
DELETE  /api/documents/<doc_id>
GET     /api/documents/<doc_id>/file
GET     /api/documents/compliance
```

### Time Entries

```text
GET     /api/employees/<employee_id>/time-entries
POST    /api/employees/<employee_id>/time-entries
PATCH   /api/time-entries/<entry_id>
DELETE  /api/time-entries/<entry_id>
GET     /api/employees/<employee_id>/pay-config
PUT     /api/employees/<employee_id>/pay-config
```

### Kiosk

```text
GET   /api/kiosk/employees
GET   /api/kiosk/status/<employee_id>
POST  /api/kiosk/clock-in
POST  /api/kiosk/clock-out
```

### Payroll

```text
GET    /api/payroll/periods
POST   /api/payroll/periods
GET    /api/payroll/periods/<period_id>
PATCH  /api/payroll/periods/<period_id>
DELETE /api/payroll/periods/<period_id>
PATCH  /api/payroll/periods/<period_id>/status
GET    /api/payroll/periods/<period_id>/summary
GET    /api/payroll/export?period_id=&format=csv|gusto|adp
```

### Crew Planner

```text
GET     /api/crew-units
POST    /api/crew-units
PUT     /api/crew-units/<unit_id>
DELETE  /api/crew-units/<unit_id>
POST    /api/crew-units/<unit_id>/make-night
```

### Crew Presets

```text
GET     /api/crew-presets
POST    /api/crew-presets
PUT     /api/crew-presets/<preset_id>
DELETE  /api/crew-presets/<preset_id>
```

### Patients

```text
GET     /api/patients           (?page=&per_page= supported)
POST    /api/patients
GET     /api/patient/<patient_id>
PUT     /api/patient/<patient_id>
DELETE  /api/patient/<patient_id>
GET     /api/patient/<patient_id>/calls
```

### Calls

```text
GET    /api/calls
POST   /api/calls
PUT    /api/calls/<call_id>
PATCH  /api/calls/<call_id>/cancel
PATCH  /api/calls/<call_id>/uncancel
PATCH  /api/calls/<call_id>/pickup-time
```

### Analytics

```text
GET  /api/analytics/dispatchers
```

### Dispatch Board

```text
GET     /api/dispatch/board?date=<YYYY-MM-DD>
POST    /api/dispatch/assign
DELETE  /api/dispatch/assign/<assignment_id>
PATCH   /api/dispatch/assign/<assignment_id>/complete
PATCH   /api/dispatch/assign/<assignment_id>/reopen
PATCH   /api/dispatch/units/<unit_id>/status
PATCH   /api/dispatch/units/<unit_id>/call-order
```

### User Settings

```text
GET    /api/settings          (X-User-Id header)
PATCH  /api/settings          (X-User-Id header, body is deep-merge patch)
```

### Notifications

```text
GET   /api/notifications?user_id=<id>
POST  /api/notifications/read
POST  /api/notifications/read-all
GET   /api/notifications/prefs?user_id=<id>
PUT   /api/notifications/prefs
```

### Audit Log

```text
GET   /api/audit?entity_type=&user_id=&date_from=&date_to=
```

## Installation

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
flask db upgrade
python app.py
```

Backend runs on:

```text
http://127.0.0.1:5050
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:5173
```

## Database Notes

The project uses SQLite for local development and Flask-Migrate (Alembic) for schema migrations.

### Running migrations

```powershell
cd backend
.\venv\Scripts\Activate.ps1
flask db upgrade
```

### Creating a new migration after model changes

```powershell
flask db migrate -m "describe what changed"
flask db upgrade
```

### Starting fresh

Delete `backend/instance/database.db`, restart the backend, then stamp the baseline:

```powershell
flask db stamp head
```

## Development Workflow

### Branch Strategy

```text
main = stable branch
dev  = development branch
```

Recommended workflow:

```text
1. Work in dev
2. Test backend and frontend
3. Smoke test core workflows
4. Commit and push dev
5. Merge into main only after stable testing
```

## Completed Blocks

### Block 1 — Tech Debt Stabilization (complete)

* Caller phone and name in dedicated Call columns
* Pagination on Calls and Patients
* Rate limiting on login (10 attempts/minute)
* Flask-Migrate (Alembic) initialized

### Block 2 Phase 1 — In-App Notifications (complete)

* NotificationEvent, UserNotification, UserNotificationPrefs models
* 7 event types with role-based routing and deduplication
* Notification bell with 10-second polling
* Per-user notification preferences

### Block 2 Phase 2 — Web Push & Board Auto-Refresh (complete)

* pywebpush service worker integration
* Auto-refresh Dispatch Board on polling interval
* Non-intrusive browser notification opt-in banner

### Block 3 Phase 1 — Time Tracking & Kiosk (complete)

* TimeEntry and EmployeePayConfig models
* Kiosk page (PIN-based, no login required)
* Manual time entry for HR/supervisor
* Time & Pay tab in employee drawer
* Clock-in/out from Dashboard (requires user → employee link)
* Dashboard clock widget with live timer

### Block 3 Phase 2 — Payroll Periods (complete)

* PayPeriod model with open → review → approved → exported workflow
* FLSA weekly OT calculation per ISO week
* Per-employee payroll summary with regular/OT split
* Delete pay periods
* CSV export in generic, Gusto, and ADP formats

### Block 3 Phase 3 — Night Crew & Pay Config (complete)

* Night shift support in Crew Planner (shift_type, end_time, end_date)
* Visual separation of Day and Night crew sections
* Make Night from day unit (with replace/keep option)
* Standalone Night unit creation

### Block 4 Phase 1 — HR Documents (complete)

* EmployeeDocument model with full metadata fields
* File storage abstraction layer (storage.py — swap local → S3 in one file)
* Document upload: PDF, JPG, PNG, WEBP, DOCX up to 10 MB
* 12 document types across certification and HR categories
* Color-coded expiry indicators (ok / warning / critical / expired / none)
* Documents tab in employee drawer (Profile | Time & Pay | Documents)
* In-app file preview: PDF via browser viewer, images inline, DOCX download prompt
* Download with proper auth headers (blob URL, no direct link exposure)
* Edit document metadata post-upload
* Delete document with filesystem cleanup
* Compliance summary API endpoint (employee × doc type grid)

### Block 4 Phase 1.5 — Document Expiry Notifications (complete)

* New notification event type: doc_expiring
* Thresholds: 90 / 60 / 30 / 14 / 7 days before expiry
* severity: warning (> 14 days), critical (≤ 14 days)
* Deduplication: one event per document per day
* Roles: admin, supervisor, hr

### Block 4 Phase 2 — Compliance Dashboard (complete)

* Employee × doc type grid view (all employees × 12 document types)
* Color-coded cell per status: ok / warning / critical / expired / missing
* Filter to show only expired and critical rows
* Click cell → open employee Documents tab
* CSV export of the full compliance grid
* Certification scan: upload a cert image → extract type and expiry date

### Block 5.1 — Audit Log (complete)

* AuditLog model: user_id, action, entity_type, entity_id, old_value, new_value, timestamp
* Log: call status changes, unit assignment/removal, patient edits, manual time entries, document uploads/deletes
* Audit log viewer with filter by entity type, user, date range

### Multi-Tenancy Foundation (complete)

* Organization model: id, name, slug (subdomain identifier), is_active, settings_json
* org_id (nullable FK) added to all tenant-scoped tables
* Default organization seeded (id=1, slug="default") — all existing rows assigned
* No application logic changes — foundation only, activation deferred to Tier 3

### Call Cancellation (complete)

* Cancel button in Dispatch Board call detail modal
* Mandatory cancellation reason field — cannot cancel without a reason
* Cancelled status reflected on the board immediately

### Theme System — Phase 1 (complete)

* CSS Custom Properties design token system (`--ems-*` prefix) in `theme.css`
* Bootstrap 5.3 dark mode via `data-bs-theme` on `<html>`
* ThemeContext with `useTheme` hook and localStorage persistence
* Dark / light toggle button in Topbar (moon / sun icon)
* All App.css surfaces ported to CSS variables
* Dispatch Board fully theme-aware via `--ems-board-*` tokens
* All hardcoded dark inline styles replaced with CSS variable references

### UI Standardization — Phase 1 (complete)

* `EntityDrawer` — shared right-side drawer component (50vw, header / tabs / scrollable body / sticky footer)
* `ToastProvider` / `useToast` — non-blocking success and error feedback
* `ConfirmDialog` / `useConfirm` — promise-based confirmation for destructive actions
* `window.alert` and `window.confirm` removed across all modules
* PatientsPage: EntityDrawer with Overview / Edit / Call History tabs
* CallsPage: EntityDrawer with Summary / Trip / Quality tabs
* EmployeesPage: EntityDrawer integration
* CrewPlannerPage: EntityDrawer for unit form; available staff inline in Crew Assignment section
* Dispatch Board: inline Next Status button per unit row; all text colors via CSS variables
* Call.notes structured fields migrated to dedicated columns (dispatcher_name, caller_phone, caller_note)
* `docs/UI_STANDARD.md` — reference document for cards vs tables, drawer/modal/toast rules, module patterns, design tokens

### Call Editing + Return Ride from Call History (complete)

* Edit tab added to Call drawer in Calls page — all fields editable post-intake (dispatcher, caller, trip details, addresses, service level, notes)
* Changes saved via `PUT /api/calls/<id>` and logged to Audit Log as `call.updated` with list of changed fields
* Return Ride creation from Edit tab — creates a separate call record with reversed addresses, selected service level, and return time
* Will Call option available — no pickup time set, configured later from Dispatch Board
* Return service level defaults to BLS when original call is Emergency (patients do not go home as Emergency)
* Return/Will Call legs blocked from creating their own return leg (guard against duplicate chains)
* `TimeInput` component — custom time picker replacing native AM/PM selector: separate HH + MM fields, AM/PM as pill buttons, 12h/24h toggle persisted in localStorage

### UI Standardization — Phase 2 (complete)

* UserManagementPage: full EntityDrawer rewrite — add/edit user in drawer, table-row click to edit, ConfirmDialog for deactivation
* PayrollPage: EntityDrawer for create/edit pay periods; all hardcoded colors replaced with CSS variables
* AuditLogPage: all hardcoded dark colors replaced with `--ems-*` CSS variables; theme-correct in both light and dark
* CallFormPage: Guided mode is now the default; price calculator visible in both Classic and Guided modes; cancel intake with ConfirmDialog; decorative stat cards removed
* HomePage (Dashboard): full redesign — `QuickTile` component grid replaces stat card blocks; compact inline `ClockWidget`; hero row with Start Taking Call shortcut; color-coded tiles by role/section
* CallsPage, EmployeesPage, CrewPlannerPage: `page-summary-grid` removed; stats converted to compact inline color-coded chips within panel headers
* Global CSS compaction: form controls, labels, buttons, and section cards visually modernized to match Dashboard aesthetic; form section icons reduced; service level cards and quality panel made compact

### Block 1.1 — Notes Field Migration (complete)

* Structured lines (Dispatcher, Phone, Caller note) extracted from Call.notes into proper columns
* One-time migration script: `backend/scripts/migrate_notes_to_columns.py`
* Frontend regex fallback removed — all fields read directly from dedicated columns

### UI Standardization — Phase 3 (complete)

* Patient list cards redesigned to match Calls card style — 6-column grid: Name/DOB | Phone | Insurance | Home Address | Default Service (inline select) | Actions
* Default Service Level inline-editable per patient directly from the list — saved via `PUT /api/patient/<id>` with immediate local state update
* Employee list cards redesigned — 6-column grid: Name/#/Hired | Phone+Email | Role/Status | Certifications (CPR/EVOC/EMT/Para compact badges) | Positions | Actions
* Certification badges color-coded: green (active) / amber (expiring) / grey (expired/none)

### Call Dispatch Lifecycle Timestamps (complete)

* Five new fields on `Call` model: `dispatched_at`, `arrived_pickup_at`, `patient_loaded_at`, `arrived_dest_at`, `completed_at`
* Set automatically by unit status transitions on Dispatch Board: `en_route → dispatched_at`, `on_scene → arrived_pickup_at`, `transporting → patient_loaded_at`, `at_destination → arrived_dest_at`; `complete assignment → completed_at`
* Dispatch Timeline section in Call drawer Summary tab — vertical timeline with color-coded milestones
* Supervisor/Admin Edit tab expanded — all lifecycle timestamps + `received_at` + `status` override editable with datetime-local inputs
* All timestamp edits logged to Audit Log as `call.updated` with `note: "timestamp_edit"` and `changed_fields`

### TimeInput — Global Format Toggle (complete)

* `showFormatToggle` prop on `TimeInput` — format toggle rendered only where `showFormatToggle` is set (Pickup Time field)
* All other time fields on the same page show H:MM + AM/PM inputs without their own toggle
* Format change broadcasts via `CustomEvent("ems-time-format")` so all `TimeInput` instances on the page switch simultaneously
* Format preference persisted in `localStorage` — applies across page reloads

### Timezone / Timestamp Consistency (complete)

* All backend timestamp writes standardized to naive local time: `datetime.now().isoformat(timespec="seconds")` — no UTC offset
* Frontend `received_at` writes use `localIsoNow()` helper (exported from `callUtils.js`) — produces `YYYY-MM-DDTHH:MM:SS` in local time
* `new Date("YYYY-MM-DDTHH:MM:SS")` treated as local by browsers — `toLocaleString()` displays correct local time with no offset math
* `datetime-local` inputs read and write values without TZ conversion

### Calls API (complete)

* `PUT /api/calls/<id>` — update any call field post-intake; role-checked (dispatcher+)
* `PATCH /api/calls/<id>/cancel` — cancel with mandatory reason
* `PATCH /api/calls/<id>/uncancel` — restore cancelled call to new
* `PATCH /api/dispatch/assign/<id>/reopen` — reopen completed assignment

### Dispatch Board — Crew Planning Integration (complete)

* Crew Planner fully embedded in Dispatch Board (Variant C)
* + Day Unit / + Night Unit buttons in board header
* Edit / Delete buttons on unit rows
* Unit create/edit drawer with full crew assignment and validation
* Left panel Staff tab: shows unassigned employees for the date
* Calls / Staff toggle in left panel
* Patient queue sub-row: derived from actual assigned calls sorted by pickup time; stale manual entries no longer shown

### Dispatch Board — Call Management (complete)

* + New Call button in left panel opens `CallDrawer` for create mode
* CallDrawer supports patient search (name + DOB + phone), new patient creation with dedup check, full trip and caller fields
* CallDrawer auto-fills pickup address from selected patient's address record
* CallDrawer warns before closing if form has unsaved changes (overlay, ✕, Cancel, Escape)
* Edit Call from call detail modal footer — opens CallDrawer in edit mode
* Dispatch Timestamps inline editing in call detail modal (dispatched / on scene / transporting / at destination / completed)
* Completed calls in Done tab now carry `assignment_id` from backend — Reopen works correctly from any context
* `patient_order` JSON column on `DailyCrewUnit` stores `[{name, time, callId}]` — board display derives from live assignments, not stored order

### Dispatch Board — Operational Alerts + Priority Queue (complete)

* Manual call priority queue per unit: ⚡ Set High Priority (moves to top), ▲▼ reorder, Reset to time order
* `call_priority` JSON array on `DailyCrewUnit` stores `[call_id, ...]`; empty = auto sort by pickup_time
* Overdue call animation: call row flashes red when pickup_time is exceeded by user-configurable threshold (default 0 min = immediately)
* Unit stuck animation: unit status cell flashes red when no status change for user-configurable threshold (default 30 min)
* `dispatch_status_changed_at` on `DailyCrewUnit` — timestamp updated on every unit status change, used for stuck detection
* Overdue/stuck thresholds saved per user in unified settings blob (`settings.dispatch.pickup_late_after`, `settings.dispatch.stuck_after`)
* Dispatch lifecycle timestamps write-once: `dispatched_at`, `arrived_pickup_at`, `patient_loaded_at`, `arrived_dest_at` never overwritten on repeated status clicks

### Per-User Settings System (complete)

* `settings_json` column on `User` model — unified blob: `{notifications, dispatch, ui}`
* `settings_utils.py` — `DEFAULT_SETTINGS`, `deep_merge`, `load_user_settings` (auto-migrates from old `UserNotificationPrefs`), `save_user_settings`
* `GET /api/settings` — full settings blob with defaults for current user
* `PATCH /api/settings` — deep-merge patch, partial updates supported
* `UserSettingsContext` — React context loaded once at login, available app-wide via `useUserSettings()`
* `NotificationSettingsPage` — reads enabled values from context, saves via `updateSettings()`
* `DispatchBoardPage` — reads dispatch thresholds from context, no separate fetch
* Panel sizes (left column width, bottom panel height) auto-saved to `settings.ui.panels.dispatch` on drag end
* Panel sizes restored from settings on page load
* ⊞ Reset layout button in board header — visible only when sizes differ from defaults
* User menu dropdown in Topbar (avatar click): Settings link, Dark/Light mode toggle, Log out

## Roadmap

### Interactive User Manual (complete)

* Full rewrite of `UserManualPage` — static SOP replaced with a two-panel interactive reference
* Left sidebar: sticky navigation (does not scroll with content), section search, role filter ("My role only")
* 13 sections covering every system module: Getting Started, Dashboard, Dispatch Board, Call Taking Form, Patients, Calls, Employees & HR, Crew Planner, Payroll, Compliance Dashboard, Notifications & Settings, Audit Log, Quick Reference
* Accordion layout — each section expands/collapses on click; clicking a sidebar link scrolls to and opens the section
* Callout blocks: Tip (blue), Warning (red), Note (green) with icons
* Numbered step flows for SOP workflows (call intake, payroll, etc.)
* Quick Reference section: dispatch keyboard actions, status sequence, lifecycle timestamp map, role access matrix

### Block 5.2 — Assignment Conflict Validation

* On assign: check for time overlap on the same unit

* Returns warning modal (not a block) — dispatcher can override
* Consistent with existing ALS-on-BLS warning pattern

### Block 5.3 — Call Timeline & Daily Operations View

* New model: CallEvent (call_id, unit_id, event_type, actor, timestamp, meta_json)
* event_type: assigned, unassigned, en_route, on_scene, transporting, at_destination, completed
* Event written on every dispatch action (assign, status change, complete, unassign)
* Daily Operations page: select date → list all calls → click call → full event timeline
* Timeline shows: who did what, at what time, on which unit
* Foundation for future reporting (response times, on-scene duration, unit utilization)

### Block 5.4 — Call Export CSV

* GET /api/calls/export?date_from=&date_to=&status=&service_level=
* Fields: date, patient, addresses, call type, service level, unit, dispatcher, status, quality score
* Export button in Calls list or Supervisor Dashboard

### Block 5.5 — Repeat Call

* Repeat button in Call Detail Modal
* Creates new call with same data, date = today
* Opens pre-filled intake form for review before saving

### Block 5.6 — Call Notes (Communication Log)

* CallNote model: call_id, user_id, content, created_at (append-only)
* Visible in Call Detail Modal
* Accessible to all roles with call access

### Approve Rules — Clock-in Sync

* Sync clock-in with Crew Planner shift start time
* Configurable tolerance thresholds: ±15 / ±30 min
* Auto-flag entries exceeding shift duration rules (8h / 12h / 24h)
* Manual override per employee or role

### Block 5.7 — Reports (Final Phase)

* Built on CallEvent data from Block 5.3
* Average response time (dispatch → on scene)
* Average transport time (on scene → at destination)
* Unit utilization per day / week / period
* Call volume by service level, date range, dispatcher
* Export to PDF and CSV

## Tier 3 — Before Production

### Subdomain Multi-Tenancy (activation)

* Flask middleware: reads subdomain from Host header → looks up Organization by slug → sets g.current_org
* All queries filtered by org_id (schema foundation already in place)
* Superadmin role and UI: create / deactivate organizations, assign org admins
* Frontend: OrgContext reads /api/org/current on startup
* Local dev: lvh.me subdomains or X-Org-Slug header fallback

### JWT Authentication

* Replace localStorage MVP with access + refresh tokens
* Transparent to users — no UI changes
* Update all protected routes and role checks

### PostgreSQL

* Replace SQLite with PostgreSQL
* Data migration script from SQLite
* No model changes required (SQLAlchemy abstraction handles it)

### Docker

* Dockerfile for backend and frontend
* docker-compose.yml with nginx reverse proxy
* Environment-based configuration

### Block 4 Phase 3 — S3 Storage

* Replace storage.py implementation with boto3
* No changes required outside storage.py
* Config via environment: STORAGE_BACKEND, S3_BUCKET, AWS credentials

## Current Status

```text
Stable — Blocks 1–4 complete, Audit Log complete, Theme System complete, UI Standardization Phases 1–3 complete,
Call Editing + Return Ride complete, Dispatch Board fully unified (crew planning + call management + timestamps +
priority queue + operational alerts), Per-User Settings System complete (notifications + dispatch thresholds +
UI panel sizes, unified settings blob, UserSettingsContext, user menu dropdown in Topbar),
Interactive User Manual complete (sticky sidebar, search, role filter, 13 accordion sections, callout blocks)
Next: Block 5.2 — Assignment Conflict Validation
```

Current implemented workflow:

```text
Authentication (rate-limited login)
↓
Role-Based Navigation
↓
Dashboard (with Clock In / Clock Out widget)
↓
Call Intake (Classic + Guided)
↓
Duplicate Patient Prevention
↓
Automatic Patient Creation
↓
Patient Management
↓
Call History
↓
Employee Management (Profile | Time & Pay | Documents tabs)
↓
HR Document Management (upload, preview, expiry tracking)
↓
Compliance Dashboard (employee × doc type grid, cert scan)
↓
Crew Planning (Day + Night shifts)
↓
Crew Presets
↓
UI Standardization (EntityDrawer across all modules)
↓
Dispatch Board
↓
Call Assignment (drag-and-drop)
↓
Unit Status Tracking
↓
Call Completion / Cancellation (with mandatory reason)
↓
Supervisor Analytics
↓
Audit Log
↓
In-App Notifications (real-time polling, doc expiry alerts)
↓
Kiosk Clock In / Clock Out
↓
Payroll Period Management
↓
Payroll CSV Export (generic / Gusto / ADP)
↓
Multi-Tenant Foundation (Organization model, org_id on all tables)
↓
Dark / Light Theme (CSS tokens, Bootstrap 5.3 dark mode, localStorage)
```

## This System Is

* An EMS workflow platform
* A dispatcher support platform
* A patient lookup and call intake tool
* A staff management platform
* An HR document management platform
* A crew planning platform (day and night shifts)
* A live dispatch board platform
* An operational continuity platform
* A supervisor analytics platform
* A time tracking and payroll management platform
* A training and quality improvement tool

## This System Is Not

* A replacement for primary dispatch software
* A CAD platform
* An EMR platform
* A hospital management system
* A clinical documentation system
* A full billing system

## Author

Created by Aleh Sitsko
Built from real EMS dispatch experience.
Made by an EMD for EMDs.
