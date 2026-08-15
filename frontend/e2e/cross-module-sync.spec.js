import { test, expect } from "@playwright/test";
import { login, armCsrf, ACCOUNTS } from "./helpers.js";

// Realtime that crosses module boundaries: an action taken through one module's
// API (calls, dispatch operations) reflects live in another client's dispatch
// board and in the app-wide notification layer, over SSE, with no manual refresh.
// (call.created -> board is covered in realtime.spec.js; here: the other two
// dispatch event types drive a live board refresh and the notification engine.)

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function apiLogin(browser, role) {
  const ctx = await browser.newContext();
  await ctx.request.post("/api/auth/login", { data: ACCOUNTS[role] });
  await armCsrf(ctx);
  return ctx;
}

test.describe("cross-module realtime sync (SSE)", () => {
  test("a unit status change by one dispatcher updates another's board live", async ({ browser }) => {
    // B watches today's board; its SSE stream connects on mount.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await login(pageB, "supervisor");
    await pageB.goto("#/dispatch");
    await expect(pageB.getByText(/dispatch board/i).first()).toBeVisible({ timeout: 15_000 });
    await pageB.waitForTimeout(1500); // let the stream establish before A acts

    // A picks a unit that is currently Available and drives it En Route via the
    // dispatch API — a different module surface than the board B is viewing.
    const ctxA = await apiLogin(browser, "dispatcher");
    const board = await ctxA.request.get(`/api/dispatch/board?date=${today()}`);
    const units = (await board.json()).units;
    const unit = units.find((u) => u.dispatchStatus === "available") || units[0];

    // That unit's row starts on "Available" for B (proving the later flip is live).
    const row = pageB.locator("tr", { hasText: unit.truckNumber }).first();
    await expect(row).toContainText("Available");

    const r = await ctxA.request.patch(`/api/dispatch/units/${unit.id}/status`, {
      data: { status: "en_route" },
    });
    expect(r.status(), await r.text()).toBe(200);

    // B's board flips that unit to En Route via realtime — ahead of the 30 s poll,
    // no manual refresh.
    await expect(row).toContainText("En Route", { timeout: 12_000 });

    await ctxA.close();
    await ctxB.close();
  });

  test("an assignment by one dispatcher raises the assignment toast app-wide", async ({ browser }) => {
    // B stays on the home page — the notification engine is app-wide, not tied to
    // the board — and its default prefs surface assignment changes visually.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await login(pageB, "supervisor");
    await pageB.waitForTimeout(1500);

    // A creates a fresh (guaranteed unassigned) call, then assigns it to a unit
    // working today — an action spanning the calls and dispatch modules.
    const ctxA = await apiLogin(browser, "dispatcher");
    const create = await ctxA.request.post("/api/calls", {
      data: {
        trip_date: today(), service_level: "ALS", call_type: "scheduled",
        pickup_address: `XM-${Date.now()} Sync St`, dropoff_address: "200 Hospital Dr",
        pickup_time: "11:00",
      },
    });
    expect(create.status(), await create.text()).toBe(201);
    const callId = (await create.json()).id;

    const board = await ctxA.request.get(`/api/dispatch/board?date=${today()}`);
    const unitId = (await board.json()).units[0].id;

    const assign = await ctxA.request.post("/api/dispatch/assign", {
      data: { call_id: callId, unit_id: unitId },
    });
    expect(assign.status(), await assign.text()).toBe(201);

    // The app-wide toast fires for B (a different user), no matter what page B is on.
    await expect(pageB.getByText(/call assignment changed/i)).toBeVisible({ timeout: 12_000 });

    await ctxA.close();
    await ctxB.close();
  });
});
