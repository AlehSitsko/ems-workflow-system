"use strict";

/**
 * Single place that knows the difference between the four run modes and where
 * everything lives — so the rest of the desktop code never scatters `if
 * (app.isPackaged)` checks around. See section 10 of the spec.
 */

const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const isPackaged = app.isPackaged;
const REPO_ROOT = path.resolve(__dirname, "..");

/**
 * Windows user-data locations. Kept out of the install dir / app.asar so the
 * database and uploads survive an update or reinstall, and are split by kind.
 */
function resolveDataPaths() {
  const root = app.getPath("userData");
  const paths = {
    root,
    // Flask instance dir → uploads live under here (uploads/documents/…).
    instance: path.join(root, "appdata"),
    database: path.join(root, "database"),
    logs: path.join(root, "logs"),
    backups: path.join(root, "backups"),
  };
  for (const dir of [paths.instance, paths.database, paths.logs, paths.backups]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  paths.dbFile = path.join(paths.database, "ems.sqlite");
  // SQLAlchemy sqlite URL wants forward slashes even on Windows.
  paths.databaseUrl = "sqlite:///" + paths.dbFile.replace(/\\/g, "/");
  return paths;
}

/**
 * How to launch the packaged Flask backend, and where the built SPA lives, for
 * the current mode.
 *
 * - packaged: a PyInstaller onedir exe under resources/backend, and the SPA under
 *   resources/frontend (both added by electron-builder's extraResources).
 * - dev: the project venv's python running backend/desktop_server.py, serving the
 *   already-built frontend/dist. (Build the frontend once with `npm run build`.)
 */
function resolveBackend() {
  if (isPackaged) {
    const resources = process.resourcesPath;
    return {
      command: path.join(resources, "backend", "ems-backend.exe"),
      args: [],
      cwd: path.join(resources, "backend"),
      spaDir: path.join(resources, "frontend"),
    };
  }
  const venvPython = path.join(
    REPO_ROOT, "backend", "venv", "Scripts",
    process.platform === "win32" ? "python.exe" : "python",
  );
  return {
    command: venvPython,
    args: [path.join(REPO_ROOT, "backend", "desktop_server.py")],
    cwd: path.join(REPO_ROOT, "backend"),
    spaDir: path.join(REPO_ROOT, "frontend", "dist"),
  };
}

const APP_BASE_PATH = "/ems-workflow-system/"; // must match vite.config.js `base`

module.exports = {
  isPackaged,
  REPO_ROOT,
  APP_BASE_PATH,
  resolveDataPaths,
  resolveBackend,
  appVersion: app.getVersion(),
};
