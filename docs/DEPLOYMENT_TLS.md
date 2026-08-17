# Deployment: TLS termination in front of Nginx

The production stack (`docker-compose.prod.yml`) serves the app over **plain HTTP on
port 8080** and is built to sit **behind a TLS-terminating reverse proxy or load
balancer**. It does not terminate TLS itself and does not redirect HTTP→HTTPS or send
HSTS — those are the terminator's job. This guide shows how to put TLS in front of it.

```
            HTTPS 443                 HTTP 8080                 HTTP 5050
Browser ───────────────▶ TLS proxy ───────────▶ frontend ───────────▶ backend ──▶ Postgres
 (HSTS,               (Caddy / nginx /        (Nginx: SPA +          (Gunicorn)     Redis
  http→https)          cloud LB)               proxy /api)                          S3
```

The TLS proxy is the **only** thing that needs a public port and a certificate. Keep
Postgres, Redis and the backend on the internal network, unpublished.

## What the app already does (so you don't have to)

- **Secure session cookie.** With `EMS_ENV=production`, `SESSION_COOKIE_SECURE`
  defaults to **`1`** — the session cookie is `Secure` + `HttpOnly` + `SameSite=Lax`,
  so it only travels over HTTPS. **Do not set `SESSION_COOKIE_SECURE=0` in real
  production** (it exists only to smoke-test the stack over plain HTTP locally).
- **CORS for tenant subdomains.** Origins matching `https://<sub>.${BASE_DOMAIN}` (and
  the apex / `PLATFORM_HOST`) are admitted automatically once `BASE_DOMAIN` is set; add
  any other origin to `CORS_ORIGINS`.
- **SSE realtime** is served under `/api/events/` and the *internal* Nginx is already
  configured to stream it. Your front proxy must stream it too — see below.

## What the TLS proxy must do

1. **Terminate TLS** on 443 with a valid certificate and proxy to the `frontend`
   container on **8080** (`http://frontend:8080` inside compose, or the published host
   port).
2. **Redirect HTTP→HTTPS** (port 80 → 443).
3. **Send HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   (the app does not send it).
4. **Forward the real scheme/host**: `X-Forwarded-Proto https`, `Host`,
   `X-Forwarded-For` (the internal Nginx passes these on to Gunicorn).
5. **Stream SSE** for `/api/events/`: HTTP/1.1, response buffering **off**, and a long
   read timeout — otherwise realtime works everywhere except through your proxy (the
   events hang in a buffer). This is the single most common TLS-proxy mistake here.

## Certificates

- **Single host** (one domain, no tenant subdomains): a normal cert via Let's Encrypt
  **HTTP-01** is enough. Caddy and certbot both do this automatically.
- **Subdomain multi-tenancy** (`acme.example.com`, `admin.example.com`, …): you need a
  **wildcard** `*.${BASE_DOMAIN}` cert **plus** the apex, which Let's Encrypt only
  issues via a **DNS-01** challenge (a DNS-provider API token). Caddy's DNS plugins or
  `certbot --dns-<provider>` handle this.

## Option A — Caddy (recommended: automatic HTTPS)

Caddy obtains and renews certs automatically and gets the SSE + headers right with
almost no config. Add it as an overlay in front of the prod stack:

`docker-compose.tls.yml`
```yaml
name: ems-prod
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data          # persists issued certificates
      - caddy_config:/config
    depends_on: [frontend]
    restart: unless-stopped
  frontend:
    ports: []                     # stop publishing 8080 publicly; Caddy reaches it internally
volumes:
  caddy_data:
  caddy_config:
```

`Caddyfile` (single host — Caddy adds HSTS and redirects HTTP→HTTPS on its own):
```
ems.example.com {
    reverse_proxy frontend:8080
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
```

Wildcard for tenant subdomains needs a DNS plugin and a token, e.g.:
```
*.example.com, example.com {
    tls { dns cloudflare {env.CLOUDFLARE_API_TOKEN} }
    reverse_proxy frontend:8080
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
```
Run: `... docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml up -d`
(with `BASE_DOMAIN=example.com`, `SECRET_KEY`, `POSTGRES_PASSWORD`, `EMS_MASTER_KEY`,
`EMS_REDIS_URL` set). Caddy streams SSE correctly by default — no extra tuning.

## Option B — Nginx as the TLS reverse proxy

If you already run Nginx at the edge (or terminate on the host), a server block:

```nginx
# Redirect all HTTP to HTTPS.
server {
    listen 80;
    server_name example.com *.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name example.com *.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # SSE realtime — must stream (no buffering), like the app's internal Nginx.
    location /api/events/ {
        proxy_pass http://frontend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://frontend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_http_version 1.1;
    }
}
```
Obtain/renew certs with certbot (`--nginx`, or `--dns-<provider>` for the wildcard).
`frontend:8080` is the compose service; use the published host/port if the proxy runs
outside the compose network.

## Option C — Cloud load balancer (ALB / GCLB / etc.)

Terminate TLS on the managed LB (attach an ACM/managed cert, add an HTTP→HTTPS
redirect and an HSTS response-header policy) and forward to the `frontend` target on
8080. Two things to check:

- **Health check** → `GET /api/health` (expects `200`, `{"status":"ok"}`).
- **Idle timeout** long enough for SSE (the stream is long-lived; the app sends a
  keepalive every ~20 s, so an idle timeout above that keeps it open). Disable response
  buffering if the LB offers the option.

## Required environment when behind TLS

| Variable | Set to |
|---|---|
| `EMS_ENV` | `production` (makes the session cookie `Secure` by default, and requires `EMS_MASTER_KEY`) |
| `SESSION_COOKIE_SECURE` | leave unset/`1` — **never `0`** in real production |
| `BASE_DOMAIN` | your apex, e.g. `example.com` (drives subdomain routing + CORS) |
| `PLATFORM_HOST` | the super-admin host, e.g. `admin.example.com` |
| `CORS_ORIGINS` | only needed for origins **not** under `*.${BASE_DOMAIN}` |
| `SECRET_KEY`, `POSTGRES_PASSWORD`, `EMS_MASTER_KEY`, `EMS_REDIS_URL` | as for any prod deploy |

## Verify

```bash
# 1. Health over HTTPS
curl -sS https://example.com/api/health          # {"status":"ok",...}

# 2. HTTP redirects to HTTPS
curl -sI http://example.com | grep -i location    # Location: https://example.com/

# 3. HSTS present
curl -sI https://example.com | grep -i strict-transport-security

# 4. Session cookie is Secure (log in, inspect Set-Cookie)
curl -si https://example.com/api/auth/login -H 'Content-Type: application/json' \
     -d '{"username":"...","password":"..."}' | grep -i set-cookie   # ...; Secure; HttpOnly; SameSite=Lax

# 5. SSE streams through the proxy (should hang open, printing ": connected" then keepalives,
#    NOT return immediately or buffer). Ctrl-C to stop.
curl -N https://example.com/api/events/stream -H 'Cookie: session=<your session cookie>'
```

If SSE returns instantly or never prints, the proxy is buffering `/api/events/` —
revisit step 5 of "What the TLS proxy must do".

## Notes

- The stack's internal Nginx (`frontend/nginx.conf`) already forces document downloads
  as attachments with `nosniff` and streams SSE; the front proxy only needs to preserve
  that (don't add response buffering on `/api/events/`).
- HTTPS is **required** in production for the `Secure` session cookie to be sent at all
  — without TLS, login silently fails because the browser withholds the cookie.
