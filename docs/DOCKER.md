# Docker development environment

A reproducible way to run the whole system without installing Python, Node or
their dependencies on the host.

**This is a development and demo setup, not a deployment.** It runs both
development servers, keeps SQLite, and has no reverse proxy, TLS, process
manager or secret management. What production would need is a separate piece of
work — see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Running it

```bash
docker compose up --build
```

* Frontend — <http://127.0.0.1:5173/ems-workflow-system/>
* Backend — <http://127.0.0.1:5050/api/health>

The frontend waits for the backend to report healthy before it starts, so the
first request never lands on a server that is still applying migrations.

```bash
docker compose down       # stop; the database volume survives
docker compose down -v    # stop and discard the database
```

## What happens on startup

1. The backend applies `flask db upgrade`, so a fresh volume gets a full schema
   with no manual step and an existing one is upgraded in place.
2. The Flask development server binds `0.0.0.0` inside the container — the host
   still reaches it only through the published port.

Demo users are **never** created automatically. Seed them explicitly when you
want them:

```bash
docker compose exec backend flask --app app seed-demo
```

## Data

The SQLite file lives on the named volume `backend_instance`, mounted at
`/app/instance`. Two consequences worth knowing:

* rebuilding the image does not wipe the database;
* the container's database is **separate** from `backend/instance/database.db`
  on the host, so running in Docker cannot damage your local dev data.

## Configuration

`docker-compose.yml` sets what the containers need. For anything else, copy
`.env.example` to `.env` — Compose reads it automatically.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Database location. Compose points it at the named volume. |
| `FLASK_RUN_HOST` | `0.0.0.0` in a container. Unset elsewhere, which keeps the dev server on loopback. |
| `FLASK_RUN_PORT`, `FLASK_DEBUG` | Port and reload. |
| `VITE_API_BASE_URL` | Resolved by the **browser**, so it is the host's published port (`http://127.0.0.1:5050`), not the compose service name. |

## Editing code

Both services bind-mount their source, so the Flask reloader and Vite HMR work
as they do outside Docker. `node_modules` is deliberately kept inside the image
(an anonymous volume shadows the host directory) — the host's copy may hold
binaries built for a different platform, or not exist at all.

## Deliberately out of scope (for *this* dev compose)

This development compose deliberately stays minimal: no PostgreSQL, Nginx, Redis,
Celery or Kubernetes — those belong to the production stack above
(`docker-compose.prod.yml`), not to the hot-reload dev environment. Redis-backed
event fan-out and Kubernetes remain unbuilt (see
[INFRASTRUCTURE_REPORT.md](INFRASTRUCTURE_REPORT.md) → *Remaining / planned*).

## Production stack

A separate `docker-compose.prod.yml` runs the production-style stack — Gunicorn
(3 workers) behind an Nginx that serves the built SPA and proxies `/api`, on
**PostgreSQL**, with **Redis** as the realtime broker — all non-root images with the
source baked in. Its server-profile environment is documented in
[INFRASTRUCTURE_REPORT.md](INFRASTRUCTURE_REPORT.md); two variables are **required**
in production and the app refuses to start without them:
- `EMS_MASTER_KEY` — field-encryption master key (PHI is never stored plaintext in
  production).
- `EMS_REDIS_URL` — realtime broker; with >1 worker the gunicorn guard refuses to
  boot without it, since the in-memory bus can't fan events across workers.

It expects to sit behind a TLS-terminating proxy. To smoke it locally over plain HTTP:

```bash
SECRET_KEY=$(openssl rand -hex 32) POSTGRES_PASSWORD=$(openssl rand -hex 16) \
  EMS_MASTER_KEY=$(openssl rand -base64 32) \
  SESSION_COOKIE_SECURE=0 BASE_DOMAIN=ems.example.com \
  docker compose -f docker-compose.prod.yml up --build --wait
```

(`EMS_REDIS_URL` defaults to the bundled `redis` service.)

## Verification status

The compose file and both Dockerfiles are covered by the `docker` job in
`.github/workflows/ci.yml`, which builds each image on every push. It now also
**boots the production stack and smoke-tests it**: `docker compose
-f docker-compose.prod.yml up --wait` blocks on the Postgres and backend
healthchecks (the backend runs the full migration chain against PostgreSQL on
startup), then a `/api/health` curl through Nginx proves the whole
Nginx → Gunicorn → Postgres chain. So both the dev and prod stacks are known-good,
and the migrations are exercised against real PostgreSQL — not only SQLite.

The stack has been **run end to end** on Docker Desktop (engine 29.6.2, WSL2
linux containers): both images build, `docker compose config` validates, the
backend applies every migration to head on a fresh volume, its `/api/health`
healthcheck passes, and the frontend starts only after the backend reports
healthy (the `service_healthy` dependency). `/api/health` answers 200, an
explicit `flask --app app seed-demo` creates the demo users, login then
succeeds, and the app HTML is served under the `/ems-workflow-system/` base
path. A `down` / `up` cycle keeps the seeded database, confirming the named
volume persists it across restarts.
