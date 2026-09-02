import { test, expect } from "@playwright/test";
import { login } from "./helpers.js";

// Regression for the v1.1.16 silent non-persistence: the call drawer sent
// `patient_id` and `date_of_call` on update, but the API dropped both — it
// answered 200 while nothing changed. This drives the full stack through a real
// browser session (cookie + CSRF), applies the *exact* payload the drawer sends,
// then reloads and re-reads to prove the change actually persisted.
//
// The mutation goes through page.request, which shares the logged-in browser's
// session and CSRF header — the same path CallDrawer.handleSave takes. The drawer
// ↔ payload mapping itself is covered by the CallDrawer unit tests; here we prove
// the round-trip and that the reloaded UI reflects the persisted patient.

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function createPatient(request, first, last) {
  const res = await request.post("/api/patients", { data: { first_name: first, last_name: last } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).id;
}

test.describe("call edit contract persists (real browser + full stack)", () => {
  test("date_of_call and patient_id survive save + reload", async ({ page }) => {
    await login(page, "dispatcher");
    const api = page.request;

    const stamp = Date.now();
    const patA = await createPatient(api, "Ada", `Alpha${stamp}`);
    const patB = await createPatient(api, "Bea", `Bravo${stamp}`);

    // A call on today's board, linked to patient A, dated a week ago.
    const created = await api.post("/api/calls", {
      data: {
        trip_date: today(), service_level: "BLS", call_type: "scheduled",
        pickup_address: "100 E2E St", dropoff_address: "200 Hospital Dr",
        pickup_time: "10:00", patient_id: patA, date_of_call: "2026-07-01",
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const callId = (await created.json()).id;

    // The board (keyed by trip_date) shows patient A after a real render.
    await page.goto(`#/dispatch?date=${today()}`);
    await expect(page.getByText(`Ada Alpha${stamp}`).first()).toBeVisible({ timeout: 15_000 });

    // Apply the drawer's exact update payload: relink to B, move the Date of Call.
    const upd = await api.put(`/api/calls/${callId}`, {
      data: {
        patient_id: patB, dispatcher_name: "Dispatcher User",
        date_of_call: "2026-09-15", trip_date: today(),
        pickup_time: "10:00", appointment_time: null,
        pickup_address: "100 E2E St", dropoff_address: "200 Hospital Dr",
        call_type: "scheduled", service_level: "BLS",
        caller_phone: null, caller_note: null, caller_type: null, notes: null,
      },
    });
    expect(upd.status(), await upd.text()).toBe(200);

    // Full document reload (hash routing means goto to the same hash won't
    // refetch) — the persisted patient B must now show.
    await page.reload();
    await expect(page.getByText(`Bea Bravo${stamp}`).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`Ada Alpha${stamp}`)).toHaveCount(0);

    // And the API confirms both fields persisted (not just echoed).
    const fetched = await (await api.get(`/api/calls/${callId}`)).json();
    expect(fetched.patient_id).toBe(patB);
    expect(fetched.date_of_call).toBe("2026-09-15");

    // Isolation feasible in the single-org E2E harness: an unknown patient is
    // refused and the existing link is left intact (true cross-org linking is
    // covered by backend test_call_update_contract.py + test_tenant_isolation.py).
    const bad = await api.put(`/api/calls/${callId}`, { data: { patient_id: 99999999 } });
    expect(bad.status()).toBe(400);
    const still = await (await api.get(`/api/calls/${callId}`)).json();
    expect(still.patient_id).toBe(patB);

    // An invalid Date of Call is rejected on update too.
    const badDate = await api.put(`/api/calls/${callId}`, { data: { date_of_call: "2026-02-30" } });
    expect(badDate.status()).toBe(400);
  });
});
