# EMS Workflow System

## Overview

EMS Workflow System is a modular operational platform designed to support EMS and medical transportation organizations with dispatcher workflows, patient records, employee management, crew planning, dispatch board operations, time tracking, payroll management, supervisor oversight, and structured operational record keeping.

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
* Supervisor analytics
* Call quality tracking
* Operational call status tracking
* Operational continuity during workflow disruptions
* Modular architecture
* In-app notification system with real-time polling

The platform is intended to remain useful during normal operations, temporary software outages, communication disruptions, workflow failures, high-volume operational periods, and dispatcher training workflows.

## Technology Stack

### Frontend

* React
* Vite
* JavaScript ES6+
* React Router (HashRouter)
* React Icons
* Bootstrap 5
* Custom CSS layout system

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
│   ├── notification_utils.py
│   ├── migrations/                   (Alembic migration files)
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
│   │   └── payroll_routes.py
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
│   │   │   ├── timeApi.js
│   │   │   └── payrollApi.js
│   │   ├── components/
│   │   │   ├── crew/
│   │   │   │   └── PlannedUnitsList.jsx
│   │   │   ├── TimePayTab.jsx
│   │   │   └── layout/
│   │   │       ├── AppLayout.jsx
│   │   │       ├── Topbar.jsx
│   │   │       ├── Sidebar.jsx
│   │   │       ├── NotificationBell.jsx
│   │   │       └── navigationConfig.js
│   │   ├── hooks/
│   │   │   └── useNotifications.js
│   │   ├── pages/
│   │   │   ├── HomePage.jsx
│   │   │   ├── KioskPage.jsx
│   │   │   ├── EmployeesPage.jsx
│   │   │   ├── CrewPlannerPage.jsx
│   │   │   ├── PayrollPage.jsx
│   │   │   └── ...
│   │   ├── styles/
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

Can access: Dashboard, Dispatch Board, Call Taking Form, Patients, Calls, Employees, Crew Planner, Payroll, Supervisor Dashboard, Users, Kiosk, Notifications, User Manual

### Supervisor

Operational and management access.

Can access: Dashboard, Dispatch Board, Call Taking Form, Patients, Calls, Employees, Crew Planner, Payroll, Supervisor Dashboard, Kiosk, Notifications, User Manual

### Dispatcher

Operational workflow access.

Can access: Dashboard, Dispatch Board, Call Taking Form, Patients, Calls, Crew Planner, Kiosk, Notifications, User Manual

Cannot access: Employees, Users, Payroll, HR-only features

### HR

Staff and crew planning access.

Can access: Dashboard, Employees, Crew Planner, Payroll, Kiosk, Notifications (cert_expiring, employee_added only), User Manual

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

The Dispatch Board is the live operational dispatch interface.

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
* Resizable Open Calls column via drag divider
* Call detail modal with sections and visual hierarchy
* Dark operational theme throughout

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
* Per-user notification preferences

### Notification Event Types

| Type | Description | Roles |
|------|-------------|-------|
| call_unassigned_soon | Unassigned call with pickup < 30 min | admin, supervisor, dispatcher |
| call_new_today | New call created for today | admin, supervisor, dispatcher |
| call_als_on_bls | ALS call assigned to BLS unit | admin, supervisor, dispatcher |
| unit_stuck_status | Unit in same status > N min | admin, supervisor, dispatcher |
| unit_understaffed | Unit created with no crew | admin, supervisor |
| cert_expiring | Employee certification expiring | admin, supervisor, hr |
| employee_added | New employee added | admin, hr |

## Employees

Current features:

* Create, edit, delete employees
* Employee status and role tracking
* Employee number, hire date, contact info, notes
* Certification tracking (CPR, EVOC, EMT, Paramedic) with expiration dates
* Active/inactive status
* Kiosk PIN per employee
* Time & Pay tab: manual time entry, clock history, pay config (hourly rate, overtime rules)
* Click employee card to open in edit drawer
* Card actions do not trigger drawer close

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

## Backend Data Model

### User

* id, username, password_hash, display_name, role, is_active
* employee_id (nullable FK → Employee, for clock-in link)

### Employee

* id, first_name, last_name, phone, email, employee_number, hire_date
* role, status, is_active
* cert_cpr, cert_evoc, cert_emt, cert_paramedic (with expiry dates)
* kiosk_pin, notes

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

### Call / Patient / CallAssignment / NotificationEvent / UserNotification / UserNotificationPrefs

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
GET   /api/calls
POST  /api/calls
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
PATCH   /api/dispatch/units/<unit_id>/status
```

### Notifications

```text
GET   /api/notifications?user_id=<id>
POST  /api/notifications/read
POST  /api/notifications/read-all
GET   /api/notifications/prefs?user_id=<id>
PUT   /api/notifications/prefs
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

## Roadmap

### Block 2 Phase 2 (pending)

* Web Push notifications (pywebpush + service worker)
* Auto-refresh Dispatch Board on polling interval
* Non-intrusive browser notification opt-in banner

### Block 4 — HR Documents

* EmployeeDocument model with storage abstraction (local → S3)
* Document types: licenses, certs, HR docs, contracts
* Documents tab in employee profile with color-coded expiry
* Compliance Dashboard (employee × doc type grid)

### Block 5 — Operational Improvements

* AuditLog (who changed what and when)
* Assignment conflict validation (overlap warnings)
* Call export CSV (for billing / insurance / audit)
* Repeat call / call templates
* CallNote (append-only communication log per call)

### Approve Rules (planned)

* Sync clock-in with Crew Planner shift start time
* Configurable tolerance thresholds (±15 min, ±30 min)
* Auto-flag entries that exceed shift duration rules (8h, 12h, 24h)
* Manual override rules per employee or role

### Tier 3 (Before Production)

* JWT authentication (replace localStorage MVP)
* PostgreSQL (replace SQLite)
* Docker / Docker Compose deployment

## Current Status

```text
Stable — Block 1 complete, Block 2 Phase 1 complete, Block 3 complete
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
Employee Management (with Time & Pay tab)
↓
Crew Planning (Day + Night shifts)
↓
Crew Presets
↓
Dispatch Board
↓
Call Assignment (drag-and-drop)
↓
Unit Status Tracking
↓
Call Completion
↓
Supervisor Analytics
↓
In-App Notifications (real-time polling)
↓
Kiosk Clock In / Clock Out
↓
Payroll Period Management
↓
Payroll CSV Export (generic / Gusto / ADP)
```

## This System Is

* An EMS workflow platform
* A dispatcher support platform
* A patient lookup and call intake tool
* A staff management platform
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
