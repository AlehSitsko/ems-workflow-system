import { describe, it, expect, vi, afterEach } from "vitest";

import { kioskEmployees } from "./timeApi";

function mockFetch(ok, body) {
  vi.stubGlobal("fetch", vi.fn(() =>
    Promise.resolve({ ok, json: () => Promise.resolve(body) }),
  ));
}

describe("kioskEmployees", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the array on success", async () => {
    mockFetch(true, [{ id: 1, name: "A", has_pin: false }]);
    const list = await kioskEmployees();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(1);
  });

  it("returns [] on a 500 that resolves with an error object (never a non-array)", async () => {
    // The exact bug: a 500 resolves with {error} JSON; callers .map/.find it.
    mockFetch(false, { error: "Internal server error" });
    const list = await kioskEmployees();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(0);
  });

  it("returns [] when the body is not an array", async () => {
    mockFetch(true, { unexpected: "shape" });
    expect(await kioskEmployees()).toEqual([]);
  });
});
