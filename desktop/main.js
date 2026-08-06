"use strict";

const { app, BrowserWindow, Menu, dialog, shell, ipcMain, session } = require("electron");
const path = require("path");

const cfg = require("./config");
const { Backend } = require("./backend");
const backup = require("./backup");

// ── Single-instance lock: a second copy must never open the same SQLite file ──
if (!app.requestSingleInstanceLock()) {
  app.quit();
  // Nothing else runs in the second instance.
}

let mainWindow = null;
let splashWindow = null;
let backend = null;
let paths = null;
let rendererDirty = false;
let quitting = false;

const PRELOAD = path.join(__dirname, "preload.js");

// ── Security: lock down the session and every new window ─────────────────────
function hardenSession() {
  const ses = session.defaultSession;
  const self = backend ? backend.baseUrl : "";
  ses.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; " +
            "font-src 'self' data:; " +
            "connect-src 'self'; " +
            "worker-src 'self'; " +
            "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        ],
      },
    });
  });
  // Deny all permission requests (camera, geo, notifications popups, etc.).
  ses.setPermissionRequestHandler((_wc, _perm, cbk) => cbk(false));
}

function attachWindowGuards(win) {
  // No new windows: external links go to the OS browser, everything else is blocked.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // Navigation allowlist: only the local backend origin.
  win.webContents.on("will-navigate", (event, url) => {
    if (backend && url.startsWith(backend.baseUrl)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
}

function baseWebPreferences() {
  return {
    preload: PRELOAD,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webviewTag: false,
    spellcheck: false,
  };
}

// ── Windows ──────────────────────────────────────────────────────────────────
function showSplash() {
  splashWindow = new BrowserWindow({
    width: 460, height: 300, frame: false, resizable: false, show: true,
    center: true, title: "EMS Workflow System",
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
}

function showError(message) {
  if (splashWindow) { splashWindow.close(); splashWindow = null; }
  const win = new BrowserWindow({
    width: 620, height: 440, center: true, title: "EMS Workflow System — startup error",
    webPreferences: baseWebPreferences(),
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "error.html"), { query: { message } });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 640, show: false,
    title: "EMS Workflow System",
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: baseWebPreferences(),
  });
  attachWindowGuards(mainWindow);
  mainWindow.loadURL(`${backend.baseUrl}${cfg.APP_BASE_PATH}`);
  mainWindow.once("ready-to-show", () => {
    if (splashWindow) { splashWindow.close(); splashWindow = null; }
    mainWindow.show();
  });
  mainWindow.on("close", (event) => {
    if (quitting || !rendererDirty) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: "warning",
      buttons: ["Stay", "Close anyway"],
      defaultId: 0,
      cancelId: 0,
      message: "You have unsaved changes",
      detail: "Closing now will lose them. Close anyway?",
    });
    if (choice === 0) event.preventDefault();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── Startup sequence ──────────────────────────────────────────────────────────
async function startBackendAndUi() {
  paths = cfg.resolveDataPaths();
  // Safety: snapshot the DB before a launch that may run a migration.
  try { backup.autoBackup(paths, cfg.appVersion); } catch (e) { /* non-fatal */ }

  backend = new Backend({
    backend: cfg.resolveBackend(),
    paths,
    logDir: paths.logs,
  });
  backend.onUnexpectedExit((code) => {
    if (quitting) return;
    showError(`The backend process stopped unexpectedly (exit code ${code}). ` +
      `You can restart the app to try again.`);
    if (mainWindow) { mainWindow.destroy(); mainWindow = null; }
  });

  hardenSession();
  await backend.start();
  hardenSession(); // re-apply now that baseUrl is known (CSP 'self' is origin-based anyway)
  createMainWindow();
}

async function init() {
  showSplash();
  try {
    await startBackendAndUi();
  } catch (err) {
    showError(String(err && err.message ? err.message : err));
  }
}

// ── Native application menu (backup/restore/data folder/about) ────────────────
function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Create backup…",
          click: () => {
            try {
              const folder = backup.backupTo(paths, paths.backups, "manual", cfg.appVersion);
              dialog.showMessageBox(mainWindow, { type: "info", message: "Backup created", detail: folder });
            } catch (e) {
              dialog.showErrorBox("Backup failed", String(e.message || e));
            }
          },
        },
        {
          label: "Export backup to folder…",
          click: async () => {
            const res = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
            if (res.canceled || !res.filePaths[0]) return;
            try {
              const folder = backup.backupTo(paths, res.filePaths[0], "export", cfg.appVersion);
              dialog.showMessageBox(mainWindow, { type: "info", message: "Backup exported", detail: folder });
            } catch (e) {
              dialog.showErrorBox("Export failed", String(e.message || e));
            }
          },
        },
        {
          label: "Restore from backup…",
          click: async () => {
            const res = await dialog.showOpenDialog(mainWindow, {
              properties: ["openDirectory"],
              title: "Choose a backup folder (contains ems.sqlite)",
            });
            if (res.canceled || !res.filePaths[0]) return;
            const src = res.filePaths[0];
            const check = backup.validateBackup(src);
            if (!check.ok) { dialog.showErrorBox("Invalid backup", check.reason); return; }
            const confirm = dialog.showMessageBoxSync(mainWindow, {
              type: "warning", buttons: ["Cancel", "Restore"], defaultId: 0, cancelId: 0,
              message: "Restore this backup?",
              detail: "Your current database will be snapshotted first, then replaced. The app will restart.",
            });
            if (confirm !== 1) return;
            await doRestore(src);
          },
        },
        { type: "separator" },
        { label: "Open data folder", click: () => shell.openPath(paths.root) },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { label: "Edit", submenu: [{ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About EMS Workflow System",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About",
              message: "EMS Workflow System",
              detail:
                `Version: ${cfg.appVersion}\n` +
                `Electron: ${process.versions.electron}\n` +
                `Chromium: ${process.versions.chrome}\n` +
                `Node: ${process.versions.node}\n` +
                `Data folder: ${paths.root}`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function doRestore(src) {
  quitting = false;
  if (mainWindow) mainWindow.hide();
  await backend.stop();
  try {
    backup.restoreFrom(paths, src, cfg.appVersion);
  } catch (e) {
    dialog.showErrorBox("Restore failed", String(e.message || e));
  }
  // Relaunch cleanly so migrations/health run against the restored DB.
  app.relaunch();
  quitting = true;
  app.exit(0);
}

// ── IPC (validated, argument-light) ───────────────────────────────────────────
ipcMain.handle("desktop:get-info", () => ({
  appVersion: cfg.appVersion,
  electron: process.versions.electron,
  chromium: process.versions.chrome,
  node: process.versions.node,
  dataFolder: paths ? paths.root : null,
}));
ipcMain.handle("desktop:open-data-folder", () => (paths ? shell.openPath(paths.root) : null));
ipcMain.on("desktop:set-dirty", (_e, dirty) => { rendererDirty = !!dirty; });
ipcMain.handle("desktop:retry", () => { quitting = true; app.relaunch(); app.exit(0); });

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.on("second-instance", () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.whenReady().then(() => {
  buildMenu();
  init();
});

app.on("before-quit", async (event) => {
  if (quitting || !backend) return;
  event.preventDefault();
  quitting = true;
  await backend.stop();
  app.exit(0);
});

app.on("window-all-closed", () => {
  // On Windows, closing the window quits the app (and stops the backend via
  // before-quit). macOS packaging is explicitly out of scope.
  if (process.platform !== "darwin") app.quit();
});
