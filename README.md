# EMS Workflow System

## Overview

EMS Workflow System is a modular EMS operational platform designed as a:

* Backup EMS workflow system
* Dispatcher support platform
* Operational redundancy layer
* Crew planning and staffing system
* Supervisor analytics platform
* Structured operational data platform

The system is intentionally designed to support EMS operations during:

* normal operational flow,
* software outages,
* communication disruptions,
* temporary workflow failures,
* operational overload situations.

This project is NOT intended to replace primary EMS software such as RescueNet.

Instead, it acts as an operational support and continuity platform.

---

# Core Goals

* Fast and reliable call intake
* Structured dispatcher workflows
* Operational continuity during outages
* Dispatcher accountability
* Supervisor oversight
* Crew planning and staffing support
* Patient lookup and operational history
* Certification and staffing validation
* Modular scalable architecture
* Future-ready backend infrastructure

---

# Tech Stack

## Frontend

* React (Vite)
* JavaScript (ES6+)
* Bootstrap

## Backend

* Python
* Flask
* Flask Blueprints
* Flask-CORS
* SQLAlchemy

## Database

### Current

* SQLite

### Planned

* PostgreSQL

---

# Current Architecture

ems-workflow-system/
│
├── backend/
│   ├── app.py
│   ├── models.py
│   ├── requirements.txt
│   │
│   ├── routes/
│   │   ├── auth_routes.py
│   │   ├── employee_routes.py
│   │   ├── crew_routes.py
│   │   ├── crew_preset_routes.py
│   │   ├── patient_routes.py
│   │   ├── call_routes.py
│   │   └── analytics_routes.py
│   │
│   └── utils/
│       └── employee_utils.py
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   └── main.jsx
│
└── README.md

---

# Current Backend Architecture

The backend has been refactored from a single large `app.py` file into a cleaner modular Flask Blueprint structure.

## Backend Entry Point

`app.py` is now responsible for:

* Flask app initialization
* CORS setup
* Database configuration
* Blueprint registration
* Health check routes
* Default user creation
* Database initialization

## Backend Routes

Route logic is separated into dedicated route modules:

* `auth_routes.py`
* `employee_routes.py`
* `crew_routes.py`
* `crew_preset_routes.py`
* `patient_routes.py`
* `call_routes.py`
* `analytics_routes.py`

## Backend Utilities

Shared helper logic is moved into utility files:

* `employee_utils.py`

Current utility logic includes:

* Employee data normalization
* License/certification data normalization
* Optional employee ID parsing

This keeps backend code more maintainable and prepares the project for future expansion without overengineering.

---

# Current Implemented Systems

# Authentication System

The application includes a foundational authentication and role system.

## Current Roles

* admin
* supervisor
* dispatcher

## Features

* Login system
* Protected routes
* Role-aware homepage navigation
* Module visibility by role
* Supervisor-only dashboard access
* Dispatcher identity tracking
* localStorage session persistence (MVP stage)
* Automatic dispatcher assignment to calls

---

# Home Page / Module System

The application uses a centralized operational homepage.

## Features

* Role-aware module visibility
* Operational navigation hub
* Future modular expansion support
* Centralized workflow access

## Current Modules

* Call Form
* Patients
* Calls
* Employees
* Crew Planner
* Supervisor Dashboard
* User Management
* User Manual

---

# Call Taking Form

## Features

* Full EMS call intake workflow
* Patient search and linking
* Return ride logic
* Service level selection
* Structured call storage
* Automatic dispatcher assignment
* Call quality analysis

---

# Call Quality Control System

The system includes structured quality tracking for every call.

## Critical Fields

Critical fields currently include:

* First Name
* Last Name
* Date of Birth
* Pick Up Address

## Optional Fields

Optional fields currently include:

* Phone Number
* Drop Off Address
* Trip Date
* Pickup Time
* Caller Type
* Service Level
* Additional Information

## Quality Score Logic

### Score Distribution

* Critical fields = 70%
* Optional fields = 30%

### Current Features

* Real-time quality scoring
* Missing critical field detection
* Missing optional field tracking
* Required explanation for incomplete calls
* Structured quality data storage
* Dispatcher-linked quality analytics

---

# Patients Module

## Features

* Create patients
* Edit patients
* Search by name
* Search by DOB
* Patient-call linkage
* EMS-specific patient data fields
* Structured operational notes support

