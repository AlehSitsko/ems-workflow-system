import { test, expect } from "@playwright/test";
import { login } from "./helpers.js";

// Permissions must hold in three places at once: the sidebar (no dead links), the
// router (a direct URL is refused), and the backend (the API is the real gate —
// a hidden button is never the boundary).

test.describe("roles & permissions (real browser)", () => {
  test("HR is denied the Dispatch Board: no menu link, URL redirects, API 403", async ({ page }) => {
    await login(page, "hr");
    await expect(page.locator('a[href="#/dispatch"]')).toHaveCount(0);

    await page.goto("#/dispatch");
    await expect(page).toHaveURL(/#\/home/); // bounced home, board never rendered

    const res = await page.request.get("/api/dispatch/board?date=2026-08-07");
    expect(res.status()).toBe(403);
  });

  test("a dispatcher cannot manage users: no menu link, URL redirects, API 403", async ({ page }) => {
    await login(page, "dispatcher");
    await expect(page.locator('a[href="#/users"]')).toHaveCount(0);

    await page.goto("#/users");
    await expect(page).toHaveURL(/#\/home/);

    const res = await page.request.get("/api/auth/users");
    expect(res.status()).toBe(403);
  });

  test("an admin can reach both user management and the dispatch board", async ({ page }) => {
    await login(page, "admin");
    // Positive control: the API allows the admin.
    expect((await page.request.get("/api/auth/users")).status()).toBe(200);
    expect((await page.request.get("/api/dispatch/board?date=2026-08-07")).status()).toBe(200);

    // And the user-management screen renders (not redirected home).
    await page.goto("#/users");
    await expect(page).toHaveURL(/#\/users/);
  });
});
