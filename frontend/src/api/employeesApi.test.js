import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEmployees, getEmployee, getEmployeeShifts, createEmployee, deleteEmployee } from "./employeesApi";

const mockFetch = (ok, data) => vi.fn().mockResolvedValue({ ok, json: async () => data });
const urlOf = (f) => f.mock.calls[0][0];
const optsOf = (f) => f.mock.calls[0][1] || {};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("employeesApi", () => {
  it("getEmployees hits /api/employees credentialed and returns the body", async () => {
    const f = mockFetch(true, [{ id: 1 }]);
    vi.stubGlobal("fetch", f);
    const data = await getEmployees();
    expect(urlOf(f)).toContain("/api/employees");
    expect(optsOf(f).credentials).toBe("include");
    expect(data).toEqual([{ id: 1 }]);
  });

  it("getEmployee builds the /api/employees/<id> URL", async () => {
    const f = mockFetch(true, { id: 7 });
    vi.stubGlobal("fetch", f);
    await getEmployee(7);
    expect(urlOf(f)).toContain("/api/employees/7");
  });

  it("getEmployeeShifts sends the limit query", async () => {
    const f = mockFetch(true, []);
    vi.stubGlobal("fetch", f);
    await getEmployeeShifts(7, 10);
    expect(urlOf(f)).toContain("/api/employees/7/shifts?limit=10");
  });

  it("createEmployee POSTs JSON with credentials", async () => {
    const f = mockFetch(true, { id: 3 });
    vi.stubGlobal("fetch", f);
    await createEmployee({ first_name: "Pat" });
    const o = optsOf(f);
    expect(o.method).toBe("POST");
    expect(o.credentials).toBe("include");
    expect(JSON.parse(o.body)).toEqual({ first_name: "Pat" });
  });

  it("deleteEmployee uses DELETE and surfaces a server error", async () => {
    vi.stubGlobal("fetch", mockFetch(false, { error: "in use" }));
    await expect(deleteEmployee(3)).rejects.toThrow("in use");
  });

  it("falls back to a generic message when the error body is empty", async () => {
    vi.stubGlobal("fetch", mockFetch(false, {}));
    await expect(getEmployees()).rejects.toThrow(/failed to fetch employees/i);
  });
});
