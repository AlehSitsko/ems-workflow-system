import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAuditLog } from "./auditApi";

const mockFetch = (ok, data) => vi.fn().mockResolvedValue({ ok, json: async () => data });
const urlOf = (f) => f.mock.calls[0][0];
const optsOf = (f) => f.mock.calls[0][1] || {};
beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("auditApi.getAuditLog", () => {
  it("builds the query from only the provided filters + pagination", async () => {
    const f = mockFetch(true, { entries: [] });
    vi.stubGlobal("fetch", f);
    await getAuditLog({ entity_type: "call", entity_id: 7, action: "assigned", page: 2, per_page: 50 });
    const url = urlOf(f);
    expect(url).toContain("/api/audit?");
    expect(url).toContain("entity_type=call");
    expect(url).toContain("entity_id=7");
    expect(url).toContain("action=assigned");
    expect(url).toContain("page=2");
    expect(url).toContain("per_page=50");
    expect(url).not.toContain("date_from");
    expect(optsOf(f).credentials).toBe("include");
  });

  it("URL-encodes an action filter with special chars", async () => {
    const f = mockFetch(true, { entries: [] });
    vi.stubGlobal("fetch", f);
    await getAuditLog({ action: "a b&c" });
    expect(urlOf(f)).toMatch(/action=a\+b%26c/);
  });

  it("passes caller-supplied headers through", async () => {
    const f = mockFetch(true, { entries: [] });
    vi.stubGlobal("fetch", f);
    await getAuditLog({}, { "X-CSRF-Token": "tok" });
    expect(optsOf(f).headers["X-CSRF-Token"]).toBe("tok");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", mockFetch(false, { error: "nope" }));
    await expect(getAuditLog()).rejects.toThrow();
  });
});