---

# Global Call History

## Features

* Global call history page
* Filter by date
* Filter by dispatcher
* Filter by quality score
* Display dispatcher information
* Display structured quality data
* Display incomplete call explanations

---

# Supervisor Dashboard

The system includes a dedicated supervisor analytics dashboard.

## Current Analytics

* Total calls per dispatcher
* Average dispatcher quality score
* Missing critical field statistics
* Missing optional field statistics
* Incomplete call tracking
* Explanation tracking

## Current Access Rules

* Admin → full access
* Supervisor → supervisor dashboard access
* Dispatcher → operational access only

---

# Employees Module

The system includes backend-powered employee and certification management.

## Employee Features

* Employee creation and editing
* Employee role management
* Operational employee status tracking
* Active / inactive employee tracking
* Employee number tracking
* Hire date tracking
* Employee email support
* Structured operational notes

## Current Operational Roles

* EMT
* Paramedic
* Driver
* Dispatcher
* Supervisor
* Manager

## Operational Employee Statuses

* active
* vacation
* sick
* suspended
* terminated

## Certification Features

* CPR certification tracking
* EVOC certification tracking
* EMT certification tracking
* Paramedic certification tracking
* Certification expiration tracking
* Certification validation warnings

## Operational Purpose

This module serves as the foundation for:

* Crew planning
* Staffing validation
* Future scheduling systems
* Supervisor staffing oversight
* Dispatcher / employee relationship mapping
* Operational staffing analytics
* Workforce management workflows

---

# User Management System

The system includes backend-powered operational user management.

## Features

* Create operational users
* Edit users
* Activate / deactivate accounts
* Role assignment
* Dispatcher / supervisor separation
* Admin-only access
* Backend user storage

## Current Roles

* admin
* supervisor
* dispatcher

---

# Crew Planner System

The Crew Planner module is fully backend-powered.

## Features

* Unit creation and editing
* BLS / ALS / Assist unit types
* Shift-date planning
* Driver eligibility validation
* EMT eligibility validation
* Paramedic eligibility validation
* Operational employee status validation
* Duplicate assignment detection
* Certification expiration warnings
* CPR validation warnings
* Patient order tracking
* Crew conflict detection
* Crew assignment history
* Daily staffing persistence
* Reusable crew presets

---

# Crew Validation Rules

## Driver

Requires:

* Active employee
* Operational status = active
* EVOC certification

## BLS Medical Slot

Requires:

* Active employee
* Operational status = active
* EMT certification

## ALS Medical Slot

Requires:

* Active employee
* Operational status = active
* Paramedic certification

## Assist Slots

Allow:

* Any operationally active employee

---

# Crew Presets System

The system supports reusable crew presets.

## Features

* Save reusable crew configurations
* Apply saved presets to units
* Backend preset storage
* Role-aware crew autofill preparation
* Rapid staffing workflow support

## Operational Purpose

Crew Presets reduce repetitive dispatcher staffing tasks and prepare the system for future scheduling automation.

---

# Backend API

# Authentication API

* `POST /api/auth/login`
* `GET /api/auth/users`
* `POST /api/auth/users`
* `PUT /api/auth/users/<id>`
* `PATCH /api/auth/users/<id>/toggle-active`

---

# Patients API

* `GET /api/patients`
* `POST /api/patients`
* `GET /api/patient/<id>`
* `PUT /api/patient/<id>`
* `DELETE /api/patient/<id>`
* `GET /api/patient/<id>/calls`

---

# Calls API

* `GET /api/calls`
* `GET /api/calls?date_of_call=YYYY-MM-DD`
* `GET /api/calls?dispatcher_name=NAME`
* `GET /api/calls?min_quality_score=VALUE`
* `GET /api/calls?max_quality_score=VALUE`
* `POST /api/calls`

---

# Employees API

* `GET /api/employees`
* `POST /api/employees`
* `PUT /api/employees/<id>`
* `DELETE /api/employees/<id>`

---

# Crew Planner API

* `GET /api/crew-units`
* `POST /api/crew-units`
* `PUT /api/crew-units/<id>`
* `DELETE /api/crew-units/<id>`

---

# Crew Presets API

* `GET /api/crew-presets`
* `POST /api/crew-presets`
* `PUT /api/crew-presets/<id>`
* `DELETE /api/crew-presets/<id>`

---

