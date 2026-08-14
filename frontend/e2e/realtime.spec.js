import { test, expect } from "@playwright/test";
import { login, armCsrf, ACCOUNTS } from "./helpers.js";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test.describe("realtime multi-client sync (SSE)", () => {
  test("a call one dispatcher creates appears on another's board with no refresh", async ({ browser }) => {
    // Dispatcher B watches the board in a real browser (its SSE stream connects).
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await login(pageB, "supervisor"); // supervisor has dispatch access
    await pageB.goto("#/dispatch");
    await expect(pageB.getByText(/dispatch board/i).first()).toBeVisible({ timeout: 15_000 });
    // Let B's SSE stream establish before A publishes (the connection opens on mount).
    await pageB.waitForTimeout(1500);

    // Dispatcher A creates a call via its own authenticated session.
    const ctxA = await browser.newContext();
    await ctxA.request.post("/api/auth/login", { data: ACCOUNTS.dispatcher });
    await armCsrf(ctxA);
    const marker = `RT-${Date.now()} Elm St`;
    const r = await ctxA.request.post("/api/calls", {
      data: {
        trip_date: today(), service_level: "BLS", call_type: "scheduled",
        pickup_address: marker, dropoff_address: "200 Hospital Dr", pickup_time: "10:00",
      },
    });
    expect(r.status(), await r.text()).toBe(201);

    // B's board updates via realtime — well before the 30 s poll would fire — so
    // the new call's pickup address shows up without any manual refresh.
    await expect(pageB.getByText(marker)).toBeVisible({ timeout: 12_000 });

    await ctxA.close();
    await ctxB.close();
    // (Cross-org isolation of the stream is proven in backend test_events.py.)
  });
});
