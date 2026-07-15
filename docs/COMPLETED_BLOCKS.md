# Completed Blocks (Changelog)

Historical record of shipped work, in the order it landed. For what's planned next, see [ROADMAP.md](ROADMAP.md). For the current state of each module, see the main [README.md](../README.md#feature-highlights).

---

### Block 1 — Tech Debt Stabilization (complete)

* Caller phone and name in dedicated Call columns
* Pagination on Calls and Patients
* Rate limiting on login (10 attempts/minute)
* Flask-Migrate (Alembic) initialized

### Block 2 Phase 1 — In-App Notifications (complete)

* NotificationEvent, UserNotification, UserNotificationPrefs models
* 7 event types with role-based routing and deduplication
* Notification bell with 10-second polling
* Per-user notification preferences

### Block 2 Phase 2 — Web Push & Board Auto-Refresh (complete)

* pywebpush service worker integration
* Auto-refresh Dispatch Board on polling interval
* Non-intrusive browser notification opt-in banner

### Block 3 Phase 1 — Time Tracking & Kiosk (complete)

* TimeEntry and EmployeePayConfig models
* Kiosk page (PIN-based, no login required)
* Manual time entry for HR/supervisor
* Time & Pay tab in employee drawer
* Clock-in/out from Dashboard (requires user → employee link)
* Dashboard clock widget with live timer

### Block 3 Phase 2 — Payroll Periods (complete)

* PayPeriod model with open → review → approved → exported workflow
* FLSA weekly OT calculation per ISO week
* Per-employee payroll summary with regular/OT split
* Delete pay periods
* CSV export in generic, Gusto, and ADP formats

### Block 3 Phase 3 — Night Crew & Pay Config (complete)

* Night shift support in Crew Planner (shift_type, end_time, end_date)
* Visual separation of Day and Night crew sections
* Make Night from day unit (with replace/keep option)
* Standalone Night unit creation

### Block 4 Phase 1 — HR Documents (complete)

* EmployeeDocument model with full metadata fields
* File storage abstraction layer (storage.py — swap local → S3 in one file)
* Document upload: PDF, JPG, PNG, WEBP, DOCX up to 10 MB
* 12 document types across certification and HR categories
* Color-coded expiry indicators (ok / warning / critical / expired / none)
* Documents tab in employee drawer (Profile | Time & Pay | Documents)
* In-app file preview: PDF via browser viewer, images inline, DOCX download prompt
* Download with proper auth headers (blob URL, no direct link exposure)
* Edit document metadata post-upload
* Delete document with filesystem cleanup
* Compliance summary API endpoint (employee × doc type grid)

### Block 4 Phase 1.5 — Document Expiry Notifications (complete)

* New notification event type: doc_expiring
* Thresholds: 90 / 60 / 30 / 14 / 7 days before expiry
* severity: warning (> 14 days), critical (≤ 14 days)
* Deduplication: one event per document per day
* Roles: admin, supervisor, hr

### Block 4 Phase 2 — Compliance Dashboard (complete)

* Employee × doc type grid view (all employees × 12 document types)
* Color-coded cell per status: ok / warning / critical / expired / missing
* Filter to show only expired and critical rows
* Click cell → open employee Documents tab
* CSV export of the full compliance grid
* Certification scan: upload a cert image → extract type and expiry date

### Block 5.1 — Audit Log (complete)

* AuditLog model: user_id, action, entity_type, entity_id, old_value, new_value, timestamp
* Log: call status changes, unit assignment/removal, patient edits, manual time entries, document uploads/deletes
* Audit log viewer with filter by entity type, user, date range

### Multi-Tenancy Foundation (schema only — complete)

* Organization model: id, name, slug (subdomain identifier), is_active, settings_json
* org_id (nullable FK) added to all tenant-scoped tables
* No default organization is seeded and no rows are backfilled with an org_id — the `organization` table is empty by default; there is no seed logic for it in `app.py` (only demo users are seeded)
* No application logic changes — schema foundation only. Runtime tenant isolation is not active. Full organization seeding, tenant resolution, org_id backfill, and tenant-safe query enforcement are deferred to the Production Hardening / Priority 6 phase (see [ROADMAP.md](ROADMAP.md))

### Call Cancellation (complete)

* Cancel button in Dispatch Board call detail modal
* Mandatory cancellation reason field — cannot cancel without a reason
* Cancelled status reflected on the board immediately

### Theme System — Phase 1 (complete)

* CSS Custom Properties design token system (`--ems-*` prefix) in `theme.css`
* Bootstrap 5.3 dark mode via `data-bs-theme` on `<html>`
* ThemeContext with `useTheme` hook and localStorage persistence
* Dark / light toggle button in Topbar (moon / sun icon)
* All App.css surfaces ported to CSS variables
* Dispatch Board fully theme-aware via `--ems-board-*` tokens
* All hardcoded dark inline styles replaced with CSS variable references

