# Data Classification & Encryption Coverage

A field-level review of the sensitive data the system stores, what protection each
field has today, and a concrete plan for the gaps. The goal is deliberate coverage,
**not** blanket-encrypting every string column (which would break search, sort and
display for little gain). Categories:

- **A. Secrets / authentication** — must be hashed (one-way) or encrypted; never
  returned in plaintext.
- **B. PHI / PII** — health/personal identifiers.
- **C. Sensitive operational** — free-text that may contain B indirectly.
- **D. Non-sensitive operational** — routine workflow data.
- **E. Search / index** — must remain queryable (plaintext or blind index).
- **F. Audit metadata** — records of who did what; needed in the clear to be useful.

Protection vocabulary: **plaintext** · **encrypted** (AES-256-GCM, AAD-bound) ·
**encrypted + blind index** (searchable) · **hashed** (one-way) · **intentionally
plaintext** (documented reason).

---

## Already protected (verified)

| Field | Category | Protection |
|---|---|---|
| `User.password_hash` | A | hashed (pbkdf2) |
| `UserInvitation.token_hash` | A | SHA-256 hash (raw token never stored) |
| `OrgRecoveryCode.code_hash` | A | SHA-256 hash (raw code shown once) |
| `Patient.member_id` | B | encrypted + blind index (exact-match search) |
| `Patient.policy_number` | B | encrypted |
| `Patient.insurance_notes` | B/C | encrypted |
| `Patient.phone`, `secondary_phone`, `address` | B | encrypted |
| `Patient.facility_name`, `room_number`, `emergency_contact_name`, `emergency_contact_phone` | B | encrypted |
| `Patient.notes`, `dispatch_comment`, `transport_instructions`, `access_instructions`, `special_equipment_notes` | B/C | encrypted |
| `Employee.phone`, `email` | B | encrypted |

All authentication secrets are hashed; the insurance identifiers, patient contact /
facility / emergency PII, patient free-text that may carry PHI, and employee contact
PII are encrypted at rest (none of them searched/indexed, so no blind index needed).
Master key required in production (fail-closed, see
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)).

## Intentionally plaintext (documented)

| Field(s) | Category | Why |
|---|---|---|
| `AuditLog.*` (actor, action, entity, details) | F | The audit trail must be queryable and readable to serve its purpose; it records metadata and references, not raw PHI payloads. |
| `EmployeeDocument.file_path` (object key) | D | A server-generated, org-scoped UUID key (`organizations/{org}/employees/{id}/{uuid}.ext`) — carries no PHI, so nothing to encrypt. |
| `Patient.last_name`, `Patient.dob` | B/E | Indexed for search and duplicate detection; encrypting them would require a blind-index redesign of search/sort and de-duplication. Tracked as a gap below, not intentional long-term. |

## Gaps & migration plan (not executed here — each is its own reviewed increment)

Ordered by value/effort. None is a blind auto-migration; each needs a schema
migration, a backfill, wiring, and tests, and some change API/UI behaviour — so they
are deliberately staged rather than rushed during a reliability-hardening pass.

### 1. `Employee.kiosk_pin` → hashed (highest value, small blast radius)

Today a 4-digit clock-in PIN is stored **plaintext**, compared plaintext in
`time_routes.py` (`pin != employee.kiosk_pin`), and **returned in the employee API**
(`Employee.to_dict()` → `kioskPin`). It is a low-privilege, rate-limited credential
(clock-in/out only), but a plaintext auth secret nonetheless.

Plan: add `kiosk_pin_hash`; hash on set (`generate_password_hash`); verify with
`check_password_hash` (verification is already per-employee, so **no blind index is
needed** — no lookup-by-PIN). Change `to_dict` to expose `hasPin` only (set-don't-
view, like passwords) and update the PIN editor UI accordingly. Migration: hash any
existing pins, then drop the plaintext column. Tests: set/verify/wrong-PIN, and that
the API never returns the PIN.

### 2. `Employee.phone` / `email` → encrypted — **DONE**

Shipped (migration `a7c3e1f95d24`). `Employee.dob` is **not** encrypted: it drives the
birthday calendar and needs a derived month/day index, tracked under the search note
below.

### 3. `Patient` contact PII (`phone`, `secondary_phone`, `address`, `emergency_contact_*`, `facility_name`, `room_number`) → encrypted — **DONE**

Shipped (migration `f4a1c9e07b30`), same pattern as `insurance_notes`; none are searched.

### 4. `Patient` free-text (`notes`, `dispatch_comment`, `transport_instructions`, `access_instructions`, `special_equipment_notes`) → encrypted — **DONE**

Shipped alongside #3.

### 5. `Call` — `caller_phone`, `pickup_address`, `dropoff_address`, `caller_note` → encrypted (deferred, high effort)

Addresses appear on the dispatch board and in routing/scheduling views and are
filtered/sorted, so encrypting them needs UI and query rework. Lower priority than
patient/employee identifiers.

### 6. `EmployeeDocument.document_number` → encrypted (low volume)

Certificate/licence numbers. Directly encryptable.

## Search / de-duplication note

`Patient.last_name` + `dob` back the duplicate-detection and search flows. Any move
to encrypt them must add blind indexes and adapt those queries — a design task, not a
column swap. Until then they stay plaintext and are called out here so the decision
is explicit, not accidental.
