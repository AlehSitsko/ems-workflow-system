import { test, expect } from "@playwright/test";
import { login } from "./helpers.js";

// Runs against the REAL production stack (Nginx + Gunicorn + Postgres + Redis),
// brought up by the CI docker job. Catches the prod-only failures `curl /` can't:
// assets returning the wrong MIME type (the Vite/Nginx base-path bug), JS module
// load failures, uncaught runtime errors, broken SPA refresh, and no realtime.
test("production stack serves a working app in a real browser", async ({ page }) => {
  const badMime = [];
  const failedAssets = [];
  const pageErrors = [];
  const consoleErrors = [];
  const sseRequests = [];

  page.on("response", (res) => {
    const url = res.url();
    const ct = (res.headers()["content-type"] || "").toLowerCase();
    if (res.request().resourceType() === "script" && /\.js(\?|$)/.test(url) && !ct.includes("javascript")) {
      badMime.push(`JS ${url} -> "${ct}" (${res.status()})`);
    }
    if (res.request().resourceType() === "stylesheet" && /\.css(\?|$)/.test(url) && !ct.includes("css")) {
      badMime.push(`CSS ${url} -> "${ct}" (${res.status()})`);
    }
    if (/\/assets\//.test(url) && res.status() >= 400) failedAssets.push(`${url} -> ${res.status()}`);
    if (/\/api\/events\//.test(url)) sseRequests.push(url);
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

  // 1. The app boots with every asset at the correct MIME type.
  await page.goto("/");
  await expect(page.locator("#root")).toBeAttached();
  expect(badMime, `assets served with the wrong MIME type:\n${badMime.join("\n")}`).toEqual([]);
  expect(failedAssets, `assets failed to load:\n${failedAssets.join("\n")}`).toEqual([]);

  // 2. Login through the real form (demo accounts seeded by the CI job).
  await login(page, "admin");

  // 3. SPA routing + a refresh on a nested route (exercises Nginx try_files).
  await page.goto("#/dispatch");
  await expect(page).toHaveURL(/#\/dispatch/);
  await page.reload();
  await expect(page).toHaveURL(/#\/dispatch/);
  await expect(page.locator("#root")).toBeAttached();

  // 4. An API call works through Nginx -> Gunicorn.
  const health = await page.request.get("/api/health");
  expect(health.ok(), "GET /api/health failed through the prod proxy").toBeTruthy();

  // 5. Realtime: the app opened the SSE stream.
  await page.waitForTimeout(2500);
  expect(sseRequests.length, "the app never connected to /api/events/ (SSE)").toBeGreaterThan(0);

  // 6. No uncaught errors, and no console errors beyond well-known browser noise
  //    (favicon/manifest) and expected pre-login auth probes (401/403).
  expect(pageErrors, `uncaught runtime errors:\n${pageErrors.join("\n")}`).toEqual([]);
  const critical = consoleErrors.filter(
    (t) => !/favicon|manifest\.json/i.test(t) && !/401|403|Failed to load resource/i.test(t),
  );
  expect(critical, `unexpected console errors:\n${critical.join("\n")}`).toEqual([]);
});
