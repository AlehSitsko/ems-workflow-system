import { defineConfig, devices } from "@playwright/test";

// Browser smoke against an ALREADY-RUNNING production stack (Nginx + Gunicorn +
// Postgres + Redis), not a disposable dev server. CI brings the prod Docker
// Compose stack up, seeds demo accounts, then runs this against it. The point is
// to catch what `curl /` cannot: assets returning the wrong MIME type, JS module
// load failures, and console errors in a real browser — i.e. the Vite/Nginx
// base-path class of bug.
const BASE = process.env.PROD_SMOKE_URL || "http://localhost:8080/";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/prod-smoke.spec.js",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-prod" }]],
  outputDir: "test-results-prod",
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // No webServer: the stack is already up (started by the CI docker job).
});
