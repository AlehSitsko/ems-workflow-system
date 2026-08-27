import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getVehicles, getVehicle, createVehicle, toggleVehicleActive } from "./vehiclesApi";

const mockFetch = (ok, data) => vi.fn().mockResolvedValue({ ok, json: async () => data });
const urlOf = (f) => f.mock.calls[0][0];
const optsOf = (f) => f.mock.calls[0][1] || {};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("vehiclesApi", () => {
  it("getVehicles(false) requests the plain list, credentialed", async () => {
    const f = mockFetch(true, []);
    vi.stubGlobal("fetch", f);
    await getVehicles(false);
    expect(urlOf(f)).toContain("/api/vehicles");
    expect(optsOf(f).credentials).toBe("include");
  });

  it("getVehicles(true) adds the active-only filter", async () => {
    const f = mockFetch(true, []);
    vi.stubGlobal("fetch", f);
    await getVehicles(true);
    // the wrapper adds a query flag for active-only
    expect(urlOf(f)).toMatch(/active/);
  });

  it("getVehicle builds the /api/vehicles/<id> URL", async () => {
    const f = mockFetch(true, { id: 2 });
    vi.stubGlobal("fetch", f);
    await getVehicle(2);
    expect(urlOf(f)).toContain("/api/vehicles/2");
  });

  it("createVehicle POSTs JSON with credentials", async () => {
    const f = mockFetch(true, { id: 5 });
    vi.stubGlobal("fetch", f);
    await createVehicle({ name: "Medic-1" });
    const o = optsOf(f);
    expect(o.method).toBe("POST");
    expect(o.credentials).toBe("include");
    expect(JSON.parse(o.body)).toEqual({ name: "Medic-1" });
  });

  it("toggleVehicleActive uses PATCH", async () => {
    const f = mockFetch(true, { id: 2, is_active: false });
    vi.stubGlobal("fetch", f);
    await toggleVehicleActive(2);
    expect(urlOf(f)).toContain("/api/vehicles/2/toggle-active");
    expect(optsOf(f).method).toBe("PATCH");
  });

  it("normalizes a server error", async () => {
    vi.stubGlobal("fetch", mockFetch(false, { error: "nope" }));
    await expect(getVehicles()).rejects.toThrow("nope");
  });
});
