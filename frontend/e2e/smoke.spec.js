import { test, expect } from "@playwright/test";
import { login } from "./helpers.js";

test("the disposable backend is healthy and reports qa_mode", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.qa_mode).toBe(true); // never a real backend
});

test("a dispatcher can sign in and reach the dashboard", async ({ page }) => {
  await login(page, "dispatcher");
  await expect(page).toHaveURL(/#\/home/);
  await expect(page.getByText(/needs attention/i).first()).toBeVisible();
});

test("bad credentials show a clear error, not a crash", async ({ page }) => {
  await page.goto("#/login");
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: /login/i }).click();
  await expect(page.getByText(/invalid username or password/i)).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/#\/login/);
});
