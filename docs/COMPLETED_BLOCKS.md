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

### Multi-Tenancy Foundation (complete)

* Organization model: id, name, slug (subdomain identifier), is_active, settings_json
* org_id (nullable FK) added to all tenant-scoped tables
* Default organization seeded (id=1, slug="default") — all existing rows assigned
* No application logic changes — foundation only, activation deferred (see [ROADMAP.md](ROADMAP.md), Priority 6)

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
