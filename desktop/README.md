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

> **Sensitive fields are encrypted at rest** with a per-install key protected by
> your Windows account (see [Security posture](#security-posture)). Keep your
> **recovery key** (shown on first run, and under Help → *Show encryption recovery
> key…*) somewhere safe — you need it to read your data after a Windows reinstall or
> on another PC.

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

# 3. Build the installer → desktop/release/EMS-Workflow-System-Setup.exe
cd ..\desktop; npm run dist
```

**Artifacts** land in `desktop\release\`:
- `EMS-Workflow-System-Setup.exe` — the NSIS installer (~103 MB). The name is
  intentionally version-less so the GitHub `releases/latest/download/` URL is a
  stable direct-download link; the release *tag* carries the version.
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

**Update check (in-app, notify-only).** On startup a packaged build quietly asks
GitHub for the latest published release (`updater.js` → the repo's
`releases/latest`) and compares it to `app.getVersion()`. If a newer version
exists it shows a native prompt — *"EMS Workflow System X is available"* — with
**Get the update** / **Later** and a *"Don't remind me about this version"* option
that the startup check remembers. You can also trigger it any time from
**Help → Check for updates…**. The check never blocks launch and fails silently
(no network, GitHub down → no dialog); it never downloads or installs anything on
its own.

**Applying an update — no clean reinstall, data preserved.** *Get the update*
opens the release's installer in your browser. Run it **over the existing
install**: everything under `%APPDATA%\ems-workflow-desktop\` (database, uploaded
documents, settings) is kept, and the app auto-backs-up the DB before the
(possibly migrating) first launch of the new version, then restarts on it. It is
**not** an uninstall/reinstall and does not touch your data.

Fully **install-free** apply-on-restart (download + swap in the background, no
installer run at all) needs `electron-updater` against a signed release feed
(`latest.yml`); that's the next step once the build is code-signed. The version
check above is the first half and works today.

## Security posture

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; the
  renderer gets **no** Node or filesystem — only a tiny allowlisted preload bridge.
- Backend binds **127.0.0.1 only**, on a random ephemeral port.
- Single-instance lock, so a second launch can't corrupt the one SQLite file.
- Navigation allowlist (only the local origin); `window.open` denied; external
  links open in the system browser; a strict CSP; DevTools not opened by default.
- Uploaded files are download-only + `nosniff` and content-validated (see the
  main security docs) — nothing an upload contains is executed by the app.
- **Sensitive fields are encrypted at rest.** On first run the app generates a
  32-byte master key and stores it protected by the OS keychain — **Windows DPAPI**
  via Electron `safeStorage`, so the stored key can only be decrypted by the same
  Windows user account. That key is passed to the backend as `EMS_MASTER_KEY` (in
  memory only, never written to disk in the clear), which encrypts patient PHI,
  contact details, caller phone/notes and document numbers with AES-256-GCM. On the
  first launch with a key, any pre-existing plaintext is encrypted in place after
  the automatic pre-launch backup.
  - **Recovery key.** Because the key is tied to your Windows account, a Windows
    reinstall, a different user account, or moving the data to another PC would
    otherwise make it unreadable. The app shows a **recovery key** on first run and
    under **Help → Show encryption recovery key…** — save it somewhere safe (e.g. a
    password manager). Anyone with this key *and* a copy of your data can read it, so
    keep it private.
  - Full-disk encryption (BitLocker) and a password-protected Windows account remain
    good defence in depth. If the OS keychain is unavailable (unusual on Windows),
    the app still encrypts the database but stores the key file unprotected and logs
    a warning.

## Known limitations

- Unsigned (SmartScreen warning); because `signAndEditExecutable: false`, the raw
  app `.exe` keeps generic Electron file metadata in Explorer (the installer,
  window, taskbar, Start-Menu/desktop shortcuts and About dialog all carry the
  real icon and "EMS Workflow System" name — only the bare `.exe` icon is generic
  until code-signing is configured).
- Web push, external calendar sync, and breach-corpus checks need the internet and
  are inert offline (by design); the rest of the app — including all fonts, icons
  and Bootstrap — is bundled locally and fully offline.
- No malware scanning of uploads in this MVP — `backend/utils/file_validation.py`
  exposes a `scan_upload()` seam for a future scanner.
