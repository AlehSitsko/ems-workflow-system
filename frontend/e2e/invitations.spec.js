import { test, expect } from "@playwright/test";
import { login } from "./helpers.js";

test("an admin invites a user who accepts the invite and is signed in", async ({ browser }) => {
  // Admin creates an invitation (via the authenticated API — CSRF armed by login()).
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await login(adminPage, "admin");
  const res = await adminPage.request.post("/api/invitations", {
    data: { email: "invitee@example.com", role: "dispatcher" },
  });
  expect(res.status(), await res.text()).toBe(201);
  const token = (await res.json()).token;
  expect(token).toBeTruthy();

  // A fresh browser context (no session) = the invitee opening the link.
  const inviteeCtx = await browser.newContext();
  const page = await inviteeCtx.newPage();
  await page.goto(`#/accept-invite?token=${token}`);

  // The invitation details load, then the invitee creates credentials.
  await expect(page.getByText(/joining/i)).toBeVisible({ timeout: 15_000 });
  await page.locator("#ai-username").fill("newdispatcher");
  await page.locator("#ai-password").fill("Str0ngPass!");
  await page.locator("#ai-confirm").fill("Str0ngPass!");
  await page.getByRole("button", { name: /create account/i }).click();

  // The server signed them in; the app lands on the dashboard.
  await expect(page.getByText(/needs attention/i).first()).toBeVisible({ timeout: 20_000 });

  await adminCtx.close();
  await inviteeCtx.close();
});

test("an invalid invitation link shows a clear error", async ({ page }) => {
  await page.goto("#/accept-invite?token=not-a-real-token");
  await expect(page.getByText(/invalid|expired|invitation/i).first()).toBeVisible({ timeout: 15_000 });
});
