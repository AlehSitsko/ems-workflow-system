import { test, expect } from "@playwright/test";
import { login } from "./helpers.js";

// Regression for the v1.1.16 silent non-persistence: the call drawer sent
// `patient_id` and `date_of_call` on update, but the API dropped both — it
// answered 200 while nothing changed.
//
// The happy path below performs the edit the way a real dispatcher does — it
// opens the call from the Dispatch Board, opens the CallDrawer, changes the Date
// of Call and swaps the patient *through the UI*, saves, then reloads the page and
// reopens the call to prove the values persisted. The API is used only to seed
// deterministic test data and for one final independent confirmation; the action
// under test (open drawer → change fields → save) is entirely UI-driven.

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function createPatient(request, first, last) {
  const res = await request.post("/api/patients", { data: { first_name: first, last_name: last } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).id;
}

async function createCall(request, patientId) {
  const res = await request.post("/api/calls", {
    data: {
      trip_date: today(), service_level: "BLS", call_type: "scheduled",
      pickup_address: "100 E2E St", dropoff_address: "200 Hospital Dr",
      pickup_time: "10:00", patient_id: patientId, date_of_call: "2026-07-01",
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).id;
}

// Open the call whose card shows `label`, via card → detail modal → Edit Call,
// and return the drawer dialog locator. `label` is the patient name on the card.
async function openEditDrawer(page, label, callId) {
  await expect(page.getByText(label).first()).toBeVisible({ timeout: 15_000 });
  await page.getByText(label).first().click();                 // → CallDetailModal
  await page.getByRole("button", { name: /Edit Call/ }).click(); // → CallDrawer
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText(`Edit Call #${callId}`)).toBeVisible({ timeout: 15_000 });
  return drawer;
}

test.describe("call edit persists through the real CallDrawer UI", () => {
  test("change Date of Call and swap patient via the drawer, then reload", async ({ page }) => {
    await login(page, "dispatcher");
    const api = page.request;
    const stamp = Date.now();

    // ── deterministic setup (API = test data only) ──
    const patA = await createPatient(api, "Ada", `Alpha${stamp}`);
    const patB = await createPatient(api, "Bea", `Bravo${stamp}`);
    const callId = await createCall(api, patA);

    // ── everything below is the real UI ──
    await page.goto(`#/dispatch?date=${today()}`);

    const drawer = await openEditDrawer(page, `Ada Alpha${stamp}`, callId);
    // The drawer loaded the call's current values. `exact` targets the linked-
    // patient box <span> only, not the "Patient: …" drawer subtitle.
    await expect(drawer.getByLabel("Date of Call")).toHaveValue("2026-07-01");
    await expect(drawer.getByText(`Ada Alpha${stamp}`, { exact: true })).toBeVisible();

    // Change the Date of Call in the UI.
    await drawer.getByLabel("Date of Call").fill("2026-09-15");

    // Swap the patient in the UI: Change → search by last name → pick patient B.
    await drawer.getByRole("button", { name: /Change/ }).click();
    await drawer.getByLabel("Last Name").fill(`Bravo${stamp}`);
    await drawer.getByRole("button", { name: /Search/ }).click();
    await drawer.getByRole("button", { name: new RegExp(`Bea Bravo${stamp}`) }).click();
    await expect(drawer.getByText(`Bea Bravo${stamp}`, { exact: true })).toBeVisible();

    // Save through the footer button; the drawer closes only after the API resolves.
    await page.getByRole("button", { name: "Update Call" }).click();
    await expect(page.getByText(`Edit Call #${callId}`)).toBeHidden({ timeout: 15_000 });

    // ── full document reload, reopen through the UI, verify persistence ──
    await page.reload();
    const reopened = await openEditDrawer(page, `Bea Bravo${stamp}`, callId);
    await expect(reopened.getByLabel("Date of Call")).toHaveValue("2026-09-15");
    await expect(reopened.getByText(`Bea Bravo${stamp}`, { exact: true })).toBeVisible();
    await expect(reopened.getByText(`Ada Alpha${stamp}`, { exact: true })).toHaveCount(0);

    // Independent confirmation via the API (assertion only — not the tested action).
    const fetched = await (await api.get(`/api/calls/${callId}`)).json();
    expect(fetched.patient_id).toBe(patB);
    expect(fetched.date_of_call).toBe("2026-09-15");
  });
});

test.describe("call update API contract (integration — not the browser UI path)", () => {
  // These exercise the API guardrails directly, through page.request. They are
  // NOT a browser E2E of the drawer — cross-organisation isolation is proven at
  // the backend layer (test_call_update_contract.py / test_tenant_isolation.py),
  // which the single-org E2E harness cannot reach.
  test("invalid patient_id and date_of_call are rejected and leave state intact", async ({ page }) => {
    await login(page, "dispatcher");
    const api = page.request;
    const stamp = Date.now();
    const patA = await createPatient(api, "Cy", `Carol${stamp}`);
    const callId = await createCall(api, patA);

    // A non-existent patient must not link, and must not 200.
    const badPatient = await api.put(`/api/calls/${callId}`, { data: { patient_id: 99999999 } });
    expect(badPatient.status()).toBe(400);

    // An impossible Date of Call must be rejected on update too.
    const badDate = await api.put(`/api/calls/${callId}`, { data: { date_of_call: "2026-02-30" } });
    expect(badDate.status()).toBe(400);

    // Neither rejected write may have mutated the stored row.
    const after = await (await api.get(`/api/calls/${callId}`)).json();
    expect(after.patient_id).toBe(patA);
    expect(after.date_of_call).toBe("2026-07-01");
  });
});
