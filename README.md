# EMS Workflow System

## Overview

EMS Workflow System is a modular operational platform designed for EMS organizations as a:

- Dispatcher support platform
- Workforce management platform
- Crew planning and staffing system
- Supervisor oversight and analytics platform
- Operational continuity and redundancy solution
- Structured operational data platform

The system is designed to support EMS operations during:

- Normal operational flow
- Software outages
- Communication disruptions
- Temporary workflow failures
- Operational overload situations

This project is **not intended to replace primary EMS dispatch or patient care software**.

Instead, it acts as an operational support, workflow, staffing, and continuity platform.

---

# Core Goals

- Fast and reliable call intake
- Structured dispatcher workflows
- Operational continuity during outages
- Dispatcher accountability
- Supervisor oversight
- Crew planning and staffing support
- Patient lookup and operational history
- Certification and staffing validation
- Modular scalable architecture
- Future-ready backend infrastructure

---

# Tech Stack

## Frontend

- React (Vite)
- JavaScript (ES6+)
- Bootstrap

## Backend

- Python
- Flask
- Flask Blueprints
- Flask-CORS
- SQLAlchemy

## Database

### Current
- SQLite

### Planned
- PostgreSQL

---

# Current Architecture

ems-workflow-system/

- backend/
  - app.py
  - models.py
  - routes/
    - auth_routes.py
    - employee_routes.py
    - crew_routes.py
    - crew_preset_routes.py
    - patient_routes.py
    - call_routes.py
    - analytics_routes.py
  - utils/
- frontend/
  - src/
    - api/
    - components/
    - pages/
- README.md

---

# Authentication System

## Current Roles

- admin
- supervisor
- dispatcher
- hr

## Features

- Login system
- Role-aware navigation
- Protected frontend routes
- User management
- Dispatcher identity tracking
- Session persistence (MVP)

---

# Role Access

## Admin

- Full system access

## Supervisor

- Operational access
- Analytics access
- Employee oversight

## Dispatcher

- Call intake
- Patients
- Calls
- Operational workflows

## HR

Can access:

- Employees
- Crew Planner
- Crew Presets
- Workforce-related information

Cannot access:

- Patients
- Calls
- Call Taking Form
- Patient analytics
- Protected PHI-related information

---

# Current Modules

## Call Taking Form

Features:

- Full EMS intake workflow
- Patient search and linking
- Structured call storage
- Quality scoring
- Dispatcher assignment

## Patients

Features:

- Create patients
- Edit patients
- Search by name
- Search by DOB
- Patient-call linkage

## Calls

Features:

- Global call history
- Quality filtering
- Dispatcher filtering
- Operational auditing

## Employees

Features:

- Employee management
- Certification tracking
- Operational status tracking
- Workforce management

## Crew Planner

Features:

- Daily crew planning
- Certification validation
- Conflict detection
- Crew assignment persistence

## Crew Presets

Features:

- Reusable crew templates
- Rapid staffing workflows

## Supervisor Dashboard

Features:

- Dispatcher analytics
- Quality tracking
- Missing field analysis

## User Management

Features:

- Create users
- Edit users
- Activate/deactivate accounts
- Role assignment

---

# Crew Validation Rules

## Driver

Requires:

- Active employee
- Active operational status
- EVOC certification

## BLS Medical

Requires:

- EMT certification

## ALS Medical

Requires:

- Paramedic certification

## Assist

Allows:

- Any operationally active employee

---

# Backend API

## Authentication

- POST /api/auth/login
- GET /api/auth/users
- POST /api/auth/users
- PUT /api/auth/users/<id>
- PATCH /api/auth/users/<id>/toggle-active

## Patients

- GET /api/patients
- POST /api/patients
- GET /api/patient/<id>
- PUT /api/patient/<id>
- DELETE /api/patient/<id>

## Calls

- GET /api/calls
- POST /api/calls

## Employees

- GET /api/employees
- POST /api/employees
- PUT /api/employees/<id>
- DELETE /api/employees/<id>

## Crew Planner

- GET /api/crew-units
- POST /api/crew-units
- PUT /api/crew-units/<id>
- DELETE /api/crew-units/<id>

## Crew Presets

- GET /api/crew-presets
- POST /api/crew-presets
- PUT /api/crew-presets/<id>
- DELETE /api/crew-presets/<id>

## Analytics

- GET /api/analytics/dispatchers

---

# Installation

## Backend

```bash
cd backend
python -m venv venv
pip install -r requirements.txt
python app.py
```

Runs on:

http://127.0.0.1:5050

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on:

http://localhost:5173

---

# Development Workflow

## Branches

- main = stable branch
- dev = development branch

---

# Current Development Direction

- Frontend architecture refactoring
- Component decomposition
- Guided workflow interfaces
- Dual-mode call intake system
- Workforce management expansion
- Scheduling expansion
- Security hardening

---

# Roadmap

## High Priority

- JWT authentication
- Permission middleware
- Audit logging
- Route protection
- Frontend refactor

## Authentication & Roles Expansion

- HR role implementation
- Role-specific module visibility
- Backend role permissions
- Restrict patient data access

## UI / UX

- Wide-screen redesign
- Better form organization
- Improved visual hierarchy
- Mobile optimization

## Call Intake Evolution

- Classic Call Intake Mode
- Guided Step-by-Step Call Intake Mode
- Start Taking Call workflow
- Patient lookup by DOB, phone, and last name
- Automatic patient autofill
- New patient creation workflow
- Training-friendly workflow

## Workforce & Scheduling

- Shift scheduling
- Employee availability tracking
- Staffing analytics
- Certification alerts
- Scheduling automation

## Crew System Expansion

- Ambulance unit definitions
- Dynamic staffing templates
- Additional unit types
- Autofill empty crew slots
- Unit status tracking

## Patient Operations Expansion

- Patient flags
- Cancellation tracking
- No-show tracking
- Reliability metrics

## Backend & Security

- PostgreSQL migration
- Secure session handling
- Docker containerization
- Docker Compose deployment
- Database normalization
- Backup strategy

## Advanced Future Features

- Offline mode
- PWA support
- Electron desktop version
- SMTP integration
- PDF export
- Notifications
- Dashboard widgets

---

# This System IS

- An EMS workflow platform
- A dispatcher support system
- A workforce management platform
- A crew planning platform
- An operational continuity platform

# This System IS NOT

- A replacement for primary EMS dispatch software
- A full Electronic Medical Record (EMR) platform
- A hospital management system
- A clinical documentation system

---

# Current Status

## MVP Status

Functional.

Implemented flow:

Authentication
→ Role-Based Navigation
→ Call Intake
→ Quality Tracking
→ Patient Management
→ Call History
→ Employee Management
→ Crew Planning
→ Crew Presets
→ Supervisor Analytics

---

# Long-Term Direction

The long-term goal is to evolve EMS Workflow System into a modular operational platform capable of supporting:

- EMS
- Medical transport
- Logistics
- Staffing
- Scheduling
- Dispatch operations
- Workforce coordination
- Supervisor analytics

Future deployment targets:

- Docker
- PostgreSQL
- Self-hosted environments
- Cloud deployments

---

# Author

Aleh Sitsko
