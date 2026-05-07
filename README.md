# EMS Workflow System

## Overview

EMS Workflow System is a modular web application designed as a **backup and support tool for EMS dispatch operations**.

It provides a **lightweight, fast, and reliable call intake system** that ensures data is captured even when primary systems (e.g., RescueNet) are unavailable.

The system acts as a:
- First point of call intake
- Local redundancy layer
- Dispatcher support tool

---

## Core Goals

- Fast and reliable call intake
- Patient lookup and reuse of data
- Call tracking and history
- Operational continuity during outages
- Modular architecture for future expansion

---

## Tech Stack

### Frontend
- React (Vite)
- JavaScript (ES6+)
- Bootstrap (CDN)

### Backend
- Python
- Flask
- Flask-CORS
- SQLAlchemy

### Database
- SQLite (current)
- PostgreSQL (planned)

---

## Project Structure
ems-workflow-system/
│
├── backend/
│ ├── app.py
│ ├── models.py
│ ├── requirements.txt
│
├── frontend/
│ ├── src/
│ │ ├── api/
│ │ ├── components/
│ │ ├── pages/
│ │ ├── App.jsx
│ │ └── main.jsx
│
└── README.md

---

## Features (Current)

### Call Taking Form
- Full call intake workflow
- Patient search and linking
- Return ride logic
- Service level selection

### Call Quality Control (NEW)
- Real-time validation during call intake
- Critical vs non-critical field detection
- Required explanation for missing critical fields
- Quality data stored with each call

### Patients Module
- Create, edit, and search patients
- Search by name and DOB
- Patient-call linkage

### Call History
- Global call history page
- Filter by **date of call**
- Display all call details and notes

### Backend API
- Patients API
- Calls API
- Patient → Call relationship

---

## API Endpoints

### Patients

- `GET /api/patients`
- `POST /api/patients`
- `PUT /api/patient/<id>`
- `DELETE /api/patient/<id>`

### Calls

- `GET /api/calls`
- `GET /api/calls?date_of_call=YYYY-MM-DD`
- `POST /api/calls`
- `GET /api/patient/<id>/calls`

---

## Installation

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py

Backend:

http://127.0.0.1:5050

Frontend

cd frontend
npm install
npm run dev

Frontend:
http://localhost:5173

Development Workflow

Branches:

main — stable
dev — development

Rules:

Never work directly in main
Develop in dev
Merge only after testing
TODO / Roadmap
🔴 High Priority
 Patient auto-fill improvements (more fields)
 Add Date of Trip to required logic (optional/critical review)
 Improve validation UX (inline errors instead of alerts)
 Add call creation audit (who created the call)
🟡 Medium Priority
 Click call → open related patient
 Highlight call quality in CallsPage (colors or status)
 Add quick filters (Today / This Week)
 Improve table UX (sorting, pagination)
🟢 Quality Control Expansion
 Add scoring system (0–100%)
 Store structured quality data (not just in notes)
 Require dispatcher justification for incomplete calls
 Add “Call Refused / Incomplete” workflow
🔵 Backend & Security
 Authentication system (admin / dispatcher roles)
 Role-based access control
 Data protection (HIPAA-aware design)
 PostgreSQL migration
🟣 UI / UX
 Redesign layout (wide screens)
 Mobile optimization improvements
 Field highlighting improvements
⚫ Advanced
 Offline mode (PWA / Electron)
 Email sending (SMTP)
 PDF export
 Daily trip report generation
Purpose Reminder

This system is:

A backup tool
A dispatcher assistant
A data capture layer

This system is NOT:

A replacement for RescueNet
A full EMR system
Author

Aleh Sitsko

Status

MVP — functional.

Core workflow is implemented:
Call Intake → Validation → Storage → History

Core functionality is operational.

Next step: backend expansion and system integration.
