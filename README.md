# EMS Workflow System

## Overview

EMS Workflow System is a modular operational platform designed to support EMS and medical transportation organizations with dispatcher workflows, patient records, employee management, crew planning, dispatch board operations, supervisor oversight, and structured operational record keeping.

The system is designed as an operational support platform. It is not intended to replace primary dispatch software, CAD systems, EMR systems, clinical documentation systems, or billing platforms.

## Primary Objectives

* Fast and reliable call intake
* Structured dispatcher workflows
* Guided call-taking support
* Patient record lookup and management
* Duplicate patient prevention during call intake
* Automatic patient creation during call intake when no existing patient is found
* Employee and certification management
* Daily crew planning
* Crew preset workflows
* Live dispatch board with drag-and-drop assignment
* Unit status tracking and progression
* Return ride as two separate assignable trips
* Role-based access control
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
│   ├── migrate.py                    (deprecated — use Flask-Migrate)
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
│   │   └── notification_routes.py
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
│   │   │   └── patientsApi.js
│   │   ├── components/
│   │   │   ├── crew/
│   │   │   └── layout/
│   │   │       ├── AppLayout.jsx
│   │   │       ├── Topbar.jsx
│   │   │       ├── Sidebar.jsx
│   │   │       ├── NotificationBell.jsx
│   │   │       └── navigationConfig.js
│   │   ├── hooks/
│   │   │   └── useNotifications.js
│   │   ├── pages/
│   │   │   └── NotificationSettingsPage.jsx
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

### Current Features

* Login system with rate limiting (10 attempts/minute per IP)
* Role-aware navigation
* Protected frontend routes
* User management
* User activation and deactivation
* Dispatcher identity tracking
* Session persistence through local storage
* HR role support
* Role-based module visibility

## Role Access

### Admin

Full system access including notifications for all event types.

Can access:

* Dashboard
* Dispatch Board
* Call Taking Form
* Guided Call Intake
* Patients
* Calls
* Employees
* Crew Planner
* Crew Presets
* Supervisor Dashboard
* Users
* Notifications
* Notification Settings
* User Manual

### Supervisor

Operational and management access.

Can access:

* Dashboard
* Dispatch Board
* Call Taking Form
* Guided Call Intake
* Patients
* Calls
* Employees
* Crew Planner
* Crew Presets
* Supervisor Dashboard
* Notifications
* Notification Settings
* User Manual

### Dispatcher

Operational workflow access.

Can access:

* Dashboard
* Dispatch Board
* Call Taking Form
* Guided Call Intake
* Patients
* Calls
* Crew Planner
* Notifications
* Notification Settings
* User Manual

Cannot access:

* Employees
* Users
* HR-only employee administration
* Admin-only settings

### HR

Staff and crew planning access.

Can access:

* Dashboard
* Employees
* Crew Planner
* Crew Presets
* Notifications (cert_expiring, employee_added only)
* Notification Settings
* User Manual

Cannot access:

* Dispatch Board
* Call Taking Form
* Guided Call Intake
* Patients
* Calls
* Supervisor call analytics
* Protected PHI-related operational data

## Current Modules

## Dashboard

The Dashboard is the main role-aware landing page.

Current features:

* Modern sidebar and topbar layout
* Role-specific navigation
* Quick access to available modules
* Dispatch Board shortcut card
* Start Taking Call shortcut for call-taking roles
* Module cards organized by section
* Collapsible sidebar
* Responsive layout foundation

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
* Call detail modal with sections and visual hierarchy (icons, severity colors)
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

Classic Mode provides the full open-form call intake workflow.

Current features:

* Dispatcher identity from logged-in user
* Caller information
* Patient information
* Patient search
* Existing patient selection
* Duplicate patient prevention before automatic patient creation
* Automatic new patient creation only when no existing patient is matched
* Trip details
* Date of call
* Date of trip
* Pickup time
* Appointment time (hidden when Emergency service level is selected)
* Return ride support
* Return ride address auto-fill (Dropoff → Return Pickup, Pickup → Return Destination)
* Return addresses re-sync automatically when pickup or dropoff changes while return ride is active
* Service level selection
* Emergency service level selection
* Emergency warning when Emergency is selected
* Call quality scoring
* Missing critical field detection
* Missing optional field detection
* Required dispatcher explanation when critical information is missing
* Empty call save protection
* Backend call persistence
* Received timestamp persistence
* Initial call status persistence
* Patient-to-call linking
* Price calculator
* Print and clear controls
* Modernized section-based UI