### UI Standardization — Phase 1 (complete)

* `EntityDrawer` — shared right-side drawer component (50vw, header / tabs / scrollable body / sticky footer)
* `ToastProvider` / `useToast` — non-blocking success and error feedback
* `ConfirmDialog` / `useConfirm` — promise-based confirmation for destructive actions
* `window.alert` and `window.confirm` removed from the modules touched in this pass (a later holdout in `CallDrawer.jsx` was found during the stabilization audit — see [ROADMAP.md](ROADMAP.md), Priority 2)
* PatientsPage: EntityDrawer with Overview / Edit / Call History tabs
* CallsPage: EntityDrawer with Summary / Trip / Quality tabs
* EmployeesPage: EntityDrawer integration
* CrewPlannerPage: EntityDrawer for unit form; available staff inline in Crew Assignment section
* Dispatch Board: inline Next Status button per unit row; all text colors via CSS variables
* Call.notes structured fields migrated to dedicated columns (dispatcher_name, caller_phone, caller_note)
* `docs/UI_STANDARD.md` — reference document for cards vs tables, drawer/modal/toast rules, module patterns, design tokens

### Call Editing + Return Ride from Call History (complete)

* Edit tab added to Call drawer in Calls page — all fields editable post-intake (dispatcher, caller, trip details, addresses, service level, notes)
* Changes saved via `PUT /api/calls/<id>` and logged to Audit Log as `call.updated` with list of changed fields
* Return Ride creation from Edit tab — creates a separate call record with reversed addresses, selected service level, and return time
* Will Call option available — no pickup time set, configured later from Dispatch Board
* Return service level defaults to BLS when original call is Emergency (patients do not go home as Emergency)
* Return/Will Call legs blocked from creating their own return leg (guard against duplicate chains)
* `TimeInput` component — custom time picker replacing native AM/PM selector: separate HH + MM fields, AM/PM as pill buttons, 12h/24h toggle persisted in localStorage (later replaced by the server-side per-user setting — see "Time Format Preference & Notification Settings Overhaul" below)

### UI Standardization — Phase 2 (complete)

* UserManagementPage: full EntityDrawer rewrite — add/edit user in drawer, table-row click to edit, ConfirmDialog for deactivation
* PayrollPage: EntityDrawer for create/edit pay periods; all hardcoded colors replaced with CSS variables
* AuditLogPage: all hardcoded dark colors replaced with `--ems-*` CSS variables; theme-correct in both light and dark
* CallFormPage: Guided mode is now the default; price calculator visible in both Classic and Guided modes; cancel intake with ConfirmDialog; decorative stat cards removed
* HomePage (Dashboard): full redesign — `QuickTile` component grid replaces stat card blocks; compact inline `ClockWidget`; hero row with Start Taking Call shortcut; color-coded tiles by role/section
* CallsPage, EmployeesPage, CrewPlannerPage: `page-summary-grid` removed; stats converted to compact inline color-coded chips within panel headers
* Global CSS compaction: form controls, labels, buttons, and section cards visually modernized to match Dashboard aesthetic; form section icons reduced; service level cards and quality panel made compact

### Block 1.1 — Notes Field Migration (complete)

* Structured lines (Dispatcher, Phone, Caller note) extracted from Call.notes into proper columns
* One-time migration script: `backend/scripts/migrate_notes_to_columns.py`
* Frontend regex fallback removed — all fields read directly from dedicated columns

### UI Standardization — Phase 3 (complete)

* Patient list cards redesigned to match Calls card style — 6-column grid: Name/DOB | Phone | Insurance | Home Address | Default Service (inline select) | Actions
* Default Service Level inline-editable per patient directly from the list — saved via `PUT /api/patient/<id>` with immediate local state update
* Employee list cards redesigned — 6-column grid: Name/#/Hired | Phone+Email | Role/Status | Certifications (CPR/EVOC/EMT/Para compact badges) | Positions | Actions
* Certification badges color-coded: green (active) / amber (expiring) / grey (expired/none)

### Call Dispatch Lifecycle Timestamps (complete)

* Five new fields on `Call` model: `dispatched_at`, `arrived_pickup_at`, `patient_loaded_at`, `arrived_dest_at`, `completed_at`
* Set automatically by unit status transitions on Dispatch Board: `en_route → dispatched_at`, `on_scene → arrived_pickup_at`, `transporting → patient_loaded_at`, `at_destination → arrived_dest_at`; `complete assignment → completed_at`
* Dispatch Timeline section in Call drawer Summary tab — vertical timeline with color-coded milestones
* Supervisor/Admin Edit tab expanded — all lifecycle timestamps + `received_at` + `status` override editable with datetime-local inputs
* All timestamp edits logged to Audit Log as `call.updated` with `note: "timestamp_edit"` and `changed_fields`

