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

### 1. `Employee.kiosk_pin` → hashed — **DONE**

Shipped (migration `b2f8d4a16c93`). The clock-in PIN is now stored as a one-way hash
(`kiosk_pin_hash`); `Employee.set_kiosk_pin` / `check_kiosk_pin` handle it, the
plaintext column was dropped, and the API exposes only `hasPin` (never the PIN). The
edit form is set-don't-view (empty leaves it unchanged). Verification is per-employee,
so no blind index is needed.

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

### 6. `EmployeeDocument.document_number` → encrypted — **DONE**

Shipped (migration `c8b1e6a34f27`). Certificate/licence numbers; the document's tenant
(for the DEK) is resolved from its parent employee's org. Not searched, no blind index.

## Search / de-duplication note (`dob`, `last_name`) — designed

`dob` and `last_name`/`first_name` back the search, duplicate-detection and birthday-
calendar flows, so they were held back for a design pass rather than a column swap.
That design is done — see [design/DOB_LASTNAME_ENCRYPTION.md](design/DOB_LASTNAME_ENCRYPTION.md).
Conclusion:

- **`dob` → encryptable** with a blind index (exact search + dedup) plus a derived
  non-identifying `dob_month_day` (`MM-DD`) column for the calendar (which never uses
  the year). Ready to implement; the year — the identifying part — ends up encrypted.
- **`last_name`/`first_name` → stay plaintext (decision).** They are substring-searched
  (`ILIKE %term%`) and alphabetically sorted server-side before pagination; neither is
  possible on a blind index or on encrypted-at-rest values without a real UX loss.
  Protected instead by tenant isolation + RBAC + the `is_sensitive` UI mask + operator
  database-at-rest encryption.
