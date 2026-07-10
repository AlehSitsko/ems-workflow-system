# TODO

Active and near-term backlog, in sequential blocks (P0 → P4). Completed work is
**not** kept here — it lives in [docs/COMPLETED_BLOCKS.md](docs/COMPLETED_BLOCKS.md).
For the phased long-range picture see [docs/ROADMAP.md](docs/ROADMAP.md).

Format for active tasks: **Why / Scope / Acceptance / Validate**.

---

## P0 — Current stabilization sprint

Most of this sprint is **done** (see COMPLETED_BLOCKS.md → "Stabilization sprint"):
documentation sync, the Flask application factory, removal of import-time demo
seeding, the `seed-demo` CLI, GitHub Actions CI, isolated Patients pytest,
isolated Payroll pytest, and the Vitest frontend test foundation.

- [x] Documentation synchronization (README / TODO / ROADMAP / TESTING / COMPLETED_BLOCKS)
- [x] Flask application factory (`create_app`, `config.py`, `extensions.py`, `cli.py`)
- [x] Remove import-time demo seeding + `except Exception: pass`
- [x] `flask --app app seed-demo` CLI command (idempotent, local/demo only)
- [x] GitHub Actions CI (`.github/workflows/ci.yml`)
- [x] Patients pytest (`backend/tests/test_patients.py`, 30 tests)
- [x] Payroll pytest (`backend/tests/test_payroll.py`, 22 tests)
- [x] Vitest foundation (`vitest`, RTL, jsdom; 32 tests) + CI `npm test`
- [x] PatientsPage decomposition — **phase 1** (constants + `DetailItem` + `PatientFormSection` → `components/patients/`)

### Active — PatientsPage decomposition, phases 2–4

- [ ] Phase 2 — extract data/logic hooks
  Why: `pages/PatientsPage.jsx` is still ~1,690 lines mixing API loading, filter
  state, form state, alerts, and contacts logic. Backend Patients tests + the
  Vitest foundation now protect this refactor (the API contract is locked by
  `test_patients.py`; utils by Vitest).
  Scope: extract `hooks/usePatients.js` (list load, pagination, filters,
  show-archived, archive/restore), `hooks/usePatientForm.js` (create/edit form
  state, dirty check, validation), `hooks/usePatientAlerts.js`, and
  `hooks/usePatientContacts.js`. Move logic only — no JSX-tree, layout, visual,
  API-contract, or duplicate-detection change.
  Acceptance: page shrinks materially; each hook owns one concern; UX identical.
  Validate: `cd frontend && npm run lint && npm test && npm run build`; browser
  pass — Show All / Show Archived, create, edit (all tabs), archive/restore,
  add alert, add contact — zero console errors.

- [ ] Phase 3 — extract drawer + tab components
  Scope: `components/patients/PatientDrawer.jsx` plus `PatientOverviewTab`,
  `PatientEditTab`, `PatientCallHistoryTab`, `PatientAlertsTab`,
  `PatientContactsTab`, and `PatientForm.jsx` / `PatientArchiveDialog.jsx`. Wire
  them to the phase-2 hooks; presentational only.
  Validate: same as phase 2, per extracted component.

- [ ] Phase 4 — extract list/toolbar components
  Scope: `components/patients/PatientToolbar.jsx`, `PatientList.jsx`,
  `PatientListItem.jsx`. `pages/PatientsPage.jsx` becomes a thin composition root.
  Validate: same as phase 2; confirm search, pagination ("load more"), and
  selection unchanged.

---

## P1 — Docker development environment (planned, not started)

Reproducible local dev/demo via containers. **Development only — this does not
make the project production-ready** (no PostgreSQL, real auth, or hardening; see
P4). Detailed phase notes in [docs/ROADMAP.md](docs/ROADMAP.md) → Phase 2.

- [ ] `backend/Dockerfile` (Python slim, Flask dev server, `flask db upgrade` on start)
- [ ] `frontend/Dockerfile` (Node, Vite dev server with hot reload; API URL via env)
- [ ] `docker-compose.yml` (backend + frontend, ports, depends_on)
- [ ] `.dockerignore` + `.env.example` (document `DATABASE_URL`, `VITE_API_BASE_URL`, VAPID)
- [ ] Named volume for the SQLite database file (persist across rebuilds)
- [ ] Optional explicit demo seed step (`flask --app app seed-demo`) — never automatic
- [ ] Reuse existing `/api/health` for a compose healthcheck
- [ ] Docker setup guide (`docs/`), and a CI job that builds both images
- Out of scope for P1: PostgreSQL, Redis, Celery, Nginx, Kubernetes, production
  secrets, cloud deployment.

## P2 — Calendar MVP (planned, not started)

Read-only, role-aware operational calendar aggregating existing data. No new
large tables in the MVP — events are **derived** from Employees, Patients,
certifications, Tasks, Crew units, Calls, and Vehicles. Full spec (event
sources, access matrix, per-source rules) in [docs/ROADMAP.md](docs/ROADMAP.md)
→ Phase 3.

- [ ] Calendar architecture + unified event contract (id, type, title, start/end,
  source, source_id, severity, link)
- [ ] Backend `GET /api/calendar/events?start=&end=` — resolve actor → allowed
  event types → query range → role-filter → strip inaccessible fields → return
  unified events (filter server-side, never client-only)
- [ ] Role filtering (admin / supervisor / dispatcher / HR access matrix)
- [ ] Event sources: employee birthdays, patient birthdays (admin/supervisor/
  dispatcher only), certification expirations, task due dates, crew shifts,
  scheduled calls, vehicle expiration/maintenance dates (existing fields only)
- [ ] Frontend month / week / agenda views, type badges, source links, filters,
  loading/empty/error states, saved user filter preferences

## P3 — Calendar extensions (planned)

- [ ] `CalendarEvent` model for manual events (visibility scopes: company /
  operations / management / HR / patient-operations / private)
- [ ] Participants, reminders, notification integration
- [ ] Conflict detection, saved views
- [ ] Recurrence, ICS export, external (Google/Outlook) sync — much later; must
  not export patient data without a separate privacy/security policy

## P4 — Later production hardening (planned)

- [ ] Production authentication (replace header-based `X-User-*` with JWT/session)
- [ ] PostgreSQL migration
- [ ] Production Docker images (Gunicorn, Nginx, multi-stage frontend, non-root)
- [ ] Restrict CORS to known origins; secrets management
- [ ] Runtime tenant isolation (the `organization` schema exists but is inactive)
- [ ] Backup strategy, structured logging, monitoring
- [ ] Security review

---

## Portfolio polish (P3-ish, independent)

- [ ] Screenshots + a short workflow GIF in README
- [ ] Seeded demo dataset for screenshots/walkthroughs
- [ ] Simple architecture diagram
