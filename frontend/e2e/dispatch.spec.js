import { test, expect } from "@playwright/test";
import { login, armCsrf, ACCOUNTS } from "./helpers.js";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function createCall(request, extra = {}) {
  const res = await request.post("/api/calls", {
    data: {
      trip_date: today(),
      service_level: "BLS",
      call_type: "scheduled",
      pickup_address: "100 E2E St",
      dropoff_address: "200 Hospital Dr",
      pickup_time: "10:00",
      ...extra,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).id;
}

async function boardUnits(request) {
  const res = await request.get(`/api/dispatch/board?date=${today()}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).units;
}

test.describe("dispatch lifecycle (real browser + API)", () => {
  test("assign → status chain stamps the call → complete, reflected in the UI", async ({ page }) => {
    await login(page, "dispatcher");
    const api = page.request;

    const callId = await createCall(api);
    const units = await boardUnits(api);
    expect(units.length).toBeGreaterThan(0);
    const unit = units[0];

    // Assign the new call to a today unit (expected: it was unassigned).
    const assignRes = await api.post("/api/dispatch/assign", {
      data: { call_id: callId, unit_id: unit.id, expected_assignment_id: null },
    });
    expect(assignRes.status(), await assignRes.text()).toBe(201);

    // Drive the live status chain; each step stamps the active call's lifecycle.
    for (const status of ["en_route", "on_scene", "transporting", "at_destination"]) {
      const r = await api.patch(`/api/dispatch/units/${unit.id}/status`, { data: { status } });
      expect(r.status(), `status ${status}: ${await r.text()}`).toBe(200);
    }

    // Invalid status is refused by the backend (not just hidden in the UI).
    const bad = await api.patch(`/api/dispatch/units/${unit.id}/status`, { data: { status: "not_a_status" } });
    expect(bad.status()).toBe(400);

    // The call now carries the lifecycle timestamps the chain stamped.
    const callRes = await api.get(`/api/calls/${callId}`);
    const call = await callRes.json();
    for (const f of ["dispatched_at", "arrived_pickup_at", "patient_loaded_at", "arrived_dest_at"]) {
      expect(call[f], `expected ${f} to be stamped`).toBeTruthy();
    }

    // Complete the assignment → the call is completed.
    const board = await boardUnits(api);
    const active = board.find((u) => u.id === unit.id)?.assignedCalls?.find((c) => c.id === callId);
    expect(active, "assigned call present on the unit").toBeTruthy();
    const done = await api.patch(`/api/dispatch/assign/${active.assignment_id}/complete`);
    expect(done.status()).toBe(200);
    const after = await api.get(`/api/calls/${callId}`);
    expect((await after.json()).status).toBe("completed");

    // The UI reflects the backend state: the board shows the advanced status.
    await page.goto("#/dispatch");
    await expect(page.getByText(/at destination|en route|transporting/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("two dispatchers cannot silently overwrite an assignment", async ({ browser }) => {
    // Two independent, logged-in sessions.
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = ctxA.request;
    const b = ctxB.request;
    await a.post("/api/auth/login", { data: ACCOUNTS.dispatcher });
    await b.post("/api/auth/login", { data: ACCOUNTS.supervisor });
    await armCsrf(ctxA);
    await armCsrf(ctxB);

    const callId = await createCall(a);
    const units = await boardUnits(a);
    const unitA = units[0].id;
    const unitB = units[1].id;

    // Dispatcher A assigns the call (it looked unassigned) → ok.
    const r1 = await a.post("/api/dispatch/assign", {
      data: { call_id: callId, unit_id: unitA, expected_assignment_id: null },
    });
    expect(r1.status()).toBe(201);

    // Dispatcher B, on a stale screen that still shows it unassigned, is refused.
    const r2 = await b.post("/api/dispatch/assign", {
      data: { call_id: callId, unit_id: unitB, expected_assignment_id: null },
    });
    expect(r2.status()).toBe(409);
    const body = await r2.json();
    expect(body.code).toBe("assignment_conflict");
    expect(body.error).toMatch(/someone else/i);

    // The first assignment stands (no silent overwrite).
    const board = await boardUnits(a);
    const onA = board.find((u) => u.id === unitA)?.assignedCalls?.some((c) => c.id === callId);
    expect(onA).toBeTruthy();

    await ctxA.close();
    await ctxB.close();
  });
});
