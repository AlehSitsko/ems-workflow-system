import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCrewUnits, createCrewUnit, updateCrewUnit, deleteCrewUnit } from "./crewApi";

const mockFetch = (ok, data) => vi.fn().mockResolvedValue({ ok, json: async () => data });
const urlOf = (f) => f.mock.calls[0][0];
const optsOf = (f) => f.mock.calls[0][1] || {};
beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("crewApi", () => {
  it("getCrewUnits adds shift_date only when provided", async () => {
    const f = mockFetch(true, []);
    vi.stubGlobal("fetch", f);
    await getCrewUnits("2026-08-25");
    expect(urlOf(f)).toContain("shift_date=2026-08-25");
    expect(optsOf(f).credentials).toBe("include");
  });

  it("getCrewUnits with no date hits the bare endpoint", async () => {
    const f = mockFetch(true, []);
    vi.stubGlobal("fetch", f);
    await getCrewUnits();
    expect(urlOf(f)).not.toContain("shift_date=");
  });

  it("createCrewUnit POSTs JSON with credentials", async () => {
    const f = mockFetch(true, { id: 1 });
    vi.stubGlobal("fetch", f);
    await createCrewUnit({ truckNumber: "1" });
    const o = optsOf(f);
    expect(o.method).toBe("POST");
    expect(o.credentials).toBe("include");
    expect(JSON.parse(o.body)).toEqual({ truckNumber: "1" });
  });

  it("updateCrewUnit uses PUT on the id URL", async () => {
    const f = mockFetch(true, { id: 5 });
    vi.stubGlobal("fetch", f);
    await updateCrewUnit(5, { startTime: "08:00" });
    expect(urlOf(f)).toContain("/api/crew-units/5");
    expect(optsOf(f).method).toBe("PUT");
  });

  it("deleteCrewUnit uses DELETE and surfaces a server error", async () => {
    vi.stubGlobal("fetch", mockFetch(false, { error: "in use" }));
    await expect(deleteCrewUnit(5)).rejects.toThrow();
  });
});
