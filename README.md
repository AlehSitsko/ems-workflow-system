# EMS Workflow System

## Overview

EMS Workflow System is a modular operational platform designed to support EMS and medical transportation organizations with dispatcher workflows, patient records, employee management, crew planning, operational continuity, supervisor oversight, and structured operational record keeping.

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
* Role-based access control
* Supervisor analytics
* Call quality tracking
* Operational call status tracking
* Operational continuity during workflow disruptions
* Modular architecture for future dispatch board expansion

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
│   ├── routes/
│   │   ├── auth_routes.py
│   │   ├── employee_routes.py
│   │   ├── crew_routes.py
│   │   ├── crew_preset_routes.py
│   │   ├── patient_routes.py
│   │   ├── call_routes.py
│   │   └── analytics_routes.py
│   └── utils/
│
├── frontend/
│   ├── src/
│   │   ├── api/
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
* Start Taking Call shortcut for call-taking roles
* Module cards
* Responsive layout foundation

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
* Patient search by:

  * Date of birth
  * Last name
  * Phone number

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

Planned improvements:

* More advanced guided step validation
* Better dispatcher training flow
* Optional guided templates by call type
* Improved autocomplete
* More structured return ride workflow

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
* Future live dispatch execution should be handled by the planned Dispatch Board module, not by expanding Calls History into a live dispatch screen.

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
* Certification tracking
* CPR tracking
* EVOC tracking
* EMT tracking
* Paramedic tracking
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
* Planned units shown as primary working view
* Unassigned employee list
* Employee role badges
* Unit type selection
* Truck number
* Start time
* Driver assignment
* Medical assignment
* Assist assignment
* Patient order tracking
* Next patient list
* Certification validation
* Conflict detection
* CPR warnings
* Crew preset support
* Backend persistence

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
* EVOC certification

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
* Quality score should not be a primary field on the future live Dispatch Board screen.

## Backend Data Model Highlights

### Call

The Call model currently supports:

* Linked patient ID
* Dispatcher name
* Received timestamp
* Operational status
* Date of call
* Trip date
* Pickup time
* Appointment time
* Pickup address
* Dropoff address
* Caller type
* Call type
* Service level
* Quality score
* Missing critical fields
* Missing optional fields
* Missing information explanation
* Notes

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

### Planned CallAssignment

The future Dispatch Board should use a separate assignment model instead of overloading the Call model.

Planned fields:

* Call ID
* Crew unit ID
* Assignment date
* Sequence order
* Assignment status
* Assigned timestamp
* En route timestamp
* Arrived pickup timestamp
* Patient onboard timestamp
* Arrived destination timestamp
* Completed timestamp
* Cancelled timestamp
* Cancel / no-show / refused reason
* Service mismatch flag
* Service mismatch note
* Assignment notes

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

### Planned Dispatch Board API

```text
GET     /api/dispatch-board?date=<YYYY-MM-DD>
POST    /api/dispatch-assignments
PATCH   /api/dispatch-assignments/<assignment_id>/status
PATCH   /api/dispatch-assignments/<assignment_id>/unit
PATCH   /api/dispatch-assignments/reorder
DELETE  /api/dispatch-assignments/<assignment_id>
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

If a new backend model field is added to an existing table, the local SQLite database may require a manual schema update or database reset during development.

Recent schema additions:

```text
call.appointment_time
call.received_at
call.status
```

Example local SQLite update:

```python
from app import app
from models import db
from sqlalchemy import text

with app.app_context():
    columns = db.session.execute(
        text("PRAGMA table_info('call')")
    ).fetchall()

    existing_columns = [column[1] for column in columns]

    if "appointment_time" not in existing_columns:
        db.session.execute(
            text("ALTER TABLE call ADD COLUMN appointment_time VARCHAR(20)")
        )

    if "received_at" not in existing_columns:
        db.session.execute(
            text("ALTER TABLE call ADD COLUMN received_at VARCHAR(50)")
        )

    if "status" not in existing_columns:
        db.session.execute(
            text("ALTER TABLE call ADD COLUMN status VARCHAR(50) DEFAULT 'new'")
        )

    db.session.execute(
        text("UPDATE call SET status = 'new' WHERE status IS NULL OR status = ''")
    )

    db.session.commit()
