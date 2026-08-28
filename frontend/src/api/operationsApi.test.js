import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDayTimeline, getClosedDays, closeOperationalDay } from "./operationsApi";

const mockFetch = (ok, data) => vi.fn().mockResolvedValue({ ok, json: async () => data });
const urlOf = (f) => f.mock.calls[0][0];
const optsOf = (f) => f.mock.calls[0][1] || {};
beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("operationsApi", () => {
  it("getDayTimeline builds the day-scoped URL, credentialed", async () => {
    const f = mockFetch(true, {});
    vi.stubGlobal("fetch", f);
    await getDayTimeline("2026-08-25");
    expect(urlOf(f)).toContain("/api/operations/days/2026-08-25/timeline");
    expect(optsOf(f).credentials).toBe("include");
  });

  it("getClosedDays adds start/end query only when provided", async () => {
    const f = mockFetch(true, []);
    vi.stubGlobal("fetch", f);
    await getClosedDays({ start: "2026-08-01", end: "2026-08-31" });
    const url = urlOf(f);
    expect(url).toContain("start=2026-08-01");
    expect(url).toContain("end=2026-08-31");
  });

  it("getClosedDays with no range hits the bare endpoint", async () => {
    const f = mockFetch(true, []);
    vi.stubGlobal("fetch", f);
    await getClosedDays();
    expect(urlOf(f)).toMatch(/\/api\/operations\/days$/);
  });

  it("closeOperationalDay POSTs the body with credentials", async () => {
    const f = mockFetch(true, { ok: true });
    vi.stubGlobal("fetch", f);
    await closeOperationalDay("2026-08-25", { note: "done" });
    const o = optsOf(f);
    expect(o.method).toBe("POST");
    expect(o.credentials).toBe("include");
    expect(JSON.parse(o.body)).toEqual({ note: "done" });
  });

  it("surfaces a server error", async () => {
    vi.stubGlobal("fetch", mockFetch(false, { error: "cannot close" }));
    await expect(closeOperationalDay("2026-08-25", {})).rejects.toThrow();
  });
});
