# TODO

The **active** backlog only. Shipped work is not tracked here — its history lives in
[docs/COMPLETED_BLOCKS.md](docs/COMPLETED_BLOCKS.md) and
[docs/INFRASTRUCTURE_REPORT.md](docs/INFRASTRUCTURE_REPORT.md); the phased view is in
[docs/ROADMAP.md](docs/ROADMAP.md). Every `[ ]` below is genuinely not implemented.

## Planned (next reasonable work)

- [ ] **Remaining field encryption.** Patient + employee contact PII and patient
  free-text are now encrypted (migrations `f4a1c9e07b30`, `a7c3e1f95d24`). Still
  plaintext by design and needing a derived-index/search design first: `dob` and
  `last_name` (birthday calendar + duplicate detection + search). Lower-priority
  candidates: `Call` addresses/phone (filtered/sorted — needs query rework) and
  `EmployeeDocument.document_number`. See
  [docs/DATA_CLASSIFICATION.md](docs/DATA_CLASSIFICATION.md).
- [ ] **Deployment hardening.** TLS termination in front of the prod Nginx, a
  documented backup / disaster-recovery runbook, and live S3/MinIO verification plus
  a local→S3 object migration for an existing deployment.
- [ ] **Analytics at scale.** The Supervisor Dashboard still groups a bounded window
  of calls in Python; move to indexed SQL aggregation + operational-day rollups if
  real volume warrants it.

## Deferred (intentionally parked — not oversights)

- [ ] **External (Google/Outlook) two-way calendar sync** — needs an OAuth
  integration and a separate privacy/security policy before any patient data could
  cross the boundary. ICS **export** already ships.
- [ ] **Route optimization** — a research problem (routing engine, constraints), not a
  near-term build.
- [ ] **Configurable rate engine for trip pricing.** The Call Intake Price Calculator
  is a client-side *estimate helper* only (base + mileage×rate, ±return ride, one-time
  waiting fee) and is not persisted to a call. A real engine — per-org rate tables,
  service-level pricing, mileage tiers — would live in the backend as the source of
  truth for a persisted, billable amount. Not started.
