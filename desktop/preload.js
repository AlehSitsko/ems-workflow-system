"use strict";

/**
 * The ONLY bridge between the untrusted renderer and the main process.
 *
 * Deliberately tiny and allowlisted: the renderer gets no Node, no filesystem,
 * no `ipcRenderer`. Each exposed function maps to one named, argument-free IPC
 * channel that the main process validates. Filesystem actions (backup/restore/
 * export) run in the main process behind native dialogs — the renderer can only
 * *ask*, never touch a path itself.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("emsDesktop", {
  // A flag the web build never sets, so shared code can offer desktop-only UI.
  isDesktop: true,
  // Read-only diagnostics (versions), used by an About affordance.
  getInfo: () => ipcRenderer.invoke("desktop:get-info"),
  // Open the user-data folder in Explorer. No path crosses the bridge.
  openDataFolder: () => ipcRenderer.invoke("desktop:open-data-folder"),
  // Let the renderer tell main whether there are unsaved changes, so a window
  // close can confirm. Boolean only.
  setDirty: (dirty) => ipcRenderer.send("desktop:set-dirty", !!dirty),
  // Restart the app (used by the startup-error screen's Retry button).
  retry: () => ipcRenderer.invoke("desktop:retry"),
});
