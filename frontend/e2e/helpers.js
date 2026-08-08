import { expect } from "@playwright/test";

// Demo accounts seeded by backend/e2e_server.py.
export const ACCOUNTS = {
  admin: { username: "admin", password: "admin" },
  supervisor: { username: "supervisor", password: "supervisor" },
  dispatcher: { username: "dispatcher", password: "dispatcher" },
  hr: { username: "hr", password: "hr" },
};

/**
 * Copy the JS-readable csrf_token cookie into an X-CSRF-Token header for every
 * request from this context — what the app's fetch interceptor does for the UI,
 * so direct API mutations (page.request / context.request) also pass CSRF.
 */
export async function armCsrf(context) {
  const cookies = await context.cookies();
  const token = cookies.find((c) => c.name === "csrf_token")?.value || "";
  await context.setExtraHTTPHeaders({ "X-CSRF-Token": token });
  return token;
}

/** Sign in through the real login form and wait for the app home to load. */
export async function login(page, role = "dispatcher") {
  const { username, password } = ACCOUNTS[role];
  await page.goto("#/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /login/i }).click();
  await page.waitForURL(/#\/home/, { timeout: 15_000 });
  await expect(page.getByText(/needs attention/i).first()).toBeVisible({ timeout: 15_000 });
  await armCsrf(page.context()); // so page.request mutations carry CSRF too
}

/** Sign out via the header user menu, returning to the login screen. */
export async function logout(page) {
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: /log out/i }).click();
  await page.waitForURL(/#\/login/, { timeout: 15_000 });
}
