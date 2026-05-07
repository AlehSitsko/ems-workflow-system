# EMS Workflow System

## Overview

EMS Workflow System is a modular web application designed as a **backup and support tool for EMS dispatch operations**. It allows dispatchers to quickly capture call data, manage patients, and maintain operational continuity in case of primary system failure (e.g., RescueNet outages).

The system is **not intended to replace primary EMS software**, but to act as a **first point of data entry and local redundancy layer**.

---

## Core Goals

* Fast and reliable call intake
* Local data availability during outages
* Simple patient lookup and management
* Modular architecture for future expansion (HR, scheduling, logistics)

---

## Tech Stack

### Frontend

* React (Vite)
* JavaScript (ES6+)
* Bootstrap (CDN)

### Backend

* Python
* Flask
* Flask-CORS
* SQLAlchemy

### Database

* SQLite (current)
* PostgreSQL (planned)

---

## Project Structure

```
ems-workflow-system/
│
├── backend/
│   ├── app.py              # Main Flask application
│   ├── models.py          # Database models
│   ├── requirements.txt   # Backend dependencies
│
├── frontend/
│   ├── src/
│   │   ├── api/           # API calls
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Application pages
│   │   ├── App.jsx        # Main app entry
│   │   └── main.jsx       # React bootstrap
│
└── README.md
```

---

## Features (Current)

### 1. Call Taking Form

* Capture basic trip information
* Pickup details
* Caller type
* Service type
* Optional price calculation

### 2. Price Calculator

* Base price input
* Crew multiplier logic (manual)
* Price per mile support
* Fixed price override

### 3. Patients Module

* Create patient records
* Search by name and DOB
* Edit existing records

### 4. Backend API

* REST API for patient management:

  * `GET /api/patients`
  * `POST /api/patients`
  * `PUT /api/patients/:id`

---

## Planned Features

### High Priority

* Call history linked to patients
* Auto-fill patient data in call form
* Form validation improvements
* Daily trip list generation

### Backend Expansion

* Authentication system (admin / dispatcher roles)
* Secure data handling (HIPAA-aware design)
* PostgreSQL migration

### UI / UX

* Better layout for wide screens
* Improved mobile usability

### Advanced

* Offline mode (PWA / Electron)
* Email sending (SMTP)
* PDF export

---

## Installation

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Backend runs on:

```
http://127.0.0.1:5050
```

---

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```
http://localhost:5173
```

---

## Development Workflow

Branches:

* `main` — stable version
* `dev` — development branch

Rules:

* Do NOT develop directly in `main`
* All changes go through `dev`
* Merge to `main` only after testing

---

## API Example

### Create Patient

```json
POST /api/patients

{
  "first_name": "John",
  "last_name": "Doe",
  "dob": "1990-01-01",
  "phone": "1234567890",
  "gender": "Male",
  "address": "123 Main St",
  "insurance": "Test Insurance",
  "notes": "N/A"
}
```

---

## Purpose Reminder

This system is:

* A **backup tool**
* A **data capture layer**
* A **dispatcher assistant**

This system is NOT:

* A replacement for RescueNet
* A fully compliant medical record system (yet)

---

## Author

Aleh Sitsko

---

## Status

MVP in progress.

Core functionality is operational.

Next step: backend expansion and system integration.
