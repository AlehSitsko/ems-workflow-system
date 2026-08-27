import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCalls, createCall, updateCall } from "./callsApi";

// We test THIS module's own logic — URL/query construction, request options, and
// error normalization — not the fetch library. So `fetch` is stubbed.

function mockFetch(ok, data) {
  return vi.fn().mockResolvedValue({ ok, json: async () => data });
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

const urlOf = (f) => f.mock.calls[0][0];
const optsOf = (f) => f.mock.calls[0][1] || {};

describe("callsApi.getCalls", () => {
  it("builds the query from only the provided filters, plus page/per_page", async () => {
    const f = mockFetch(true, { items: [] });
    vi.stubGlobal("fetch", f);

    await getCalls({ trip_date: "2026-08-25", status: "new" }, 2, 50);

    const url = urlOf(f);
    expect(url).toContain("/api/calls?");
    expect(url).toContain("trip_date=2026-08-25");
    expect(url).toContain("status=new");
    expect(url).toContain("page=2");
    expect(url).toContain("per_page=50");
    // an unset filter must not appear
    expect(url).not.toContain("dispatcher_name");
    // reads are credentialed so the session cookie is sent
    expect(optsOf(f).credentials).toBe("include");
  });

  it("returns the parsed body on success", async () => {
    vi.stubGlobal("fetch", mockFetch(true, { items: [{ id: 1 }], total: 1 }));
    const data = await getCalls();
    expect(data).toEqual({ items: [{ id: 1 }], total: 1 });
  });

  it("normalizes a server error into a thrown Error with the server message", async () => {
    vi.stubGlobal("fetch", mockFetch(false, { error: "Bad filter" }));
    await expect(getCalls()).rejects.toThrow("Bad filter");
  });

  it("falls back to a generic message when the body has no error field", async () => {
    vi.stubGlobal("fetch", mockFetch(false, {}));
    await expect(getCalls()).rejects.toThrow(/failed to fetch calls/i);
  });
});

describe("callsApi.createCall", () => {
  it("POSTs JSON with credentials and returns the created record", async () => {
    const f = mockFetch(true, { id: 9 });
    vi.stubGlobal("fetch", f);

    const result = await createCall({ patient_name: "Ann" });

    const opts = optsOf(f);
    expect(urlOf(f)).toContain("/api/calls");
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("include");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual({ patient_name: "Ann" });
    expect(result).toEqual({ id: 9 });
  });

  it("throws the server error on a conflict/validation failure", async () => {
    vi.stubGlobal("fetch", mockFetch(false, { error: "Duplicate call" }));
    await expect(createCall({})).rejects.toThrow("Duplicate call");
  });
});

describe("callsApi.updateCall", () => {
  it("passes caller-supplied headers (e.g. the CSRF token) through", async () => {
    const f = mockFetch(true, { id: 1 });
    vi.stubGlobal("fetch", f);

    await updateCall(1, { status: "completed" }, { "X-CSRF-Token": "tok" });

    expect(optsOf(f).headers["X-CSRF-Token"]).toBe("tok");
  });
});