```

If the column already exists, SQLite may return a duplicate column error. That means the schema was already updated.

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

* Dispatch Board planning and implementation
* Operational call assignment workflow
* Drag-and-drop call-to-unit assignment
* Inline assignment status updates
* Unit-based operational workflow
* Frontend interface redesign
* Component decomposition
* Guided call intake workflow
* Role-based access expansion
* Crew Planner workflow improvements
* Employee and patient drawer workflows
* Security improvements
* Docker preparation
* Future backend permission middleware

## Frontend Refactor Progress

Completed:

* Sidebar layout
* Topbar layout
* Dashboard redesign
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
* Unassigned employee chips
* Role color badges
* Classic Call Form visual redesign
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

Extracted Crew Planner components:

* PatientOrderSection
* UnassignedEmployeesCard
* PlannedUnitsList
* CrewPresetsSection

Remaining frontend targets:

* Dispatch Board page
* Dispatch Board compact table-based UI
* Dispatch Board drag-and-drop call assignment
* Dispatch Board inline status updates
* Additional Crew Planner component cleanup
* Shared generic drawer component
* Shared form section component
* Better mobile sidebar behavior
* Functional sidebar collapse
* Functional notification system
* More dashboard widgets

## Dispatch Board Design Plan

The next major feature is a dedicated Dispatch Board.

The Dispatch Board should be separate from Calls History.

### Purpose

Calls History is for:

* Audit
* Historical review
* Call quality review
* Supervisor review
* Filtering and reporting

Dispatch Board is for:

* Live operational assignment
* Dispatch execution
* Unit tracking
* Call-to-unit assignment
* Status progression
* Operational awareness

### Approved UI Direction

The Dispatch Board should be inspired by compact legacy ambulance dispatch software, but styled with the modern EMS Workflow System interface.

The screen should use compact, table-based work zones instead of large dashboard cards.

### Main Layout

The Dispatch Board should have three main areas:

```text
1. Open Calls
2. Vehicle Listing
3. Selected Call / Trip Details
```

### Open Calls

Open Calls should display unassigned calls for the selected day.

Design rules:

* Compact rows
* Table-like layout
* Minimal information only
* Calls should be draggable
* No quality score display
* No large cards
* No permanent action-heavy buttons

Recommended visible fields:

* Priority / emergency marker
* Call type or service level
* Pickup time
* Trip number or call ID
* Patient / call name
* Pickup address
* Pickup city
* Dropoff address or short destination

### Vehicle Listing

Vehicle Listing should be the main operational work area.

Design rules:

* Vehicles should be visible as compact rows or compact expandable panels
* Each vehicle should be a drop target
* Calls should be dragged directly onto the vehicle
* Assigned calls should appear inside the selected or expanded vehicle
* There should not be a separate permanent Assigned Calls zone
* Clicking a vehicle should reveal its assigned calls
* Vehicle rows should show only essential unit information

Recommended visible vehicle fields:

* Unit number
* Status
* Unit type
* Current area or location
* Crew member 1
* Crew member 2
* Crew member 3
* Assigned call count
* Warning count

### Assigned Calls Inside Vehicle

Assigned calls should appear inside the selected or expanded vehicle.

Design rules:

* Compact rows
* Inline status control
* No large call cards
* No quick action side panel
* Status should be changeable directly from the assigned call row
* Status dropdown or compact next-status button is preferred

Recommended visible fields:

* Sequence order
* Pickup time
* Patient / call name
* Pickup address
* Dropoff address
* Current status
* Warning indicator if service mismatch exists

### Selected Call / Trip Details

Trip details should only include dispatcher-relevant operational information.

Do not show:

* Quality score
* Missing critical fields
* Missing optional fields
* Quality explanation
* Billing-heavy details
* Supervisor audit details
* Non-operational analytics

Recommended dispatcher-relevant details:

* Pickup address
* Pickup city / state / ZIP
* Pickup phone
* Apartment / room / facility
* Dropoff address
* Dropoff city / state / ZIP
* Dropoff phone
* Facility / destination
* Pickup time
* Appointment time
* Requested time
* Return ride / will-call information
* Service level
* Priority
* Transport type
* Assigned unit
* Current dispatch status
* Dispatcher notes
* Special instructions

### Drag-and-Drop Assignment

Primary assignment flow:

```text
Open call row → drag onto vehicle row → assignment saved
```

Expected behavior:

* Call disappears from Open Calls after assignment
* Call appears under the selected or expanded vehicle
* Vehicle call count updates
* Assignment order is saved
* Call status changes from new to assigned

### Service Mismatch Handling

Service mismatch should warn but not block.

Example:

```text
ALS call assigned to BLS unit
```

Expected behavior:

* Show warning before assignment
* Allow user to continue
* Save mismatch flag
* Save mismatch note
* Display small warning indicator on the assigned call row
* Display warning count on the vehicle row

### Status Progression

Planned operational statuses:

```text
new
assigned
en_route
arrived_pickup
patient_onboard
arrived_destination
completed
cancelled
no_show
refused
```

Suggested visible labels:

```text
New
Assigned
En Route
Arrived Pickup
Patient Onboard
Arrived Destination
Completed
Cancelled
No Show
Refused
```

### Status Update UX

Status should be changed directly on the assigned call row inside the vehicle.

Preferred options:

* Small status dropdown
* Compact "Next" button
* Context menu on assigned call row

Avoid:

* Large quick action panels
* Permanent status button groups
* Too many visible action buttons

### Implementation Notes

Recommended frontend library:

```text
@dnd-kit/core
@dnd-kit/sortable
@dnd-kit/utilities
```

Recommended first UI version:

* No drag reorder at first
* Drag from Open Calls to Vehicle Listing first
* Add reorder later through sequence_order
* Add drag reorder after the basic assignment workflow is stable

## Roadmap

## Priority 1 — Dispatch Board Foundation

* Create CallAssignment model
* Add Dispatch Board backend routes
* Register dispatch routes in Flask app
* Add frontend dispatch API
* Add Dispatch Board route and sidebar navigation
* Add role access for admin, supervisor, and dispatcher
* Exclude HR from Dispatch Board access
* Build initial Dispatch Board page shell
* Load selected date
* Load open calls for selected date
* Load vehicle listing from Crew Planner units
* Display assigned calls inside selected or expanded vehicle rows

## Priority 2 — Drag-and-Drop Assignment

* Install and configure dnd-kit
* Make open calls draggable
* Make vehicle rows droppable
* Assign call by dragging it onto a vehicle
* Save CallAssignment
* Update Call.status to assigned
* Remove assigned call from Open Calls
* Add assigned call under vehicle
* Save sequence order
* Refresh board after assignment

## Priority 3 — Status Tracking

* Add inline status control inside assigned call rows
* Update assignment status
* Sync Call.status with assignment status
* Save status timestamps
* Add status progression logic
* Add cancelled / no-show / refused outcomes
* Add reason capture for cancelled / no-show / refused

## Priority 4 — Service Mismatch Warnings

* Compare call service level with vehicle unit type
* Show mismatch confirmation before assignment
* Allow assignment anyway
* Save mismatch flag
* Save mismatch note
* Show warning indicator on assigned call row
* Show warning count on vehicle row

## Priority 5 — Dispatch Board Details Panel

* Show dispatcher-relevant trip details only
* Remove quality score from Dispatch Board details
* Remove missing field analysis from Dispatch Board details
* Remove supervisor audit fields from Dispatch Board details
* Add pickup/dropoff/phone/facility/schedule/status/notes
* Add selected vehicle details when vehicle is clicked
* Keep full quality/audit details in Calls History and Supervisor Dashboard

## Priority 6 — Reorder Assigned Calls

* Add move up / move down buttons
* Save sequence_order
* Add drag reorder later after base dispatch workflow is stable

## Priority 7 — Security and Backend Enforcement

* JWT authentication
* Backend permission middleware
* Audit logging
* Route protection
* Security hardening
* Backend role enforcement
* HR backend permission enforcement
* Patient data access restrictions

## Priority 8 — Infrastructure

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
* Unit status tracking
* Unit availability tracking
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
Call Intake
↓
Guided Intake
↓
Duplicate Patient Prevention
↓
Automatic Patient Creation
↓
Patient Management
↓
Call History
↓
Received Timestamp Tracking
↓
Initial Call Status Tracking
↓
Employee Management
↓
Crew Planning
↓
Crew Presets
↓
Supervisor Analytics
```

Recently completed:

* Automatic patient creation during call intake
* Duplicate patient prevention during Classic Call Form submission
* Duplicate patient prevention during Guided Intake save
* Appointment Time field for calls
* Appointment Time display in call history
* Received timestamp field for calls
* Initial call status field for calls
* Status display in Calls History
* Status filter in Calls History
* Empty Classic Call save protection
* Empty Guided Call save protection
* Unsaved patient drawer close confirmation
* Waiting Time Fee support in Price Calculator
* Emergency service level in Classic Call Form
* Emergency service level in Guided Intake
* Emergency badge display in Call History
* Emergency call count summary
* Dispatch Board visual and workflow planning
* Dispatch Board drag-and-drop assignment concept
* Dispatch Board compact RescueNet-inspired layout direction

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