### TimeInput — Global Format Toggle (complete, superseded)

* `showFormatToggle` prop on `TimeInput` — format toggle rendered only where `showFormatToggle` is set (Pickup Time field)
* All other time fields on the same page show H:MM + AM/PM inputs without their own toggle
* Format change broadcasts via `CustomEvent("ems-time-format")` so all `TimeInput` instances on the page switch simultaneously
* Format preference persisted in `localStorage` — applies across page reloads
* **Superseded** by "Time Format Preference & Notification Settings Overhaul" below — the per-form toggle and localStorage/CustomEvent mechanism no longer exist in the codebase; kept here only as a historical record of the intermediate step.

### Timezone / Timestamp Consistency (complete)

* All backend timestamp writes standardized to naive local time: `datetime.now().isoformat(timespec="seconds")` — no UTC offset
* Frontend `received_at` writes use `localIsoNow()` helper (exported from `callUtils.js`) — produces `YYYY-MM-DDTHH:MM:SS` in local time
* `new Date("YYYY-MM-DDTHH:MM:SS")` treated as local by browsers — `toLocaleString()` displays correct local time with no offset math
* `datetime-local` inputs read and write values without TZ conversion

### Calls API (complete)

* `PUT /api/calls/<id>` — update any call field post-intake; role-checked (dispatcher+)
* `PATCH /api/calls/<id>/cancel` — cancel with mandatory reason
* `PATCH /api/calls/<id>/uncancel` — restore cancelled call to new
* `PATCH /api/dispatch/assign/<id>/reopen` — reopen completed assignment

### Dispatch Board — Crew Planning Integration (complete)

* Crew Planner fully embedded in Dispatch Board (Variant C)
* + Day Unit / + Night Unit buttons in board header
* Edit / Delete buttons on unit rows
* Unit create/edit drawer with full crew assignment and validation
* Left panel Staff tab: shows unassigned employees for the date
* Calls / Staff toggle in left panel
* Patient queue sub-row: derived from actual assigned calls sorted by pickup time; stale manual entries no longer shown

### Dispatch Board — Call Management (complete)

* + New Call button in left panel opens `CallDrawer` for create mode
* CallDrawer supports patient search (name + DOB + phone), new patient creation with dedup check, full trip and caller fields
* CallDrawer auto-fills pickup address from selected patient's address record
* CallDrawer warns before closing if form has unsaved changes (overlay, ✕, Cancel, Escape)
* Edit Call from call detail modal footer — opens CallDrawer in edit mode
* Dispatch Timestamps inline editing in call detail modal (dispatched / on scene / transporting / at destination / completed)
* Completed calls in Done tab now carry `assignment_id` from backend — Reopen works correctly from any context
* `patient_order` JSON column on `DailyCrewUnit` stores `[{name, time, callId}]` — board display derives from live assignments, not stored order

### Dispatch Board — Operational Alerts + Priority Queue (complete)

* Manual call priority queue per unit: ⚡ Set High Priority (moves to top), ▲▼ reorder, Reset to time order
* `call_priority` JSON array on `DailyCrewUnit` stores `[call_id, ...]`; empty = auto sort by pickup_time
* Overdue call animation: call row flashes red when pickup_time is exceeded by user-configurable threshold (default 0 min = immediately)
* Unit stuck animation: unit status cell flashes red when no status change for user-configurable threshold (default 30 min)
* `dispatch_status_changed_at` on `DailyCrewUnit` — timestamp updated on every unit status change, used for stuck detection
* Overdue/stuck thresholds saved per user in unified settings blob (`settings.dispatch.pickup_late_after`, `settings.dispatch.stuck_after`)
* Dispatch lifecycle timestamps write-once: `dispatched_at`, `arrived_pickup_at`, `patient_loaded_at`, `arrived_dest_at` never overwritten on repeated status clicks

### Per-User Settings System (complete)

* `settings_json` column on `User` model — unified blob: `{notifications, dispatch, ui}`
* `settings_utils.py` — `DEFAULT_SETTINGS`, `deep_merge`, `load_user_settings` (auto-migrates from old `UserNotificationPrefs`), `save_user_settings`
* `GET /api/settings` — full settings blob with defaults for current user
* `PATCH /api/settings` — deep-merge patch, partial updates supported
* `UserSettingsContext` — React context loaded once at login, available app-wide via `useUserSettings()`
* `NotificationSettingsPage` — reads enabled values from context, saves via `updateSettings()`
* `DispatchBoardPage` — reads dispatch thresholds from context, no separate fetch
* Panel sizes (left column width, bottom panel height) auto-saved to `settings.ui.panels.dispatch` on drag end
* Panel sizes restored from settings on page load
* ⊞ Reset layout button in board header — visible only when sizes differ from defaults
* User menu dropdown in Topbar (avatar click): Settings link, Dark/Light mode toggle, Log out

