# Security & Encryption Audit — experimental verification

**Revision audited:** `43f55c08` (tag `v1.1.1`), branches `main == dev`.
**Method:** adversarial QA — synthetic canary PHI/PII created through the **real API**
into a disposable database, then a **raw database dump** searched for every canary;
plus org-key isolation, AAD binding, key-failure, rotation, tenant/IDOR, and blind-index
experiments. The crypto layer is storage-backend-agnostic (the AES-GCM token and HMAC
blind index are identical on SQLite and PostgreSQL), and CI additionally runs the whole
prod stack (PostgreSQL + Redis + Gunicorn×3 + Nginx + MinIO) with `EMS_MASTER_KEY` set.

This document records what was **experimentally proven**, and — honestly — what was
**not executed** in that pass and why.

## Verified (experiments passed)

- **Encryption at rest — 0 plaintext leaks.** 21 encrypted canary fields (patient PHI:
  dob, member_id, phone, secondary_phone, address, policy_number, insurance_notes,
  emergency_contact_name/phone, notes, dispatch_comment, transport/access_instructions,
  special_equipment_notes, facility_name, room_number; call caller_phone/caller_note;
  employee phone/email/dob; document_number) were **absent** from the raw DB dump.
  Correct DEK + AAD decrypts the ciphertext back to the canary, confirming it is the
  real value stored encrypted.
- **Org key isolation.** `DEK_A ≠ DEK_B`; the raw DEK is never in the DB (only the
  wrapped DEK + version); the two orgs' wrapped DEKs differ.
- **AAD binding — all move-attacks fail closed.** Decrypting org A ciphertext with (a)
  org B's DEK, (b) a different field's AAD, (c) a different row's AAD, (d) org B's AAD
  each raises `DecryptionError`. Ciphertext cannot be relocated across org / field / row.
- **Fail-closed on missing key.** `EMS_ENV=production` with no `EMS_MASTER_KEY` **refuses
  to start** — never a silent plaintext mode.
- **Wrong key is safe.** Encrypted fields read back as `None` (never the token, never a
  500); the stored ciphertext is **unchanged / not overwritten**.
- **Corrupted ciphertext** → that field reads `None` (HTTP 200), other records unaffected,
  the corrupt value is **not** silently emptied/overwritten.
- **Corrupted wrapped DEK** → only that org is unreadable, the other org is fine, no
  global crash, and **no fresh DEK is auto-generated** over the encrypted dataset.
- **Master-key rotation** (envelope): add `v2`, `flask rewrap-org-keys` → both orgs at
  version 2, data readable; drop `v1` → still readable (ciphertext is *not* re-encrypted,
  only the DEK is re-wrapped).
- **Interrupted rotation is resumable + idempotent.** A partial rotation (one org rewrapped)
  resumes cleanly on re-run; re-running again is a no-op; no corruption.
- **Stolen backup is useless without the key.** With the full DB dump but no
  `EMS_MASTER_KEY`, unwrapping a DEK is **refused** ("master key version unavailable").
- **Tenant isolation / IDOR.** From an org A session, every cross-org GET/PUT/PATCH/DELETE
  against org B's real ids (patient, call, employee, documents, task) returns **404**;
  list endpoints exclude the other org; **org_id tampering** in the request body is
  ignored (the row is forced into the caller's org).
- **Blind index.** Exact search on `member_id` and `dob` works, is normalised
  (case + surrounding space), and uses **per-org scoped keys** — the same plaintext
  produces **different** blind-index bytes in different orgs (no cross-tenant
  correlation), and the index is a keyed hash (no plaintext).

## Intentionally plaintext (accepted, not defects)

| Field(s) | Why | Mitigation |
|---|---|---|
| `first_name` / `last_name` | substring-searched + alphabetically paginated (a blind index can't do either) | tenant isolation + RBAC + `is_sensitive` masking + DB-at-rest disk encryption; see [design/DOB_LASTNAME_ENCRYPTION.md](design/DOB_LASTNAME_ENCRYPTION.md) |
| `Call.pickup/dropoff_address` | carried by realtime SSE events + notification bodies + CSV export; operational data every dispatcher needs | as above; see [DATA_CLASSIFICATION.md](DATA_CLASSIFICATION.md) #5 |
| document `filename`, ids, org_id, status, timestamps, `dob_month_day` (MM-DD, no year), blind indexes | non-identifying or structurally required | — |

## Not executed in this pass (environment-limited — not defects)

These need a Docker/PostgreSQL host and/or a browser and were **not** run; none is
contradicted by evidence, but none was independently verified here. CI covers the
happy-path prod stack.

- **Prod-stack failure recovery** — Redis down, Gunicorn worker kill, PostgreSQL down
  (needs the running prod stack; Docker was unavailable).
- **Scale performance** — P95 at 5/25/100 users, 250k / 1M calls (needs PostgreSQL;
  SQLite numbers are deliberately *not* substituted).
- **Live concurrency / session** — real multi-client races, disable-while-active
  (needs a concurrent live server + browsers).
- **Full DR rebuild** — destroy server → restore from backup + key (needs Docker).
- **Windows desktop lifecycle** — install/upgrade/uninstall (the frozen backend boot was
  verified separately; full lifecycle not run).
- **Accessibility / frontend performance** — no browser driver in the audit pass.

## Verdict

**PASS WITH CONDITIONS.** The data-protection core is experimentally proven; the
conditions are the un-run production-stack resilience and scale-performance areas, which
should be exercised on a Docker/PostgreSQL host before a multi-user pilot. See
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for the deployment posture and
[OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) for DR/backups/keys.
