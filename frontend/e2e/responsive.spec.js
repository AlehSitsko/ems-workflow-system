import { test, expect } from "@playwright/test";
import { login } from "./helpers.js";

// The AppShell switches behaviour (not just styling) at MOBILE_NAV_BREAKPOINT
// (max-width: 991.98px): below it the permanent sidebar becomes an off-canvas
// dialog behind a header hamburger. These check the real behaviour at both widths
// and that neither layout scrolls the page horizontally.

const MOBILE = { width: 390, height: 844 };   // a phone, below the breakpoint
const DESKTOP = { width: 1280, height: 800 };  // above the breakpoint

/** True when the document is wider than its viewport (a horizontal scrollbar). */
async function hasHorizontalOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test("desktop shows a permanent sidebar and no hamburger", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await login(page, "dispatcher");

  // The sidebar is a permanent landmark; the header carries no hamburger.
  await expect(page.locator(".sidebar-nav")).toBeVisible();
  await expect(page.locator(".app-header-menu-button")).toHaveCount(0);
  expect(await hasHorizontalOverflow(page)).toBeFalsy();
});

test("mobile hides the sidebar behind a hamburger that opens an off-canvas dialog", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await login(page, "dispatcher");

  const hamburger = page.locator(".app-header-menu-button");
  await expect(hamburger).toBeVisible();
  await expect(hamburger).toHaveAttribute("aria-expanded", "false");
  // The dashboard itself must not force sideways scrolling on a phone.
  expect(await hasHorizontalOverflow(page)).toBeFalsy();

  // Opening reveals a modal off-canvas dialog.
  await hamburger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(hamburger).toHaveAttribute("aria-expanded", "true");

  // Escape closes it and returns focus to the hamburger (its label flips back).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(hamburger).toHaveAttribute("aria-expanded", "false");
});

test("mobile: choosing a destination navigates and closes the overlay", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await login(page, "dispatcher");

  await page.locator(".app-header-menu-button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Follow a navigation link that leads away from the current route (the first
  // link is Home, where we already are); choosing it must close the overlay.
  const currentHash = new URL(page.url()).hash; // e.g. #/home
  const links = dialog.getByRole("link");
  const count = await links.count();
  let target = null;
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute("href");
    if (href && !href.endsWith(currentHash)) { target = links.nth(i); break; }
  }
  expect(target, "expected a nav link to a different route").not.toBeNull();
  await target.click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".app-header-menu-button")).toHaveAttribute("aria-expanded", "false");
  expect(new URL(page.url()).hash).not.toBe(currentHash);
  expect(await hasHorizontalOverflow(page)).toBeFalsy();
});

test("the login screen fits a mobile viewport", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto("#/login");
  await expect(page.locator("#username")).toBeVisible();
  await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBeFalsy();
});