### Data Integrity, Soft Archive & Patient Module Expansion (complete)

* Invalid crew employee IDs and out-of-range/malformed audit `page`/`per_page` query params now return `400` instead of crashing with a `500`
* Backend duplicate patient prevention: normalized first name + last name + DOB match returns `409` with `existing_patient` (including archived patients, so a matching archived record can be restored instead of creating a duplicate)
* Patient soft archive replaces hard delete — see `Patient` in [API.md](API.md) and [ARCHITECTURE.md](ARCHITECTURE.md); calls keep showing the patient's name even when the patient is archived
* Validation added: crew unit `shiftDate`/`startTime`/`endTime` format, `Call.quality_score` (integer 0–100), `Vehicle.unitType` restricted to an allowed list matching the frontend, `Document.doc_type` validated on PATCH (previously only on upload), field length limits across patient/call/vehicle/document text fields
* `Patient.dispatch_comment`, `PatientAlert`, and `PatientContact` models added
* Patient Risk Card on the Call Form: shows active alert badges, dispatch note, and transport defaults when a patient is selected; "Use last trip as template" prefills pickup/dropoff/service level from the patient's most recent completed call (does not copy date, time, status, or assignment)
* Dispatch Board: minimal alert-severity and dispatch-note badges on call cards; full alert detail and dispatch note in the call detail modal's Patient Alerts section
* Patient Drawer: Alerts and Contacts tabs, archived-patient banner with Restore action, "Show archived" toggle on the Patients page

### Time Format Preference & Notification Settings Overhaul (complete)

* `settings.ui.time_format` ("12h" | "24h", default "12h") is now the single source of truth for time display — the per-form 12h/24h toggle (`TimeFormatToggle`, previously shown next to Crew Planner's "Unit Information" header) has been removed
* `TimeInput` reads the format from `useUserSettings()` instead of `localStorage` + a custom DOM event; `frontend/src/utils/timeUtils.js` centralizes `normalizeTimeValue`, `parseTimeToMinutes`, `convert12hTo24h`, `convert24hTo12h`, `formatTimeForDisplay`, `isValidTime` — tolerant of legacy time strings (`7:00`, `07:00`, `2:30 PM`), never crashes on an unparseable value
* Classic Call Form's native `<input type="time">` fields (pickup/appointment/return time) replaced with `TimeInput` for format consistency with Guided mode
* Backend validates `pickup_time`/`appointment_time` (`utils/validation_utils.is_valid_time`) on call create/update and the Will-Call pickup-time endpoint — malformed values return `400`; `PATCH /api/settings` validates `ui.time_format` and clamps `dispatch.pickup_late_after` / `dispatch.stuck_after` to sane ranges
* Notification Settings page (`Settings` in the avatar menu) rewritten:
  * New **Preferences** section with the Time Format control
  * **Push Notifications** section replaces the old vague "Unavailable" label with a real status derived from `Notification.permission` + secure-context + browser-support checks: Unsupported / Requires HTTPS / not enabled yet / Blocked (with instructions) / Enabled (with a "Send test notification" button backed by a new `POST /api/notifications/test-push` endpoint)
  * **Dispatch Visual Alerts** kept as its own section, distinct from Push Notifications
  * Kept the "Push Notifications" name (rather than renaming to "Browser Notifications") because this project already has full push infrastructure — VAPID keys, service worker `push`/`notificationclick` handlers, backend subscription storage, and server-side delivery via `pywebpush` — not just the plain `Notification` API
* Sidebar nav item for `/notifications` renamed from "Notifications" to "Settings" (gear icon) to match the page's expanded scope — same route, Topbar title, and user-menu link as before

### Notification Prefs Bug Fix, Browser Notification UX, and Settings Refactor (complete)

* Fixed a `NameError: name 'NOTIFICATION_LABELS' is not defined` crash — `GET /api/notifications/prefs` returned a `500` unconditionally, meaning the Settings page could never load its notification toggles. `NOTIFICATION_LABELS` now lives in `notification_utils.py` next to `ROLE_EVENT_TYPES`; `qa_test.py` covers the endpoint (200 response, every entry has a label, missing/nonexistent `user_id` return `400`/`404`, structure holds across every seeded role) so this can't regress silently again
* `GET /api/notifications`, `GET /api/notifications/prefs`, and `PUT /api/notifications/prefs` now distinguish a missing `user_id` (`400`) from a `user_id` that doesn't resolve to a real user (`404`) — previously both cases returned the same "user_id required" message
* Renamed the "Push Notifications" section to **Browser Notifications** — matches what's shown in the app
* Browser permission and server push configuration are now checked independently: `usePushNotifications()` fetches `/api/notifications/vapid-public-key` on mount and exposes `vapidConfigured`. If the browser reports `granted` but the server has no VAPID key, the UI shows a distinct **"Browser enabled / Push not configured"** state instead of a false "Enabled" — this can no longer silently fail with a vague "No active browser notification subscription" error and nothing else
* `NotificationSettingsPage.jsx` split into `frontend/src/components/settings/`: `TimeFormatSettings.jsx`, `BrowserNotificationSettings.jsx`, `NotificationTypeSettings.jsx`, `DispatchVisualAlertsSettings.jsx`, and `notificationStatus.js` (status copy + the `getEffectiveStatus()` combinator) — the page itself is now a coordinator that holds state and wires the four sections together
* Fixed a pre-existing light-theme bug found while refactoring: enabled notification-type labels and the "enabled" browser-notification message were hardcoded to white text (`#fff`), invisible against the light theme's white background — both now use `var(--ems-text-primary)`
* Reduced React Hook `exhaustive-deps` warnings from 9 to 4 (later reduced to 0 — see "Post-QA Fix-Pass" below)
* `DispatchBoardPage`, `PatientsPage`, `UserManualPage`, `CrewPlannerPage`, and `EmployeesPage` are now lazy-loaded (`React.lazy` + a single `Suspense` boundary around the router) — the main bundle dropped from ~705 kB to ~448 kB with each page split into its own 34–85 kB chunk, and the "chunk larger than 500 kB" build warning is gone

### Staff Tasks / Task Management Module (complete)

* New `Task` / `TaskComment` / `TaskActivityLog` models (`backend/models.py`), Alembic migration `d4f8a1c2e3b9`, and a full CRUD blueprint (`backend/routes/task_routes.py`)
* Creation restricted to admin/supervisor/hr; hr further restricted to HR-related task types; dispatchers can only view, comment on, and progress the status of tasks assigned to them
* Closing workflow: only the task's creator, its assigner, or an admin can set status to Completed/Cancelled — everyone else can only move a task up to a new **Done** status and hand it back for review. Enforced in both `task_routes.py` (`PATCH /api/tasks/<id>/status`) and the frontend (`TasksPage.jsx` filters which Quick Status Change buttons render, and hides the Edit tab for roles that can't edit)
* `Task.to_dict()` resolves `created_by_user_name` via a `creator` relationship to `User`, so the Overview tab shows who created a task without any manual entry
* New `task_assigned` bell notification: `notification_utils.notify_user()` targets the single user account linked to the newly assigned employee (unlike the existing role-broadcast `create_notification()`), fired on task creation-with-assignee and on reassignment
* Frontend: `frontend/src/api/tasksApi.js`, `frontend/src/pages/TasksPage.jsx` (list/filter/create/edit/comments/activity/archive in one page, matching the existing single-file-per-module convention), a Dashboard widget + Quick Tile, and Tasks nav entry under Staff
* Added the missing "HR" option to the Employee role dropdown (`EmployeesPage.jsx`) — the label/badge-color utilities already supported it, it just wasn't selectable
* `qa_test.py` extended with a dedicated Task Management section (create/list/filter/status transitions/assign/comment/activity/archive, the close-permission enforcement scenario, and negative-permission cases for every role)

