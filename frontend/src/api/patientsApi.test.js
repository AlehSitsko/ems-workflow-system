import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPatients, getPatient, createPatient, archivePatient } from "./patientsApi";

// Test this module's own logic — query construction, method/body, credentials,
// and error normalization — not the fetch library.
const mockFetch = (ok, data) => vi.fn().mockResolvedValue({ ok, json: async () => data });
const urlOf = (f) => f.mock.calls[0][0];
const optsOf = (f) => f.mock.calls[0][1] || {};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("patientsApi.getPatients", () => {
  it("appends only the provided filters plus page/per_page, credentialed", async () => {
    const f = mockFetch(true, { items: [] });
    vi.stubGlobal("fetch", f);
    await getPatients({ name: "smith", showArchived: true }, 3, 40);
    const url = urlOf(f);
    expect(url).toContain("/api/patients?");
    expect(url).toContain("name=smith");
    expect(url).toContain("show_archived=1");
    expect(url).toContain("page=3");
    expect(url).toContain("per_page=40");
    expect(url).not.toContain("dob=");           // unset filter absent
    expect(optsOf(f).credentials).toBe("include");
  });

  it("URL-encodes a filter value with spaces/specials", async () => {
    const f = mockFetch(true, { items: [] });
    vi.stubGlobal("fetch", f);
    await getPatients({ name: "de la cruz & co" });
    // URLSearchParams encodes space as + and & as %26
    expect(urlOf(f)).toMatch(/name=de\+la\+cruz\+%26\+co/);
  });

  it("throws on a non-ok response (this endpoint uses a fixed message)", async () => {
    vi.stubGlobal("fetch", mockFetch(false, { error: "bad search" }));
    await expect(getPatients()).rejects.toThrow(/failed to fetch patients/i);
  });
});

describe("patientsApi single-record ops", () => {
  it("getPatient builds the singular /api/patient/<id> URL", async () => {
    const f = mockFetch(true, { id: 5 });
    vi.stubGlobal("fetch", f);
    await getPatient(5);
    expect(urlOf(f)).toContain("/api/patient/5");
  });

  it("createPatient POSTs JSON with credentials", async () => {
    const f = mockFetch(true, { id: 9 });
    vi.stubGlobal("fetch", f);
    await createPatient({ first_name: "Ann" });
    const o = optsOf(f);
    expect(o.method).toBe("POST");
    expect(o.credentials).toBe("include");
    expect(JSON.parse(o.body)).toEqual({ first_name: "Ann" });
  });

  it("archivePatient uses DELETE and surfaces a server error", async () => {
    vi.stubGlobal("fetch", mockFetch(false, { error: "cannot archive" }));
    await expect(archivePatient(1, "reason")).rejects.toThrow("cannot archive");
  });
});
