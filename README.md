# EMS Workflow System

## Overview

EMS Workflow System is a modular web application designed as a **backup and support platform for EMS dispatch operations**.

The system provides a lightweight and reliable operational workflow layer for EMS-related activities during both normal operations and emergency situations.

This project is intentionally designed as:

- A backup EMS workflow system
- A dispatcher support platform
- A local operational redundancy layer
- A structured call intake and tracking system

The project is NOT intended to replace primary EMS systems such as RescueNet.

---

# Core Goals

- Fast and reliable call intake
- Operational continuity during outages
- Dispatcher accountability
- Structured quality tracking
- Supervisor oversight tools
- Patient lookup and reuse of information
- Modular and scalable architecture
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
- Flask-CORS
- SQLAlchemy

## Database

### Current
- SQLite

### Planned
- PostgreSQL

---

# Current Architecture

The project currently follows a separated frontend/backend architecture.

```txt
ems-workflow-system/
│
├── backend/
│   ├── app.py
│   ├── models.py
│   ├── requirements.txt
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
```

---

# Current Features

# Authentication System (NEW)

The application now includes a foundational authentication and role system.

## Current Roles

- admin
- supervisor
- dispatcher

## Features

- Login system
- Protected routes
- Role-aware navigation
- Supervisor-only dashboard access
- Dispatcher identity tracking
- localStorage-based session persistence (MVP)
- Automatic dispatcher assignment to calls

---

# Call Taking Form

## Features

- Full EMS call intake workflow
- Patient search and linking
- Return ride logic
- Service level selection
- Structured call storage
- Automatic dispatcher assignment
- Call quality analysis

---

# Call Quality Control System

The system includes structured quality tracking for every call.

## Critical Fields

Critical fields currently include:

- First Name
- Last Name
- Date of Birth
- Pick Up Address

## Optional Fields

Optional fields currently include:

- Phone Number
- Drop Off Address
- Trip Date
- Pickup Time
- Caller Type
- Service Level
- Additional Information

---

## Quality Score Logic

### Score Distribution

- Critical fields = 70%
- Optional fields = 30%

### Current Features

- Real-time quality scoring
- Missing critical field detection
- Missing optional field tracking
- Required explanation for incomplete calls
- Structured quality data storage
- Dispatcher-linked quality analytics

---

# Patients Module

## Features

- Create patients
- Edit patients
- Search by name
- Search by DOB
- Patient-call linkage
- EMS-specific patient data fields

---

# Global Call History

## Features

- Global call history page
- Filter by date
- Filter by dispatcher
- Filter by quality score
- Display dispatcher information
- Display structured quality data
- Display incomplete call explanations

---

# Supervisor Dashboard (NEW)

The system now includes a dedicated supervisor analytics dashboard.

## Current Analytics

- Total calls per dispatcher
- Average dispatcher quality score
- Missing critical field statistics
- Missing optional field statistics
- Incomplete call tracking
- Explanation tracking

## Current Access Rules

- Admin → full access
- Supervisor → supervisor dashboard access
- Dispatcher → operational access only

---

# Backend API

# Authentication API

- `POST /api/auth/login`
- `GET /api/auth/users`

---

# Patients API

- `GET /api/patients`
- `POST /api/patients`
- `PUT /api/patient/<id>`
- `DELETE /api/patient/<id>`

---

# Calls API

- `GET /api/calls`
- `GET /api/calls?date_of_call=YYYY-MM-DD`
- `GET /api/calls?dispatcher_name=NAME`
- `GET /api/calls?min_quality_score=VALUE`
- `GET /api/calls?max_quality_score=VALUE`
- `POST /api/calls`
- `GET /api/patient/<id>/calls`

---

# Analytics API

- `GET /api/analytics/dispatchers`

---

# Installation

# Backend

```bash
cd backend

python -m venv venv

# Windows
venv\Scripts\activate

# Linux / macOS
source venv/bin/activate

pip install -r requirements.txt

python app.py
```

Backend runs on:

```txt
http://127.0.0.1:5050
```

---

# Frontend

```bash
cd frontend

npm install

npm run dev
```

Frontend runs on:

```txt
http://localhost:5173
```

---

# Development Workflow

## Git Branches

### Stable Branch
```txt
main
```

### Development Branch
```txt
dev
```

---

## Rules

- Never work directly in `main`
- Develop new features in `dev`
- Test before merge
- Use English comments only
- Keep frontend and backend separated

---

# Current Development Direction

The project is evolving toward:

- Dispatcher accountability platform
- Supervisor analytics system
- EMS operational support system
- Modular workflow platform
- HIPAA-aware architecture
- Role-based operational environment

---

# TODO / Roadmap

# 🔴 High Priority

- User management system
- Admin user management page
- Create/deactivate users
- Password reset functionality
- Role management
- Audit trail support
- Call ownership tracking

---

# 🟠 Workflow Expansion

- Daily call history overview
- Daily trip generation
- Validation escalation logic
- Dispatcher justification workflows
- Supervisor review workflows
- Supervisor notes

---

# 🟡 Medium Priority

- Quick filters
- Pagination
- Table sorting
- Better validation UX
- Improved dashboard layouts
- Better analytics visualizations

---

# 🔵 Backend & Security

- JWT/session authentication
- Persistent authentication
- Permission middleware
- HIPAA-aware architecture
- PostgreSQL migration
- Better database normalization

---

# 🟣 UI / UX

IMPORTANT:

UI/UX redesign is intentionally postponed until:
- Core workflow stabilizes
- Authentication stabilizes
- Analytics systems mature
- Main operational logic is complete

Planned improvements:

- Wide-screen redesign
- Better dispatcher workflow UX
- Faster operational layouts
- Better visual hierarchy
- Mobile optimization improvements

---

# ⚫ Advanced Future Features

- Offline mode
- PWA support
- Electron desktop version
- SMTP integration
- PDF export
- Supervisor reports
- Daily operational exports

---

# Purpose Reminder

## This System IS

- Backup EMS workflow platform
- Dispatcher support system
- Operational redundancy tool
- Structured data capture platform
- Supervisor oversight tool

---

## This System IS NOT

- A RescueNet replacement
- A full EMR platform
- A hospital management system

---

# Author

Aleh Sitsko

Status

MVP — functional.

Core workflow is implemented:
Call Intake → Validation → Storage → History

Next phase: system expansion and data quality tools.
