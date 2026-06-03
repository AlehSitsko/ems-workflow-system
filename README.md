EMS Workflow System
Overview

EMS Workflow System is a modular operational platform designed to support EMS organizations with workforce management, crew planning, dispatcher workflows, operational continuity, and administrative oversight.

The system is designed as an operational support platform rather than a replacement for primary dispatch software.

Primary objectives:

Dispatcher workflow support
Workforce management
Crew planning and staffing
Operational continuity
Supervisor oversight and analytics
Structured operational record keeping
Training and quality improvement

The platform is intended to remain useful during:

Normal operations
Temporary software outages
Communication disruptions
Workflow failures
High-volume operational periods
Core Goals
Fast and reliable call intake
Structured dispatcher workflows
Crew planning and staffing support
Employee and certification management
Operational continuity
Supervisor oversight
Quality tracking
Workforce analytics
Modular architecture
Future scalability
Technology Stack
Frontend
React
Vite
JavaScript (ES6+)
Bootstrap
Backend
Python
Flask
Flask Blueprints
Flask-CORS
SQLAlchemy
Database
Current
SQLite
Planned
PostgreSQL
Current Architecture

ems-workflow-system/

backend/

app.py
models.py
routes/
auth_routes.py
employee_routes.py
crew_routes.py
crew_preset_routes.py
patient_routes.py
call_routes.py
analytics_routes.py
utils/

frontend/

src/
api/
components/
pages/
styles/

README.md

Authentication System
Current Roles
admin
supervisor
dispatcher
hr
Current Features
Login system
Role-aware navigation
Protected frontend routes
User management
Dispatcher identity tracking
Session persistence (MVP)
Role Access
Admin

Full system access.

Can access:

Users
Employees
Crew Planner
Crew Presets
Patients
Calls
Analytics
Administration
Supervisor

Operational and management access.

Can access:

Employees
Crew Planner
Crew Presets
Patients
Calls
Analytics
Dispatcher

Operational workflow access.

Can access:

Call Taking Form
Patients
Calls
Operational workflows
HR

Workforce management access.

Can access:

Employees
Crew Planner
Crew Presets
Staffing information

Cannot access:

Patients
Calls
Call Taking Form
Patient analytics
Protected PHI-related information
Current Modules
Call Taking Form

Features:

EMS intake workflow
Structured call capture
Dispatcher assignment
Call quality tracking
Future patient linking
Patients

Features:

Create patients
Edit patients
Search patients
Date of birth lookup
Future call linkage
Calls

Features:

Global call history
Quality tracking
Dispatcher filtering
Operational auditing
Employees

Features:

Employee management
Certification tracking
Operational status tracking
Workforce administration
Crew Planner

Features:

Daily crew planning
Certification validation
Conflict detection
Crew assignment persistence
Staffing validation
Crew Presets

Features:

Reusable crew templates
Rapid staffing workflows
Standardized crew configurations
Supervisor Dashboard

Features:

Dispatcher analytics
Quality tracking
Missing field reporting
Operational metrics
User Management

Features:

Create users
Edit users
Activate accounts
Deactivate accounts
Role assignment
Crew Validation Rules
Driver

Requirements:

Active employee
Active operational status
EVOC certification
BLS Medical

Requirements:

EMT certification

OR

Paramedic certification
ALS Medical

Requirements:

Paramedic certification
Assist Roles

Requirements:

Active employee
Active operational status
Backend API
Authentication
POST /api/auth/login
GET /api/auth/users
POST /api/auth/users
PUT /api/auth/users/
PATCH /api/auth/users//toggle-active
Employees
GET /api/employees
POST /api/employees
PUT /api/employees/
DELETE /api/employees/
Patients
GET /api/patients
POST /api/patients
GET /api/patient/
PUT /api/patient/
DELETE /api/patient/
Calls
GET /api/calls
POST /api/calls
Crew Planner
GET /api/crew-units
POST /api/crew-units
PUT /api/crew-units/
DELETE /api/crew-units/
Crew Presets
GET /api/crew-presets
POST /api/crew-presets
PUT /api/crew-presets/
DELETE /api/crew-presets/
Analytics
GET /api/analytics/dispatchers
Installation
Backend
cd backend

python -m venv venv

pip install -r requirements.txt

python app.py

Backend runs on:

http://127.0.0.1:5050
Frontend
cd frontend

npm install

npm run dev

Frontend runs on:

http://localhost:5173
Development Workflow
Branch Strategy
main = stable branch
dev = development branch

Development should occur in dev first.

After testing:

dev
→
main
Current Development Direction

Current focus areas:

Frontend architecture refactoring
Component decomposition
Crew Planner modularization
Role-based access expansion
Docker preparation
Security improvements
Frontend Refactor Progress

Completed:

PatientOrderSection extracted
UnassignedEmployeesCard extracted
PlannedUnitsList extracted
CrewPresetsSection extracted

Remaining major target:

CrewAssignmentSection
Roadmap
High Priority
JWT authentication
Backend permission middleware
Audit logging
Route protection
Security hardening
Authentication & Roles
HR frontend implementation
HR backend permission enforcement
Role-specific navigation
Module visibility restrictions
Patient data access restrictions
UI / UX
Wide-screen redesign
Better form organization
Improved visual hierarchy
Mobile optimization
Call Taking Form Evolution
Classic Mode

Current workflow:

Full form visible
Dispatcher enters information manually
Guided Mode

Future workflow:

Start Taking Call button
Step-by-step intake process
Patient search by:
DOB
Last Name
Phone Number
Automatic patient autofill
New patient creation workflow
Training-friendly experience
Workforce & Scheduling
Shift scheduling
Employee availability tracking
Staffing analytics
Certification alerts
Scheduling automation
Crew System Expansion
Ambulance unit definitions
Dynamic staffing templates
Additional unit types
Crew recommendations
Unit status tracking
Patient Operations
Patient flags
Cancellation tracking
No-show tracking
Reliability metrics
Operational history
Backend & Security
PostgreSQL migration
Docker support
Docker Compose deployment
Secure session handling
Database normalization
Backup strategy
Advanced Future Features
Offline mode
PWA support
Electron desktop application
SMTP integration
PDF generation
Notifications
Dashboard widgets
This System IS
An EMS workflow platform
A dispatcher support platform
A workforce management platform
A staffing platform
A crew planning platform
An operational continuity platform
This System IS NOT
A replacement for primary dispatch software
An EMR platform
A hospital management system
A clinical documentation system
Current Status
MVP Status

Functional.

Current implemented workflow:

Authentication

↓

Role-Based Navigation

↓

Call Intake

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

Long-Term Direction

The long-term goal is to evolve EMS Workflow System into a modular operational platform capable of supporting:

EMS
Medical transportation
Logistics
Workforce management
Scheduling
Dispatch operations
Operational coordination
Supervisor analytics

Future deployment targets:

Docker
PostgreSQL
Self-hosted environments
Cloud environments
Author

Aleh Sitsko