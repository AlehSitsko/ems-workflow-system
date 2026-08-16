# Design: encrypting `dob` and `last_name` (blind-index feasibility)

Status: **Design / proposal** (no code changed). Grounded in the current
implementation, not the docs. Companion to
[../DATA_CLASSIFICATION.md](../DATA_CLASSIFICATION.md).

## Summary & recommendation

| Field | Recommendation | Why |
|---|---|---|
| **`Patient.dob`, `Employee.dob`** | **Encrypt** — with a **blind index** (exact search/dedup) + a derived **`dob_month_day`** (`MM-DD`) column for the birthday calendar | Every use of `dob` is either exact-equality or needs only the month/day, both of which survive encryption cleanly |
| **`Patient.last_name` / `first_name`** | **Keep plaintext** (documented decision) | They are **substring-searched** (`ILIKE %term%`) and **server-side alphabetically sorted with pagination** — neither is possible on a single blind index or on encrypted-at-rest values |

A blind index only answers **exact-match** ("is there a row whose value hashes to
X?"). `dob` is used that way; names are not.

## Current usage inventory (code as of this design)

**`dob`**
- Patient search — exact equality: `Patient.dob == dob` (`routes/patient_routes.py`
  `get_patients`).
- Duplicate detection — exact, with name: `... AND Patient.dob == dob`
  (`_find_duplicate`).
- Birthday calendar (patient **and** employee) — DB-side filter on the **MM-DD
  suffix only**: `db.func.substr(Patient.dob, 5, 6).in_(month_days)`
  (`routes/calendar_routes.py`), and `_birthday_occurrences(dob, …)` parses **only
  `month, day`** — the **year is never used** by the calendar.

**`last_name` / `first_name`**
- Patient search — **substring**: `first_name.ilike("%term%")` OR
  `last_name.ilike("%term%")`.
- Duplicate detection — exact normalized: `lower(trim(last_name)) == …`.
- Sorting (patient list + employee list) — `ORDER BY last_name, first_name`, applied
  **before pagination** (`.paginate(...)`, `.order_by(...)`).

## Why naive encryption breaks each

- Encrypting `dob` breaks `== dob`, the dedup match, and `substr(dob,5,6)` (substr on
  ciphertext is meaningless).
- Encrypting names breaks: `ILIKE "%term%"` (a blind index can't do "contains"),
  **and** `ORDER BY last_name` — you cannot alphabetically order ciphertext, and
  reading + sorting every row in Python defeats server-side pagination.

---

## Design — `dob` (feasible, recommended)

Reuse the existing engine (`core/security/encrypted_fields`, the `member_id` pattern:
a value column + a `*_bidx` blind-index column).

### Schema (Patient; Employee is the same minus the blind index)
- `dob` → widen to `Text`, store **ciphertext** (like member_id).
- `dob_bidx` `String(64)`, indexed — keyed HMAC of the **normalised** dob
  (`strip()`; canonical `YYYY-MM-DD`), scoped like the member-id index. Exact-match
  search + dedup use this.
- `dob_month_day` `String(5)`, indexed — plaintext `"MM-DD"` derived on every write.
  The birthday calendar filters and renders from this.

### Write path
On create/update, after the row has an id: set `dob_month_day = dob[5:10]` (from the
plaintext input, before encryption), compute `dob_bidx = blind_index(dob)`, then
`encrypt_instance` the `dob` value. All three stay consistent because they are derived
from the same input in one place (extend `_encrypt_patient_fields` /
`_encrypt_employee_fields`).

### Read / search / dedup / calendar
- `to_dict`: decrypt `dob` (already have `_decrypt_patient_field` /
  `_decrypt_employee_field`).
- Search: `Patient.dob == dob` → `Patient.dob_bidx == blind_index(dob)` (mirrors the
  existing member-id branch; falls back to plaintext equality when no master key).
- Dedup: the `dob` term of `_find_duplicate` → `dob_bidx == blind_index(dob)` (names
  stay as they are — see below).
- Calendar: `substr(dob,5,6).in_(month_days)` → `dob_month_day.in_(month_days)`, and
  `_birthday_occurrences` takes the month/day from `dob_month_day` (it never used the
  year). **No full-table decrypt** — the efficient DB-side filter is preserved.

### Exposure analysis
`dob_month_day` reveals a person's **birthday month+day but not the year** — it is not
a full date of birth, so it does not give age and has low re-identification value on
its own. The calendar already **displays** the birthday date to authorised users, so
MM-DD is effectively visible in the product regardless. This is a deliberate, minimal,
documented exposure — the alternative (decrypting every patient/employee on every
calendar render) is far worse operationally. The **year** (the identifying part) is
encrypted.

### Rollout (phased, each shippable & tested)
1. **Schema** — migration: widen `dob` to Text; add `dob_bidx`, `dob_month_day`
   (both nullable, indexed). VARCHAR→TEXT + ADD COLUMN are Postgres-safe.
2. **Derive-on-write + backfill** — populate `dob_bidx` / `dob_month_day` for existing
   rows and (with a master key) encrypt `dob`, via the existing backup-first,
   idempotent `encrypt-existing-fields`. Backfill `dob_month_day` even when encryption
   is off, so the calendar works in plaintext mode too.
3. **Switch reads** — search, dedup and calendar to the new columns (plaintext
   fallback preserved when no key).
4. **Tests** — dob encrypted at rest + decrypts through the API; exact search by dob
   via the blind index; dedup still catches a duplicate; calendar birthdays still
   appear (plaintext and encrypted modes); Postgres migration applies in CI.

Backward-compatible throughout: no master key → `dob` stays plaintext and everything
uses the plaintext path, exactly as today.

---

## Design — `last_name` / `first_name` (recommend: keep plaintext)

A blind index cannot serve either of their two hard requirements:

1. **Substring search** (`ILIKE "%term%"`). Options and their costs:
   - *Prefix blind index* (hash normalised prefixes): supports `term%` only, **not**
     `%term%` — a real UX regression (can't find "Smith" by typing "mit").
   - *Trigram blind index* (hash every 3-gram): supports substring, but stores many
     hashes per row, leaks length/shape, and complicates writes materially.
2. **Server-side `ORDER BY last_name` before pagination.** There is **no** clean
   solution: ciphertext has no meaningful order; order-preserving encryption is weak
   and leaky; sorting in Python after decrypt breaks paginated queries.

**Recommendation: leave `last_name`/`first_name` plaintext**, and protect them with
defence-in-depth instead — the app already enforces **runtime tenant isolation** and
**RBAC** (a name never crosses an org boundary; HR can't read patients), the
`is_sensitive` flag masks a patient's details in list UIs, and the operator supplies
**database-at-rest (disk/volume) encryption** (see the Operations Runbook). Names are
lower-sensitivity than the identifiers already encrypted (member id, dob-year, contact
PII) and are intrinsically needed in the clear for the core search/sort UX.

**If name encryption is ever mandated**, the realistic path is: prefix-blind-index for
search (accept `term%` semantics) **and** move sorting to per-page client-side sort of
the decrypted page (losing global alphabetical pagination) — a product decision, not a
column swap. That is a separate, larger initiative.

## Decision log
- **dob: encrypt — IMPLEMENTED** (migration `d3e5b7a19f42`): encrypted `dob` +
  `dob_bidx` (exact search/dedup) + `dob_month_day` (calendar), with a model-level
  listener keeping the derived column in sync on every write path.
- **last_name/first_name: stay plaintext.** Encryption breaks substring search and
  paginated alphabetical sort; defence-in-depth covers the residual risk. *Decision.*
