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

The platform is intended to remain useful during normal operations, temporary software outages, communication disruptions, workflow failures, high-volume operational periods, and dispatcher training workflows.

## Technology Stack

### Frontend

* React
* Vite
* JavaScript ES6+
* React Router
* React Icons
* Bootstrap
* Custom CSS layout system

### Backend

* Python
* Flask
* Flask Blueprints
* Flask-CORS
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
│   ├── migrate.py
│   ├── routes/
│   │   ├── auth_routes.py
│   │   ├── employee_routes.py
│   │   ├── crew_routes.py
│   │   ├── crew_preset_routes.py
│   │   ├── patient_routes.py
│   │   ├── call_routes.py
│   │   ├── analytics_routes.py
│   │   └── dispatch_routes.py
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
│   │   ├── pages/
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

* Login system
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

Full system access.

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
* Responsive layout foundation

## Dispatch Board

The Dispatch Board is the live operational dispatch interface.

Current features:

* Date selector for viewing any shift date
* Open Calls column showing unassigned calls for the selected date
* Emergency calls section (red left border) separated from Scheduled calls
* Return ride calls displayed as two independent draggable slots (Outbound + Return)
* Calls sorted by pickup time
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
* Dark operational theme throughout

Operational rules enforced:

* BLS unit minimum 2 crew
* BLS-4 and BLS-6 unit minimum 4 crew
* ALS call on non-ALS unit triggers warning but allows override
* Emergency is a call priority, not a unit type
* Out of Service always returns to Available
* Return ride = two separate assignable trips

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
* Appointment time
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
* Appointment time
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

### Patients

```text
GET     /api/patients
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

## Installation

## Backend

From the project root:

```powershell
cd backend
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

The project currently uses SQLite for local development.

If the backend database needs to be migrated after a schema change, run:

```powershell
cd backend
python migrate.py
```

The migrate.py script handles column additions without destroying existing data. It is safe to run multiple times.

Recent schema additions:

```text
daily_crew_unit.dispatch_status
call_assignment (new table)
```

If starting fresh, deleting `backend/instance/database.db` and restarting the backend will recreate the full schema automatically.

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

## Current Development Direction

Current focus areas:

* Dispatch Board refinement
* Reorder assigned calls within a unit
* Cancelled / no-show / refused call outcomes
* Call status timestamps
* JWT authentication
* Backend permission middleware
* PostgreSQL migration
* Docker preparation

## Frontend Refactor Progress

Completed:

* Sidebar layout
* Topbar layout
* Dashboard redesign with Dispatch Board card
* Role-aware module navigation
* Patients page redesign
* Patient add/edit drawer
* Unsaved patient drawer protection
* Employees page redesign
* Employee add/edit drawer
* Calls page compact list
* Calls page emergency badge display
* Calls page received timestamp display
* Calls page initial status display
* Calls page status filter
* Crew Planner planned unit cards
* Crew Planner create/edit drawer
* Crew Planner unsaved changes confirmation
* Unassigned employee chips
* Role color badges
* Classic Call Form visual redesign
* Return ride address auto-fill on toggle and address change
* Guided Call Intake workflow
* Patient lookup drawer
* Automatic patient creation from call intake
* Duplicate patient prevention during call intake
* Empty call save protection
* Appointment Time field in call intake
* Received timestamp persistence
* Initial call status persistence
* Price Calculator visual redesign
* Waiting Time Fee support in Price Calculator
* Emergency service level support in call intake
* Dispatch Board page with drag-and-drop assignment
* Dispatch Board open calls split into Emergency and Scheduled sections
* Dispatch Board return ride as two independent trip slots
* Dispatch Board calls sorted by pickup time
* Dispatch Board service mismatch and crew warning modals
* Dispatch Board unit type and status visual badges
* Dispatch Board double-click to advance unit status
* Dispatch Board resizable Open Calls column
* Dispatch Board assigned call panel with current/queued distinction
* Dispatch Board completed calls at bottom with strikethrough

Extracted Crew Planner components:

* PatientOrderSection
* UnassignedEmployeesCard
* PlannedUnitsList
* CrewPresetsSection