### Guided Intake Mode

Guided Intake is a step-by-step call workflow designed for faster and more structured call taking.

Current features:

* Start Taking Call workflow
* Patient lookup step
* Patient search by date of birth, last name, and phone number
* Right-side patient lookup drawer
* Select existing patient
* Continue as new patient
* Duplicate patient prevention before automatic patient creation
* Automatic new patient creation only when no existing patient is matched
* Trip details step
* Date of call
* Date of trip
* Pickup time
* Appointment time (hidden when Emergency service level is selected)
* Return ride support
* Service level selection
* Emergency service level selection
* Emergency warning in trip step
* Emergency warning in review step
* Review and save step
* Call quality review before saving
* Required explanation for missing critical information
* Empty guided call save protection
* Backend call persistence
* Received timestamp persistence
* Initial call status persistence
* Patient-to-call linking

## Notifications

The Notification System provides real-time operational alerts for all roles.

Current features:

* Bell icon in Topbar with unread badge (capped at "99+")
* Dropdown list with all unread notifications
* Per-notification: icon by type, title, body, time ago, severity color
* Click to mark individual notification as read
* "Mark all read" button
* Polling every 10 seconds (no page refresh required)
* Role-filtered event delivery (each role receives only relevant event types)
* Per-user notification preferences (enable/disable by type)
* Notification Settings page grouped by category

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

### Notification Settings

* Available at `/notifications` route
* Toggle individual event types on/off per user
* Grouped by category: Calls / Units / HR & Employees
* Only shows types relevant to user's role

## Price Calculator

The Price Calculator provides a simple operational estimate for trip pricing.

Current features:

* Base price
* Mileage
* Rate per mile
* Crew size adjustment
* Return ride / round trip calculation
* Waiting Time Requested option
* Manual Waiting Time Fee entry
* Waiting Time Fee is added once and is not multiplied by return ride
* Price breakdown
* Clear calculator action

Current calculation model:

```text
oneWayTripTotal = base price + mileage fee + crew adjustment

if return ride:
    tripSubtotal = oneWayTripTotal * 2
else:
    tripSubtotal = oneWayTripTotal

total = tripSubtotal + waiting time fee
```

The calculator is an operational estimate tool and is not intended to be a full billing system.

## Patients

The Patients module supports patient record management and patient call history review.

Current features:

* Create patient
* Edit patient
* Delete patient
* Search patients
* Show all patients
* Date of birth lookup
* Patient detail panel
* Patient call history
* Modern card-based patient list
* Add/edit patient drawer
* Unsaved patient form protection
* Confirmation before closing a dirty patient drawer
* Patient data used by call intake workflows
* New patient records can be created automatically from call intake
* Duplicate patient prevention during call intake
* Calls can be linked to patient records
* Paginated list with "Load more" button

## Calls

The Calls module provides global call history and operational auditing.

Current features:

* Global call history
* Compact call cards
* Date filtering
* Dispatcher filtering
* Status filtering
* Minimum quality score filtering
* Maximum quality score filtering
* Today shortcut
* Load all shortcut
* Expandable call details
* Received timestamp display
* Initial status display
* Appointment time display
* Service level display
* Emergency calls displayed with a danger badge
* Emergency call count summary
* Quality score badges
* Missing critical field tracking
* Missing optional field tracking
* Dispatcher explanation review
* Operational notes review
* Linked patient ID stored when patient record exists
* Paginated list with "Load more" button

Important note:

* Calls History is an audit and history module.
* Live dispatch execution is handled by the Dispatch Board, not by Calls History.

## Employees

The Employees module supports employee records, roles, operational status, and certification tracking.

Current features:

* Create employee
* Edit employee
* Delete employee
* Employee status tracking
* Employee role tracking
* Employee number tracking
* Hire date tracking
* Contact information
* Notes
* Certification tracking: CPR, EVOC, EMT, Paramedic
* Certification expiration dates
* Active/inactive status
* Role color badges
* Add/edit employee drawer
* Employee cards
* Certification warning summaries

## Crew Planner

The Crew Planner module supports daily unit planning and crew assignment.

Current features:

* Planning by shift date
* Create crew unit
* Edit crew unit
* Delete crew unit
* Right-side create/edit unit drawer
* Unsaved changes confirmation before closing drawer
* Planned units shown as primary working view
* Unassigned employee list
* Employee role badges
* Unit type selection (BLS, ALS, ASSIST)
* Truck number
* Start time
* Driver slot: accepts employees with EVOC certification or Driver role
* Medical slot (EMT or Paramedic for BLS, Paramedic only for ALS)
* Assist slots: any active employee
* Patient order tracking
* Next patient list
* Certification validation
* CPR warnings
* Conflict detection
* Crew preset support
* Backend persistence

Driver eligibility rule:

* Employee has EVOC certification, OR
* Employee operational role is Driver

Important note:

* Emergency is currently implemented as a call service level.
* Emergency is not currently implemented as a Crew Planner unit type.

## Crew Presets

Crew Presets support reusable crew configurations.

Current features:

* Save current crew as preset
* Apply existing preset
* Reusable crew templates
* Faster daily planning
* Standardized staffing combinations

## Supervisor Dashboard

The Supervisor Dashboard provides dispatcher analytics and call quality oversight.

Current features:

* Dispatcher call totals
* Average quality score
* Missing critical field counts
* Missing optional field counts
* Calls with missing critical fields
* Calls with explanation
* Operational quality tracking

## User Management

The User Management module supports application user administration.

Current features:

* Create users
* Edit users
* Activate users
* Deactivate users
* Assign roles
* Manage access status

## Crew Validation Rules

### Driver

Requirements:

* Active employee
* Active operational status
* EVOC certification OR employee role is Driver

### BLS Medical

Requirements:

* Active employee
* Active operational status
* EMT certification or Paramedic certification

### ALS Medical

Requirements:

* Active employee
* Active operational status
* Paramedic certification

### Assist Roles

Requirements:

* Active employee
* Active operational status

Assist slots are intentionally flexible and may be filled by any active employee.

## Call Quality Rules

### Critical Fields

Critical fields currently include:

* First Name
* Last Name
* Date of Birth
* Pick Up Address

If critical information is missing, the dispatcher must enter an explanation before saving the call.

### Optional Fields

Optional quality fields currently include:

* Phone Number
* Drop Off Address
* Date of Trip
* Pickup Time
* Appointment Time
* Caller Type
* Service Level
* Additional Information

### Quality Score

The current scoring model uses:

* Critical fields: 70% of total score
* Optional fields: 30% of total score

The score is saved with each call record.

Important note:

* Call quality tracking belongs to call intake, call history, audit, and supervisor review.
* Quality score is not shown on the Dispatch Board.

## Backend Data Model

### Call

The Call model currently supports:

* Linked patient ID
* Dispatcher name
* Received timestamp
* Operational status (new / assigned / completed)
* Date of call
* Trip date
* Pickup time
* Appointment time
* Pickup address
* Dropoff address
* Caller type
* Call type (also stores return ride option)
* Service level
* Quality score
* Missing critical fields
* Missing optional fields
* Missing information explanation
* Notes (includes return ride address and time when applicable)

### DailyCrewUnit

The DailyCrewUnit model currently supports:

* Shift date
* Unit type
* Truck number
* Start time
* Driver, medical, assist1, assist2 crew slots
* Patient order
* Dispatch status (available / en_route / on_scene / transporting / at_destination / out_of_service)
* Notes
* Timestamps

### CallAssignment

The CallAssignment model supports:

* Call ID
* Unit ID
* Assigned timestamp
* Assigned by (dispatcher name)
* Active flag (False when unassigned or completed)

### Patient

The Patient model currently supports:

* Basic demographics
* Date of birth
* Contact information
* Address
* Insurance information
* EMS-specific notes
* Default service level
* Facility information
* Emergency contact information
* General notes

### NotificationEvent

The NotificationEvent model supports:

* Event type (call_unassigned_soon, call_new_today, call_als_on_bls, unit_stuck_status, unit_understaffed, cert_expiring, employee_added)
* Severity (info / warning / critical)
* Title and body
* Entity type and entity ID (for deduplication)
* Created at timestamp
* Optional expiry timestamp

### UserNotification

The UserNotification model supports:

* Reference to NotificationEvent
* Reference to User
* Read status
* Created at timestamp

### UserNotificationPrefs

The UserNotificationPrefs model supports:

* Per-user JSON preferences keyed by event type
* Defaults to all enabled

## Backend API

### Authentication

