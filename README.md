# EMS Workflow System

## Overview

EMS Workflow System is a modular operational platform designed to support EMS and medical transportation organizations with dispatcher workflows, patient records, employee management, crew planning, operational continuity, and supervisor oversight.

The system is designed as an operational support platform. It is not intended to replace primary dispatch software, EMR systems, or clinical documentation systems.

## Primary Objectives

* Fast and reliable call intake
* Structured dispatcher workflows
* Patient record lookup and management
* Employee and certification management
* Daily crew planning
* Crew preset workflows
* Role-based access control
* Supervisor analytics
* Call quality tracking
* Operational continuity during workflow disruptions
* Modular architecture for future expansion

The platform is intended to remain useful during normal operations, temporary software outages, communication disruptions, workflow failures, and high-volume operational periods.

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
* Trip details
* Return ride support
* Service level selection
* Call quality scoring
* Missing critical field detection
* Missing optional field detection
* Required dispatcher explanation when critical information is missing
* Backend call persistence
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
* Trip details step
* Review and save step
* Call quality review before saving
* Required explanation for missing critical information
* Backend call persistence

Planned improvements:

* Create new patient directly from Guided Intake
* Automatic patient creation during intake
* More advanced step validation
* Better dispatcher training flow
* Optional guided templates by call type

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
* Patient data used by call intake workflows

## Calls

The Calls module provides global call history and operational auditing.

Current features:

* Global call history
* Compact call cards
* Date filtering
* Dispatcher filtering
* Minimum quality score filtering
* Maximum quality score filtering
* Today shortcut
* Load all shortcut
* Expandable call details
* Quality score badges
* Missing critical field tracking
* Missing optional field tracking
* Dispatcher explanation review
* Operational notes review

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
* Caller Type
* Service Level
* Additional Information

### Quality Score

The current scoring model uses:

* Critical fields: 70% of total score
* Optional fields: 30% of total score

The score is saved with each call record.

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

## Current Development Direction

Current focus areas:

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
* Employees page redesign
* Employee add/edit drawer
* Calls page compact list
* Crew Planner planned unit cards
* Crew Planner create/edit drawer
* Unassigned employee chips
* Role color badges
* Classic Call Form visual redesign
* Guided Call Intake workflow
* Patient lookup drawer
* Price Calculator visual redesign

Extracted Crew Planner components:

* PatientOrderSection
* UnassignedEmployeesCard
* PlannedUnitsList
* CrewPresetsSection

Remaining frontend targets:

* Additional Crew Planner component cleanup
* Shared generic drawer component
* Shared form section component
* Better mobile sidebar behavior
* Functional sidebar collapse
* Functional notification system
* More dashboard widgets

## Roadmap

## High Priority

* JWT authentication
* Backend permission middleware
* Audit logging
* Route protection
* Security hardening
* Backend role enforcement
* PostgreSQL migration
* Docker support
* Docker Compose deployment

## Authentication and Roles

Planned improvements:

* JWT or secure session-based authentication
* Backend permission checks
* Role-specific API restrictions
* HR backend permission enforcement
* Patient data access restrictions
* Audit trail for sensitive actions

## UI / UX

Planned improvements:

* Shared drawer component
* Shared page panel components
* Improved mobile layout
* Functional sidebar collapse
* Functional topbar search
* Functional notifications
* More dashboard widgets
* Better print layout
* More compact operator-focused screens

## Call Taking Form Evolution

Planned improvements:

* Add new patient directly from Guided Intake
* More advanced guided step validation
* Call type templates
* Better autocomplete
* Better trip duplication workflow
* More structured return ride workflow
* Call status tracking

## Workforce and Scheduling

Planned improvements:

* Shift scheduling
* Employee availability tracking
* Staffing analytics
* Certification alerts
* Scheduling automation
* Employee warnings
* HR document tracking
* Employee file attachments

## Crew System Expansion

Planned improvements:

* Ambulance unit definitions
* Dynamic staffing templates
* Additional unit types
* Crew recommendations
* Unit status tracking
* Unit availability tracking
* Auto-fill available crew slots
* Better conflict resolution

## Patient Operations

Planned improvements:

* Patient flags
* Cancellation tracking
* No-show tracking
* False call tracking
* Reliability metrics
* Operational history
* Patient risk score
* Patient notes and alerts

## Backend and Security

Planned improvements:

* PostgreSQL migration
* Docker support
* Docker Compose deployment
* Secure session handling
* Database normalization
* Backup strategy
* Audit logging
* API authorization middleware

## Advanced Future Features

Possible long-term features:

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
* An EMR platform
* A hospital management system
* A clinical documentation system
* A billing system
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
Supervisor Analytics
```

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

Aleh Sitsko
