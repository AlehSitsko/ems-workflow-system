# TODO

The **active** backlog only. Shipped work is not tracked here — its history lives in
[docs/COMPLETED_BLOCKS.md](docs/COMPLETED_BLOCKS.md) and
[docs/INFRASTRUCTURE_REPORT.md](docs/INFRASTRUCTURE_REPORT.md); the phased view is in
[docs/ROADMAP.md](docs/ROADMAP.md). Every `[ ]` below is genuinely not implemented.

## Planned (next reasonable work)

- [ ] **Hash `Employee.kiosk_pin`.** It is stored plaintext, compared plaintext in
  `time_routes.py`, and returned by the employee API (`Employee.to_dict()` →
  `kioskPin`). Move to a hash (verification is already per-employee, so no blind
  index is needed), change the API to expose `hasPin` only, and migrate existing
  pins. See [docs/DATA_CLASSIFICATION.md](docs/DATA_CLASSIFICATION.md) #1.
- [ ] **Wider field encryption.** After kiosk_pin, encrypt employee / patient contact
  PII (phone, email, address, DOB) using the existing engine, staged per
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