```text
POST   /api/auth/login          (rate-limited: 10/min per IP)
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
GET   /api/calls                (?page=&per_page= supported)
POST  /api/calls
```

Current call filters:

* date_of_call
* dispatcher_name
* status
* min_quality_score
* max_quality_score

### Crew Planner

```text
GET     /api/crew-units
POST    /api/crew-units
PUT     /api/crew-units/<unit_id>
DELETE  /api/crew-units/<unit_id>
```

### Crew Presets

```text
GET     /api/crew-presets
POST    /api/crew-presets
PUT     /api/crew-presets/<preset_id>
DELETE  /api/crew-presets/<preset_id>
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

## Backend

From the project root:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Backend runs on:

```text
http://127.0.0.1:5050
```

## Frontend

From the project root:

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
flask --app app db upgrade
```

### Creating a new migration after model changes

```powershell
flask --app app db migrate -m "describe what changed"
flask --app app db upgrade
```

### Starting fresh

Delete `backend/instance/database.db`, restart the backend, then stamp the baseline:

```powershell
flask --app app db stamp head
```

The legacy `migrate.py` is kept for reference only. Do not use it for schema changes.

## Development Workflow

## Branch Strategy

```text
main = stable branch
dev  = development branch
```

Development should happen in `dev` first.

After testing:

```text
dev → main
```

Recommended workflow:

```text
1. Work in dev
2. Test backend
3. Test frontend
4. Smoke test core workflows
5. Commit changes
6. Push dev
7. Merge into main only after stable testing
```

## Completed Features (as of Block 2 Phase 1)

### Block 1 — Tech Debt Stabilization (complete)

* Task 1.1 — Caller phone and caller name stored in dedicated Call columns; click-to-open call detail modal on Dispatch Board
* Task 1.2 — Pagination on Calls and Patients endpoints (`?page=&per_page=`); "Load more" button on frontend
* Task 1.3 — Rate limiting on `/api/auth/login` (10 attempts/minute per IP, returns 429 JSON)
* Task 1.4 — Flask-Migrate (Alembic) initialized with initial schema migration and notification models migration

### Block 2 Phase 1 — In-App Notifications (complete)

* NotificationEvent, UserNotification, UserNotificationPrefs models
* 7 event types with role-based routing
* Deduplication logic (entity_id + time window)
* Temporal polling checks (call_unassigned_soon, cert_expiring)
* Notification bell in Topbar with 10-second polling
* Mark as read / mark all read
* Per-user notification preferences page at `/notifications`

## Roadmap

### Next — Block 2 Phase 2

* Web Push notifications (pywebpush + service worker)
* Auto-refresh Dispatch Board on a polling interval
* Non-intrusive "Enable browser notifications?" banner on first login

### Block 3 — Time Tracking & Payroll

* TimeEntry model (clock_in, clock_out, break_minutes, status)
* EmployeePayConfig (pay_type, hourly_rate, overtime rules)
* Kiosk page at `/kiosk` — PIN-based clock in/out, no login required
* Manual time entry for HR/supervisor
* PayPeriod model and approval workflow
* Payroll CSV export (Gusto / ADP format)

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

### Tier 3 (Before Production)

* JWT authentication (replace localStorage MVP)
* PostgreSQL (replace SQLite)
* Docker / Docker Compose deployment

### Developer Future Requests

* Sound notification on new alert — play a sound when a new unread notification arrives during polling

## Current Status

Development branch status:

```text
Stable — Block 1 complete, Block 2 Phase 1 complete
```

Current implemented workflow:

```text
Authentication (rate-limited login)
↓
Role-Based Navigation
↓
Dashboard
↓
Call Intake (Classic + Guided)
↓
Duplicate Patient Prevention
↓
Automatic Patient Creation
↓
Patient Management (paginated)
↓
Call History (paginated)
↓
Employee Management
↓
Crew Planning
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
```

## This System Is

* An EMS workflow platform
* A dispatcher support platform
* A patient lookup and call intake tool
* A staff management platform
* A crew planning platform
* A live dispatch board platform
* An operational continuity platform
* A supervisor analytics platform
* A training and quality improvement tool

## This System Is Not

* A replacement for primary dispatch software
* A CAD platform
* An EMR platform
* A hospital management system
* A clinical documentation system
* A full billing system
* A CAD replacement

## Author

Created by Aleh Sitsko
Built from real EMS dispatch experience.
Made by an EMD for EMDs.