# Analytics API

* `GET /api/analytics/dispatchers`

---

# Installation

# Backend

cd backend

python -m venv venv

# Windows
venv\\Scripts\\activate

# Linux / macOS
source venv/bin/activate

pip install -r requirements.txt

python app.py

Backend runs on:

http://127.0.0.1:5050

---

# Frontend

cd frontend

npm install

npm run dev

Frontend runs on:

http://localhost:5173

---

# Development Workflow

## Git Branches

### Stable Branch

main

### Development Branch

dev

---

# Current Development Direction

The project is evolving toward:

* EMS operational support platform
* Dispatcher accountability platform
* Supervisor analytics system
* Workforce management system
* Crew staffing platform
* Modular workflow platform
* HIPAA-aware architecture
* Role-based operational environment
* Staffing and scheduling layer
* Certification validation platform
* Operational continuity platform

---

# TODO / Roadmap

# 🔴 High Priority

* Full secure authentication
* JWT/session authentication
* Password reset functionality
* Permission middleware
* Audit trail support
* Better route protection
* Frontend component decomposition

---

# 🟠 Architecture Cleanup

* Decompose `CrewPlannerPage.jsx`
* Decompose `EmployeesPage.jsx`
* Create reusable Crew Planner components
* Create reusable Employee components
* Move frontend validation helpers into utility files
* Keep current functionality stable during refactor

---

# 🟠 Workforce & Scheduling Expansion

* Shift scheduling system
* Employee availability tracking
* Supervisor staffing analytics
* Certification expiration alerts
* Unit staffing history
* Operational assignment history
* Crew scheduling automation
* Role-aware staffing suggestions
* Availability-aware staffing
* Future scheduling dashboard

---

# 🟡 Crew System Expansion

* Ambulance Unit Definitions
* Dynamic staffing templates
* Additional unit types
* Wheelchair unit support
* Supervisor vehicle support
* Autofill empty crew slots
* Shift templates
* Recurring schedules
* Unit status tracking

---

# 🟢 Patient Operations Expansion

* Patient operational flags
* Cancellation tracking
* No-show tracking
* Operational incident tracking
* Structured patient risk indicators
* Patient reliability metrics
* Supervisor patient review tools

---

# 🔵 Backend & Security

* PostgreSQL migration
* Better database normalization
* Secure session handling
* Audit logging
* Permission middleware
* HIPAA-aware architecture
* Operational backup strategy

---

# 🟣 UI / UX

IMPORTANT:

UI/UX redesign is intentionally postponed until:

* Core workflow stabilizes
* Authentication stabilizes
* Analytics systems mature
* Operational modules stabilize

Planned improvements:

* Wide-screen redesign
* Better dispatcher workflow UX
* Faster operational layouts
* Better visual hierarchy
* Mobile optimization improvements

---

# ⚫ Advanced Future Features

* Offline mode
* PWA support
* Electron desktop version
* SMTP integration
* PDF export
* Supervisor reports
* Daily operational exports
* Notification system
* Expiration alerts
* Operational dashboard widgets

---

# Purpose Reminder

## This System IS

* Backup EMS workflow platform
* Dispatcher support system
* Operational redundancy tool
* Structured data capture platform
* Supervisor oversight tool
* Crew planning platform
* Workforce management layer
* EMS operational support platform

---

## This System IS NOT

* A RescueNet replacement
* A full EMR platform
* A hospital management system

---

# Author

Aleh Sitsko

---

# Current Status

## MVP Status

Functional.

Implemented operational flow:

Authentication
↓
Role-Based Navigation
↓
Call Intake
↓
Validation
↓
Quality Tracking
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

Core operational functionality is working.

Completed major milestones:

* Authentication foundation
* Role-based routing
* Dispatcher-linked analytics
* Supervisor dashboard
* Structured quality tracking
* Backend employee management
* Workforce management foundation
* Crew Planner backend integration
* Crew preset system
* Certification validation system
* Operational employee status system
* Backend staffing persistence
* Backend route refactor into Flask Blueprints
* Backend utility extraction

---

# Long-Term Direction

The long-term goal is to evolve EMS Workflow System into a modular operational platform with reusable operational components that can later support:

* EMS
* Medical transport
* Logistics
* Scheduling
* Staffing
* Dispatch operations
* Operational redundancy systems
* Workforce coordination
* Supervisor analytics