Remaining frontend targets:

* Reorder assigned calls within a unit
* Cancelled / no-show / refused outcomes on dispatch board
* Additional Crew Planner component cleanup
* Shared generic drawer component
* Functional sidebar collapse
* Functional notification system
* More dashboard widgets

## Roadmap

## Priority 1 — Dispatch Board Refinements ← current

* Reorder assigned calls (move up / move down)
* Cancelled / no-show / refused call outcomes
* Reason capture for non-completed outcomes
* Call status timestamp recording (en route at, arrived at, etc.)
* Service mismatch flag persistence
* Warning indicator on assigned call row

## Priority 2 — Security and Backend Enforcement

* JWT authentication
* Backend permission middleware
* Audit logging
* Route protection
* Security hardening
* Backend role enforcement
* HR backend permission enforcement
* Patient data access restrictions

## Priority 3 — Infrastructure

* PostgreSQL migration
* Docker support
* Docker Compose deployment
* Backup strategy
* Production-ready environment configuration

## Additional Planned Improvements

### Authentication and Roles

* JWT or secure session-based authentication
* Backend permission checks
* Role-specific API restrictions
* Audit trail for sensitive actions

### UI / UX

* Shared drawer component
* Shared page panel components
* Improved mobile layout
* Functional sidebar collapse
* Functional topbar search
* Functional notifications
* More dashboard widgets
* Better print layout
* More compact operator-focused screens

### Call Taking Form Evolution

* More advanced guided step validation
* Call type templates
* Better autocomplete
* Better trip duplication workflow
* More structured return ride workflow
* Billing estimate persistence
* Emergency workflow expansion
* Emergency-specific validation or checklist

### Workforce and Scheduling

* Shift scheduling
* Employee availability tracking
* Staffing analytics
* Certification alerts
* Scheduling automation
* Employee warnings
* HR document tracking
* Employee file attachments

### Crew System Expansion

* Ambulance unit definitions
* Dynamic staffing templates
* Additional unit types
* Crew recommendations
* Auto-fill available crew slots
* Better conflict resolution

### Patient Operations

* Patient flags
* Cancellation tracking
* No-show tracking
* False call tracking
* Reliability metrics
* Operational history
* Patient risk score
* Patient notes and alerts
* Duplicate patient merge workflow

### Backend and Security

* PostgreSQL migration
* Docker support
* Docker Compose deployment
* Secure session handling
* Database normalization
* Backup strategy
* Audit logging
* API authorization middleware
* Backend validation for protected workflows
* Backend permission enforcement by role

### Advanced Future Features

* Offline mode
* PWA support
* Electron desktop application
* SMTP integration
* PDF generation
* Notifications
* Dashboard widgets
* Reporting exports
* Advanced analytics
* Multi-organization support

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

## Current Status

MVP status:

```text
Functional
```

Current implemented workflow:

```text
Authentication
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
Patient Management
↓
Call History
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
```

Recently completed:

* Dispatch Board live operational interface
* CallAssignment backend model and routes
* Drag-and-drop call-to-unit assignment
* Unit dispatch status tracking and progression
* Double-click unit row to advance status
* Return ride displayed as two independent trip slots (Outbound + Return)
* Calls sorted by pickup time on Dispatch Board
* Current call vs queued call visual distinction in unit panel
* Completed calls at bottom of unit panel with strikethrough
* Done button to complete active assignments
* Resizable Open Calls column on Dispatch Board
* Driver eligibility fix: Driver role accepted in addition to EVOC certification
* Crew Planner drawer unsaved changes confirmation
* Return ride address auto-fill on toggle and address change

## Long-Term Direction

The long-term goal is to evolve EMS Workflow System into a modular operational platform capable of supporting:

* EMS operations
* Medical transportation
* Logistics
* Staff management
* Scheduling
* Dispatch operations
* Operational coordination
* Supervisor analytics
* Quality improvement
* Continuity workflows

Future deployment targets:

* Docker
* Docker Compose
* PostgreSQL
* Self-hosted environments
* Cloud environments

## Author

Created by Aleh Sitsko
Built from real EMS dispatch experience.
Made by an EMD for EMDs.
