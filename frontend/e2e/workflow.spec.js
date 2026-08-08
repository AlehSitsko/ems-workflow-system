import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers.js";

// A patient unique to this run (the E2E DB is fresh each run).
const PT = { first: "Zephyr", last: `Quicktest`, dob: "1980-01-01" };

async function fillPatient(page, p) {
  await page.locator('input[name="first_name"]').fill(p.first);
  await page.locator('input[name="last_name"]').fill(p.last);
  await page.locator('input[name="dob"]').fill(p.dob);
}

async function patientsByLast(page, last) {
  const res = await page.request.get(`/api/patients?name=${encodeURIComponent(last)}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.items || body;
}

test.describe("patient intake workflow (real browser)", () => {
  test("create → duplicate prevention → data persists across relogin", async ({ page }) => {
    await login(page, "dispatcher");

    // 1) Create a patient through the real form.
    await page.goto("#/patients/new");
    await fillPatient(page, PT);
    await page.getByRole("button", { name: "Add patient" }).click();
    // Lands on the patient's workspace, showing the name.
    await expect(page).toHaveURL(/#\/patients\/\d+/);
    await expect(page.getByText(`${PT.first} ${PT.last}`).first()).toBeVisible();

    // 2) Duplicate prevention: the same name + DOB is refused, not silently doubled.
    await page.goto("#/patients/new");
    await fillPatient(page, PT);
    await page.getByRole("button", { name: "Add patient" }).click();
    await expect(page.getByText(/possible duplicate patient/i)).toBeVisible();
    await expect(page).toHaveURL(/#\/patients\/new/);

    // 3) Exactly one such patient exists (verified via the authenticated API,
    //    which shares the browser session cookie).
    const afterCreate = await patientsByLast(page, PT.last);
    const matches = afterCreate.filter((p) => p.first_name === PT.first && p.last_name === PT.last);
    expect(matches).toHaveLength(1);
    const patientId = matches[0].id;

    // 4) Persists across a real logout + login.
    await logout(page);
    await login(page, "dispatcher");
    const afterRelogin = await patientsByLast(page, PT.last);
    expect(afterRelogin.some((p) => p.id === patientId)).toBeTruthy();

    // 5) The patient's workspace still loads by URL after re-login.
    await page.goto(`#/patients/${patientId}`);
    await expect(page.getByText(`${PT.first} ${PT.last}`).first()).toBeVisible();
  });

  test("the new-patient form requires first and last name", async ({ page }) => {
    await login(page, "dispatcher");
    await page.goto("#/patients/new");
    // Submitting empty stays on the form (client-side required guard).
    await page.getByRole("button", { name: "Add patient" }).click();
    await expect(page).toHaveURL(/#\/patients\/new/);
  });
});