### Post-QA Fix-Pass: FK Crashes, Missing HR User, Lint Warnings (complete)

* Seeded default `hr`/`hr` demo user alongside admin/supervisor/dispatcher
* Fixed `sqlite3.IntegrityError` crashes in Task creation/status/assign/comment when `X-User-Id` didn't resolve to a real user — invalid ids are now nulled instead of written to a FK column
* Task assignment and `PUT /api/auth/users/<id>` now return clean JSON `400`/`404` for invalid/nonexistent employee ids instead of an HTML 404 or a `500`
* Fixed a pagination-dependent QA assertion (archived patient visibility) that could false-fail after stress-seeding 500+ patients
* Cleared the last 4 `react-hooks/exhaustive-deps` warnings (CallForm return-ride sync, CrewPlanner/DispatchBoard CPR/assignment warnings, Dispatch Board polling) without changing behavior

### DispatchBoardPage refactor (complete)

* `pages/DispatchBoardPage.jsx` reduced from 2,439 → 768 lines across five phases. Extracted 11 presentational components to `components/dispatch/` (`StatusPill`, `UnitTypeBadge`, `CallCard`, `AssignedCallCard`, `CompletedCallCard`, `CallDetailModal`, `WarningModal`, `BoardToolbar`, `OpenCallsPanel`, `UnitTable`, `UnitDetailPanel`), 4 hooks to `hooks/` (`usePanelResize`, `useOverdueDetection`, `useCallPriority`, `useUnitFormValidation`), and pure helpers/constants to `utils/dispatchBoardUtils.js`. Behavior unchanged — verified each phase with lint/build, `qa_test.py`, and manual browser passes

### Shift management, Vehicle Registry, auto-fill, overlap warning (complete)

