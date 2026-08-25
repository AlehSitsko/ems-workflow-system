import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

// One backend on a fixed loopback test port, serving the built SPA + API on a
// throwaway migrated+seeded database. Never the dev/prod DB.
const PORT = Number(process.env.EMS_E2E_PORT || 5111);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const APP_URL = `${ORIGIN}/ems-workflow-system/`;

const DIST = path.join(__dirname, "dist");
// The backend interpreter for the disposable e2e_server. Overridable via
// EMS_E2E_PYTHON (CI points it at the job's venv); otherwise the repo venv, using
// the correct per-platform layout (Windows: venv\Scripts\python.exe, POSIX:
// venv/bin/python).
const PY = process.env.EMS_E2E_PYTHON || path.join(
  REPO, "backend", "venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python",
);
// A fresh temp DB per run; global-teardown removes the whole dir.
const E2E_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ems-e2e-"));
const DB = path.join(E2E_DIR, "ems.sqlite");
process.env.EMS_E2E_DIR = E2E_DIR; // handed to global-teardown

export default defineConfig({
  testDir: "./e2e",
  // prod-smoke.spec.js runs against the real prod Docker stack via
  // playwright.prod.config.js, not this disposable dev server.
  testIgnore: "**/prod-smoke.spec.js",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Shared backend state → keep it serial and deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  globalTeardown: "./e2e/global-teardown.js",
  use: {
    baseURL: APP_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `"${PY}" e2e_server.py --port ${PORT} --db "${DB}"`,
    cwd: path.join(REPO, "backend"),
    url: `${ORIGIN}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { EMS_SERVE_SPA: DIST, EMS_QA: "1" },
  },
});

export { APP_URL, ORIGIN };
