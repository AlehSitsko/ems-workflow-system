# EMS Workflow System — Standalone Windows Desktop (Electron)

A local, single-user, offline-capable Windows build of the EMS Workflow System.
It is an **Electron shell** over the *same* React frontend and Flask backend as
the web version — no separate copy, no forked schema. The web version is
unaffected and continues to build and deploy as before.

## Architecture

```
┌─────────────────────────── Electron main process ───────────────────────────┐
│  main.js      lifecycle, single-instance lock, splash/error/retry, menu,     │
│               security hardening, graceful shutdown                          │
│  backend.js   pick a free 127.0.0.1 port → spawn the backend → health-gate   │
│  backup.js    WAL-aware file backup / restore, pre-launch auto-backup        │
│  config.js    the ONE place that knows dev-vs-packaged paths                 │
│  preload.js   tiny sandboxed contextBridge (no Node/fs in the renderer)      │
└──────────────────────────────────────────────────────────────────────────────┘
        │ spawns (127.0.0.1:<random port>, loopback only)
        ▼
   ems-backend.exe   ← PyInstaller onedir of backend/desktop_server.py
   (Flask + waitress) migrates the DB to head, enables WAL, serves BOTH the API
                      and the built SPA on one origin — so the SameSite=Lax
                      session cookie and CSRF work exactly as on the web.
```

**Why one origin?** The renderer loads `http://127.0.0.1:<port>/ems-workflow-system/`
and the API is `http://127.0.0.1:<port>/api/...` — same origin, so the existing
auth model needs no insecure desktop-only branch.

**Backend packaging: PyInstaller onedir.** Chosen over onefile (which re-extracts
to a temp dir on every launch — slow, antivirus-triggering, and awkward for the
Alembic migration data files) and over shipping an embedded Python + venv
(fragile path handling). Onedir bundles CPython + all deps + the migration scripts
as real files under `resources/backend/`.

## Data locations (Windows)

Everything the user creates lives under `app.getPath("userData")`, i.e.
`%APPDATA%\ems-workflow-desktop\`, **outside** the install dir and `app.asar`, so
it survives updates and reinstalls:

| Path | Contents |
|------|----------|
| `database\ems.sqlite` (+ `-wal`, `-shm`) | the SQLite database (WAL mode) |
| `appdata\uploads\documents\` | uploaded employee documents |
| `logs\backend.log` | backend stdout/stderr |
| `backups\ems-backup-prelaunch-*` | automatic pre-launch snapshots (last 5) |

Uninstalling does **not** delete this folder (`deleteAppDataOnUninstall: false`).

## First run

The database starts empty. The login screen detects this
(`GET /api/auth/needs-setup`) and shows a **"create your administrator"** form
instead (`POST /api/auth/setup`). Both endpoints are self-closing — once any user
exists they are inert. No demo data is seeded automatically.

## Backup / restore

From the **File** menu:
- **Create backup…** → a timestamped folder under `backups\`.
- **Export backup to folder…** → the same, to a folder you choose.
- **Restore from backup…** → pick a backup folder; it is **validated** (SQLite
  header check) and your current database is snapshotted first, then the app
  restarts on the restored DB. A restore never overwrites the live DB before the
  chosen file is validated.
- **Open data folder** → opens `%APPDATA%\ems-workflow-desktop\` in Explorer.

Every launch also takes an automatic snapshot before running migrations, so an
upgrade that changes the schema is always recoverable.

## Prerequisites (build machine only — end users need nothing)

- Node.js 20+ and npm
- Python 3.13 with the backend venv set up (`backend/venv`) and
  `pip install -r backend/requirements-desktop.txt` (adds waitress)
- `pip install pyinstaller` (build-time only)

## Run in development

```powershell
# 1. Build the frontend once (the backend serves dist/).
cd frontend; npm ci; npm run build

# 2. Install the desktop deps and launch Electron against the venv backend.
cd ..\desktop; npm install; npm start
```

`npm start` runs Electron, which spawns `backend/venv/Scripts/python.exe
backend/desktop_server.py`. No packaging needed for dev.

## Build the Windows installer

```powershell
# 1. Build the frontend.
cd frontend; npm run build

# 2. Package the backend into a self-contained exe (onedir) → backend/dist/ems-backend/.
cd ..\backend; .\venv\Scripts\python.exe -m PyInstaller --clean --noconfirm ems-backend.spec

# 3. Build the installer → desktop/release/EMS-Workflow-System-Setup-<version>.exe
cd ..\desktop; npm run dist
```

**Artifacts** land in `desktop\release\`:
- `EMS-Workflow-System-Setup-<version>.exe` — the NSIS installer (~103 MB)
- `win-unpacked\` — the unpacked app (useful for a quick `--dir` smoke test)

Installer behaviour: per-user (no admin required), lets the user change the
install directory, creates Start-Menu and (optional) desktop shortcuts, and
supports upgrading in place over a previous version while preserving user data.

## Signing, SmartScreen, and the unsigned build

This build is **unsigned** — there is no code-signing certificate configured, so:

- Windows **SmartScreen** will warn ("Windows protected your PC") on first run;
  the user must click *More info → Run anyway*. This is expected for any unsigned
  installer and is **not** a sign of a problem.
- `signAndEditExecutable: false` is set in `package.json` so the build does not
  invoke `winCodeSign`/`rcedit`. That side-steps a Windows symlink-privilege issue
  when extracting `winCodeSign` without Developer Mode/admin, at the cost of the
  app `.exe` keeping generic Electron file metadata (the installer, window title,
  shortcut name and About dialog all still say "EMS Workflow System").

**To ship a signed build later:** obtain an OV/EV Authenticode certificate, then
set `CSC_LINK` (path to the `.pfx`) and `CSC_KEY_PASSWORD` in the environment and
remove `signAndEditExecutable: false`. electron-builder will sign the app and the
installer automatically. An EV certificate also clears SmartScreen reputation
immediately; an OV certificate builds reputation over time.

## Updates

Auto-update is **deliberately not enabled** — it needs a trusted update source and
signature verification, which in turn needs code signing. For now, updating is:
**download the new installer and run it over the existing install.** User data in
`%APPDATA%\ems-workflow-desktop\` is preserved, and the app auto-backs-up the DB
before the (possibly migrating) first launch of the new version. A future signed
release can add `electron-updater` against a real release feed.

## Security posture

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; the
  renderer gets **no** Node or filesystem — only a tiny allowlisted preload bridge.
- Backend binds **127.0.0.1 only**, on a random ephemeral port.
- Single-instance lock, so a second launch can't corrupt the one SQLite file.
- Navigation allowlist (only the local origin); `window.open` denied; external
  links open in the system browser; a strict CSP; DevTools not opened by default.
- Uploaded files are download-only + `nosniff` and content-validated (see the
  main security docs) — nothing an upload contains is executed by the app.

## Known limitations

- Unsigned (SmartScreen warning); generic exe file metadata (see above).
- Default Electron window/taskbar icon — a branded `build/icon.ico` can be dropped
  in and `win.icon` set once available.
- Web push, external calendar sync, and breach-corpus checks need the internet and
  are inert offline (by design); the rest of the app is fully local.
- No malware scanning of uploads in this MVP — `backend/utils/file_validation.py`
  exposes a `scan_upload()` seam for a future scanner.