* Vehicle Registry (`Vehicle` model + `vehicle_routes.py` + `VehicleRegistrySection.jsx`) with a route-layer unique constraint on `unit_number`
* Shift timing on `DailyCrewUnit` (`shift_duration_hours`, `shift_status`, computed `plannedEndTime`/`delayMinutes`), near-end/overdue alerts (`GET /api/crew-units/alerts`, `ShiftAlertsBlock.jsx`), and `unit_shift_near_end`/`unit_shift_overdue` bell notifications. Midnight-crossover handled in both backend and frontend
* Dispatch Board shows shift timing per unit row and colors the row by severity (green/orange/red)
* **Auto-fill Crew** button — fills empty crew slots from active, not-assigned-elsewhere staff with role eligibility and paramedic conservation (a BLS medical slot prefers an EMT so paramedics stay available for ALS units)
* **Soft same-vehicle overlap warning** — a unit whose time range overlaps another active unit on the same truck for that date shows a non-blocking warning (half-open intervals, so adjacent shifts don't false-positive)

### Stabilization sprint (complete)

* **Security / dependency review** — `npm audit` resolved to 0 vulnerabilities via a non-`--force` update (all 11 advisories were dev-tooling transitives, none in the runtime bundle). Standardized 404/405 to JSON via global error handlers (the API is JSON-only). Centralized the per-route role gate behind a `require_role` decorator (`backend/utils/auth_utils.py`), applied to the clean top-of-view gates in `audit_routes`, `call_routes`, and `document_routes`
* **Migration drift repair** — a dev database stamped mid-chain (partially-applied `da67a9d4edeb`) was brought to head non-destructively; `daily_crew_unit.first_patient` corrected to nullable to match the model. The migration files themselves were already correct on a fresh database
* **Flask application factory** — `create_app(config_overrides)` with `config.py`, `extensions.py`, `cli.py`. No import-time side effects: importing `app.py` no longer opens the DB or seeds
* **Removed import-time demo seeding** and the `except Exception: pass` that hid schema errors. Demo users now come from an explicit, idempotent `flask --app app seed-demo` CLI command (local/demo only)
* **GitHub Actions CI** (`.github/workflows/ci.yml`) — backend (compileall + pytest) and frontend (npm ci, lint, test, build) on PRs and pushes to `dev`/`main`. Live QA excluded from CI
* **Backend test coverage** grew from 37 → 89 isolated pytest tests: added `test_patients.py` (30) and `test_payroll.py` (22). `conftest.py` now builds an isolated app per test via the factory
* **Frontend Vitest foundation** — Vitest + React Testing Library + jsdom; 32 tests (utilities + a `StatusPill` component smoke test); `npm test` / `npm run test:watch` scripts wired into CI
* **PatientsPage decomposition phase 1** — established `components/patients/` and moved the self-contained module-level pieces (`patientConstants.js`, `DetailItem.jsx`, `PatientFormSection.jsx`) out of the page. Remaining hook/tab phases tracked in TODO.md P0

### PatientsPage decomposition — phases 2 & 3 (complete)

* Phase 2 extracted four hooks to `hooks/` — `usePatients` (list load, search, pagination, show-archived, archive/restore), `usePatientForm` (create/edit form state + dirty check), `usePatientAlerts`, `usePatientContacts`
* Phase 3 extracted the drawer tabs and list to `components/patients/` — `PatientOverviewTab`, `PatientCallHistoryTab`, `PatientAlertsTab`, `PatientContactsTab`, `PatientEditTab`, plus `PatientToolbar` and `PatientList`
* `pages/PatientsPage.jsx` reduced to a thin composition root (~1,496 → ~437 lines). Behavior unchanged — verified with lint / Vitest / build each phase

### Calendar foundation (complete)

* New Calendar page at `/calendar` (sidebar → Operations), lazy-loaded and role-agnostic (any signed-in user)
* Month grid with a fixed 6-week layout, weekend tinting, "today" highlight, and all 11 **US federal holidays** (fixed + floating, computed in `utils/holidayUtils.js`); timezone-safe local date math
* `utils/calendarUtils.js` (month matrix, month title, cursor stepping) and `utils/holidayUtils.js`, both with Vitest coverage
* Presentational components in `components/calendar/` — `CalendarToolbar`, `CalendarGrid`, `CalendarDayCell`, `CalendarSidebar`; theme-aware styling (light + dark) using `--ems-*` tokens + Bootstrap accents

### Calendar ↔ Dispatch integration (complete)

* **Unified events API** — `GET /api/calendar/events?start=&end=` (`routes/calendar_routes.py`): range-validated (required, valid, `start ≤ end`, ≤ 93 days), backend role filtering, and a stable event contract plus per-day operational summaries (call/unit counts, `warningCount`/`criticalCount`, `readiness`). Sources are **derived** from existing `Call` (`scheduled_call`) and `DailyCrewUnit` (`crew_shift`) records — no calendar-specific tables. Bounded query count (no N+1), eager patient load
* **Role scoping (server-side)** — admin/supervisor/dispatcher get calls + crew + a minimized patient label (`"John D."`, never full PHI); HR gets crew-only, non-PHI data; unknown role → `403`
* **Calendar month view** now shows per-day counts + a readiness indicator (icon + `aria-label`, never color alone), reloads on month change over the full visible grid range, and handles loading/error/empty states
* **Day Operations Drawer** (shared `EntityDrawer`) — day readiness, scheduled calls, crew units, derived issues, and an **Open Day in Dispatch Board** button; calls/units link straight into the board
* **Dispatch Board date modes** — the board reads `?date=&call=&unit=` from the URL and operates in **Planning** (future — assign/prepare, no live lifecycle), **Live** (today — full operations), or **History** (past — read-only). A visible mode badge, day navigation (prev/today/next) that updates the URL, and linked call/unit selection (consumed once, then stripped from the URL; missing entity shows a toast). Preliminary assignment reuses the existing `CallAssignment` model — no duplicate call is created
* **Live-status safety** — operational status transitions are rejected with `409` unless the unit's `shift_date` is the server-local today, and the corresponding controls are disabled off-Live in the UI. `todayStr` and new date math are local (not UTC) with month/year/leap boundary tests
* **Tests** — backend `test_calendar.py` (23: events contract, range validation, role filtering, HR-no-PHI, day summaries/readiness, ALS-on-BLS critical, and the Dispatch date-mode guard); frontend Vitest for the mode/date helpers, link builder, calendar cell/drawer, board toolbar, and unit-panel gating. Backend 112, frontend 82 tests total

### Calendar event sources + Task participants (complete)

* **New derived calendar sources** on `GET /api/calendar/events`: patient birthdays (`Patient.dob`, active only, minimized name), employee birthdays (`Employee.dob`), certification expirations (Employee CPR/EVOC/EMT/Paramedic dates), task due dates (`Task.due_date`), and vehicle inspection/registration/insurance/maintenance dates. Birthdays recur yearly (year-independent matching across a range's year boundary). All derived — no calendar-specific tables
* **Schema** (migration `e5a9c7d1b2f3`, hand-written on head `d4f8a1c2e3b9` to avoid the pre-existing index drift; upgrade+downgrade verified on a fresh SQLite DB): `Employee.dob`; `Vehicle.{inspection,registration,insurance}_expiry` + `next_maintenance_date`; `Task.visible_to_all`; `task_participant(task_id, employee_id)`
* **Backend role access per source** — patient birthdays + vehicle events: admin/supervisor/dispatcher only (not HR); employee birthdays: all roles; certifications: admin/supervisor/hr see the employee name, dispatcher sees the fact only (no name/link) for crew-readiness; tasks: reuse the app's Task visibility. `otherEventsCount` added to day summaries (overlay events don't affect operational readiness)
* **Task participants + assign-to-all** — tasks accept `participant_employee_ids` and `visible_to_all`; a user sees a task if they created/assigned it, are its assignee, are a participant, or it is an announcement (`visible_to_all`); admin/supervisor still see all. Wired through the Tasks create/edit drawer (multi-select participants + announcement checkbox)
* **Per-user calendar display settings** (`settings.calendar`) — source visibility toggles, week start (Sun/Mon), density, weekend/holiday toggles; a Calendar section on the Settings page; the month view honors them (source filtering, week start, density, overlay badges, "Other" drawer section)
* **Tests** — backend 125 (`test_tasks.py` +6 participants/announcements, `test_calendar.py` +7 overlay sources incl. birthday recurrence + dispatcher cert name-hiding); frontend 86 (calendar week-start utils, overlay badges, drawer "Other" section)

### Backend date-mode enforcement — Planning / Live / History (complete)

* **`utils/operational_dates.py`** — one source of truth for operational dates: strict local-date parsing/validation, mode derivation (Planning/Live/History), and reusable guards (`require_valid_date`, `require_operational_date`, `require_live_date`, `prohibit_historical_mutation`, `validate_call_unit_dates`). Operational dates are never UTC-parsed
* **Real backend rules, not disabled buttons** — guards applied to every mutating route reachable from the Dispatch Board: assign, unassign, complete, reopen, call-order, unit status, crew-unit create/update/delete, make-night, and call pickup-time. Planning allows crew shifts + assignment + queue but no live lifecycle; Live allows everything; History is read-only (no supervisor/admin override — that needs its own reason+audit workflow)
* **Closed audit gaps** — the backend previously allowed assigning past calls, cross-date assignment (`trip_date != shift_date`), and completing/reopening a future assignment by direct API call; all now return `409` with a specific reason. A `completed`/`cancelled` call can no longer be assigned without the reopen/uncancel workflow
* **Date validation** — the board date and every guard reject impossible dates (`2026-99-99`, `2026-02-30`) with `400` and accept real leap days (`2028-02-29`). The frontend `isIsoDate` now carries the same meaning (local round-trip, no UTC parse)
* **Error surfacing** — `dispatchApi` helpers and the pickup-time call return the backend's specific message (e.g. "Cross-date assignment is not allowed…") instead of a generic "Failed to assign call"; the pickup-time request previously ignored `res.ok` entirely
* **Tests** — new `tests/test_date_modes.py` (22): helper units (impossible dates, leap day, mode classification), board date validation, assignment rules (past/cross-date/completed/cancelled), live-only lifecycle, crew + pickup-time history guards, and a full Live workflow regression (assign → status → queue → pickup-time → complete → reopen → unassign). Backend 147, frontend 88
* **Documentation** — README/API/ARCHITECTURE/TESTING corrected: real test counts, Calendar sources listed as implemented (not "coming soon"), and History described as backend-enforced only now that it actually is

### Operational taxonomy + visual classification (Block 2, complete)

* **Canonical vocabulary** — `backend/utils/taxonomy.py` is authoritative and published at `GET /api/taxonomy`; `frontend/src/utils/taxonomy.js` mirrors it. Removed the duplicated arrays that had drifted (CallDrawer/CallForm/CallFormPage/PatientEditTab/VehicleRegistrySection/DispatchBoardPage/vehicle_routes)
* **Root causes fixed, found by auditing the real data:** CallDrawer offered "Emergency" as a *service level* and wrote `sl.toLowerCase()` (hence `bls`/`als`/`emergency` in the DB); vehicle_routes duplicated the type list with a "must stay in sync with the frontend" comment (hence `BARI` vs `Bariatric`); dispatch badges were binary ALS-vs-everything-else, so Stretcher/CCT/Bariatric calls were confidently mislabelled "BLS"
* **Four distinct axes:** service level (patient default = preference, call = actual trip requirement), unit type, vehicle capability, qualification. Qualification ≠ shift role — the role comes from the DailyCrewUnit slot, so a Paramedic can be rostered as Driver
* **Normalization on write**, unknown values preserved and surfaced as neutral "Unknown" rather than silently rewritten
* **Legacy cleanup CLIs** (dry run by default): `normalize-taxonomy` and `migrate-emergency-service-level`. Applied to the dev DB (backed up first): 34 canonicalizations + 3 calls moved to `call_type='emergency'`, 2 patient defaults cleared; 1 conflict (call #27, already `call_type='return'`) deliberately left for a human decision
* **Semantic tokens + reusable badges** — `--ems-tax-*` / `--ems-qual-*` (light+dark) and `EmployeeAvatar` / `QualificationBadge` / `AssignedRoleBadge` / `ServiceLevelBadge` / `UnitTypeBadge` / `VehicleTypeBadge`. Colour is never the only signal: every badge carries a text label + aria-label. Dispatch Board shows qualification-ringed avatars, the assigned slot role, and the real service level; board payload gained `crewDetails` (`crewNames` kept for compatibility)

### Entity Workspace foundation + Vehicle Workspace (Block 3, complete)

* **UI_STANDARD rewritten** around three levels — Quick Peek (drawer), Quick Create/Edit (drawer), Entity Workspace (full page + own route) — replacing the old "everything is a drawer" rule that did not survive complex entities. Documents URL/deep-link rules, tabs, back-navigation, permissions, unsaved changes, and the semantic colour/badge system
* **`EntityWorkspace`** — reusable shell: canonical URL per entity, tab in `?tab=` (deep-linkable, `replace` so tabs don't stack history), back-to-list restoring the list's filters via router state, and owned loading/error/not-found/permission states. Tabs whose data does not exist yet are `disabled` with a reason instead of faked
* **Fleet module** — `/fleet/vehicles` list (filters/search in the URL) + `/fleet/vehicles/:vehicleId` workspace as the reference implementation, with a new Fleet nav group. Live tabs: Overview, Compliance (expiry with overdue/soon highlighting), Activity (real audit trail). Odometer/Maintenance/Documents/Shift History are visibly deferred to Fleet Management
* **Backend Fleet permissions + audit** — `GET /api/vehicles/<id>` added for the workspace deep link; view = admin/supervisor/dispatcher, mutate = admin/supervisor, HR `403`. All mutations audited (`vehicle.created/updated/deactivated/deleted`), which is what the Activity tab reads. `vehiclesApi` now sends caller identity (the role gate would otherwise have broken the existing Crew Planner registry)
* **Tests** — backend 206 (`test_taxonomy.py` 43, `test_fleet.py` 16), frontend 127 (`taxonomy` mirror, `TaxonomyBadges` accessibility, `EntityWorkspace` routing)
