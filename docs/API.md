# Backend API Reference

All endpoints are JSON in/out. Authentication is header-based (`X-User-Id` / `X-User-Role` / `X-User-Name`) — see [ARCHITECTURE.md](ARCHITECTURE.md#authentication) for why, and the Security Note in the main README for the production plan.

## Authentication & Users

```text
POST   /api/auth/login
GET    /api/auth/users
POST   /api/auth/users
PUT    /api/auth/users/<user_id>
PATCH  /api/auth/users/<user_id>/toggle-active
```

## Employees

```text
GET     /api/employees
POST    /api/employees
PUT     /api/employees/<employee_id>
DELETE  /api/employees/<employee_id>
```

## HR Documents

```text
GET     /api/employees/<employee_id>/documents
POST    /api/employees/<employee_id>/documents
GET     /api/documents/<doc_id>
PATCH   /api/documents/<doc_id>
DELETE  /api/documents/<doc_id>
GET     /api/documents/<doc_id>/file
GET     /api/documents/compliance
```

## Time Entries & Kiosk

```text
GET     /api/employees/<employee_id>/time-entries
POST    /api/employees/<employee_id>/time-entries
PATCH   /api/time-entries/<entry_id>
DELETE  /api/time-entries/<entry_id>
GET     /api/employees/<employee_id>/pay-config
PUT     /api/employees/<employee_id>/pay-config

GET   /api/kiosk/employees
POST  /api/kiosk/verify-pin
GET   /api/kiosk/status/<employee_id>
POST  /api/kiosk/clock-in
POST  /api/kiosk/clock-out
```

## Payroll

```text
GET    /api/payroll/periods
POST   /api/payroll/periods
GET    /api/payroll/periods/<period_id>
PATCH  /api/payroll/periods/<period_id>
DELETE /api/payroll/periods/<period_id>
PATCH  /api/payroll/periods/<period_id>/status
GET    /api/payroll/periods/<period_id>/summary
GET    /api/payroll/export?period_id=&format=csv|gusto|adp
```

## Crew Planner

```text
GET     /api/crew-units                        (?date= filters by shift date)
POST    /api/crew-units
PUT     /api/crew-units/<unit_id>
DELETE  /api/crew-units/<unit_id>
POST    /api/crew-units/<unit_id>/make-night
GET     /api/crew-units/alerts                 (near_end/overdue shift alerts for the given date)
```

## Crew Presets

```text
GET     /api/crew-presets
POST    /api/crew-presets
PUT     /api/crew-presets/<preset_id>
DELETE  /api/crew-presets/<preset_id>
```

## Vehicles

```text
GET     /api/vehicles
POST    /api/vehicles
PUT     /api/vehicles/<vehicle_id>
PATCH   /api/vehicles/<vehicle_id>/toggle-active
DELETE  /api/vehicles/<vehicle_id>
```

## Patients

```text
GET     /api/patients                                  (?page=&per_page=&name=&dob=&show_archived= supported)
POST    /api/patients                                   (409 + existing_patient on duplicate first/last/dob match)
GET     /api/patient/<patient_id>
PUT     /api/patient/<patient_id>
DELETE  /api/patient/<patient_id>                       (soft archive, not a hard delete — body: {reason})
POST    /api/patient/<patient_id>/restore
GET     /api/patient/<patient_id>/calls
GET     /api/patient/<patient_id>/last-trip-template     (pickup/dropoff/service_level from most recent completed call)
```

### Patient Alerts

```text
GET     /api/patient/<patient_id>/alerts                (?show_all=1 to include resolved/expired)
POST    /api/patient/<patient_id>/alerts
PUT     /api/patient/<patient_id>/alerts/<alert_id>
POST    /api/patient/<patient_id>/alerts/<alert_id>/resolve
```

### Patient Contacts

```text
GET     /api/patient/<patient_id>/contacts
POST    /api/patient/<patient_id>/contacts
PUT     /api/patient/<patient_id>/contacts/<contact_id>
DELETE  /api/patient/<patient_id>/contacts/<contact_id>
```

## Calls

```text
GET    /api/calls
POST   /api/calls
PUT    /api/calls/<call_id>
PATCH  /api/calls/<call_id>/cancel
PATCH  /api/calls/<call_id>/uncancel
PATCH  /api/calls/<call_id>/pickup-time
```

## Analytics

```text
GET  /api/analytics/dispatchers
```

## Dispatch Board

```text
GET     /api/dispatch/board?date=<YYYY-MM-DD>
POST    /api/dispatch/assign
DELETE  /api/dispatch/assign/<assignment_id>
PATCH   /api/dispatch/assign/<assignment_id>/complete
PATCH   /api/dispatch/assign/<assignment_id>/reopen
PATCH   /api/dispatch/units/<unit_id>/status
PATCH   /api/dispatch/units/<unit_id>/call-order
GET     /api/dispatch/dispatch-thresholds
PUT     /api/dispatch/dispatch-thresholds
```

## Tasks

```text
GET     /api/tasks                       (?assigned_to_employee_id=&status=&priority=&task_type=&due_before=&due_after=&created_by_user_id=&related_module=&related_entity_id=&overdue=1&is_archived=1 — role-scoped)
GET     /api/tasks/my                    (current user's assigned/created tasks)
GET     /api/tasks/summary               (my_open/my_overdue/due_today; + total_open/total_overdue/unassigned_count for admin/supervisor)
GET     /api/tasks/<task_id>
POST    /api/tasks                       (admin/supervisor/hr only; hr restricted to HR-related task types)
PUT     /api/tasks/<task_id>             (same role gate as create)
PATCH   /api/tasks/<task_id>/status      (assignee limited to In Progress/Waiting/Done; Completed/Cancelled require creator, assigner, or admin)
PATCH   /api/tasks/<task_id>/assign      (admin/supervisor/hr only)
DELETE  /api/tasks/<task_id>             (soft archive — admin/supervisor only)
GET     /api/tasks/<task_id>/comments
POST    /api/tasks/<task_id>/comments
GET     /api/tasks/<task_id>/activity
```

## User Settings

```text
GET    /api/settings          (X-User-Id header)
PATCH  /api/settings          (X-User-Id header, body is deep-merge patch)
```

## Notifications

```text
GET   /api/notifications?user_id=<id>
POST  /api/notifications/read
POST  /api/notifications/read-all
GET   /api/notifications/prefs?user_id=<id>
PUT   /api/notifications/prefs
GET   /api/notifications/vapid-public-key
POST  /api/notifications/push-subscribe      (body: {user_id, subscription})
POST  /api/notifications/push-unsubscribe    (body: {user_id})
POST  /api/notifications/test-push           (body: {user_id} — sends a real push to confirm delivery)
```

## Audit Log

```text
GET   /api/audit?entity_type=&user_id=&date_from=&date_to=&page=&per_page=
```

## Health check

```text
GET   /api/health   →  {"service": "ems-workflow-system-backend", "status": "ok"}
```

---

## Data Model

For the full SQLAlchemy model reference, read `backend/models.py` directly — it's the single source of truth and this doc will drift if kept as a parallel description. The models, grouped by area:

- **Auth/Org**: `User`, `Organization` (multi-tenancy foundation — see [ARCHITECTURE.md](ARCHITECTURE.md))
- **Staff/HR**: `Employee`, `EmployeeDocument`, `TimeEntry`, `EmployeePayConfig`, `PayPeriod`
- **Crew Planning**: `DailyCrewUnit`, `CrewPreset`, `Vehicle`
- **Patients/Calls**: `Patient`, `PatientAlert`, `PatientContact`, `Call`, `CallAssignment`
- **Tasks**: `Task`, `TaskComment`, `TaskActivityLog`
- **Notifications**: `NotificationEvent`, `UserNotification`, `UserNotificationPrefs`
- **Audit**: `AuditLog`

A few fields worth calling out because they're not obvious from the column name alone:

- `Task.is_overdue()` is computed (due_date in the past and status not Completed/Cancelled) — never stored, so nothing needs a scheduled job to flip it back.
- `DailyCrewUnit`'s `planned_end_time` and `delay_minutes` are computed properties (start_time + shift_duration_hours, and actual_end_time vs planned_end_time), not stored columns.
- `Patient` uses soft-archive (`is_archived`, `archived_at`, `archived_by`, `archived_reason`) instead of hard delete — existing `Call` records keep a valid patient reference even after archiving.
- Every tenant-scoped table has a nullable `org_id` — see [ARCHITECTURE.md](ARCHITECTURE.md#multi-tenancy-foundation) for why it's not filtered on yet.
