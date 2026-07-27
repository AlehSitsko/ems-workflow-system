import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { getCallsReport, callsReportExportUrl } from "./reportsApi";
import API_BASE from "./config.js";

describe("reportsApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the calls report with the range as query params, credentialed", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ summary: { total_calls: 3 } }) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const data = await getCallsReport("2026-01-01", "2026-01-31");

    expect(data.summary.total_calls).toBe(3);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/api/reports/calls?start=2026-01-01&end=2026-01-31`);
    expect(opts.credentials).toBe("include");
  });

  it("throws the server's error message on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "range too wide" }) }),
    ));

    await expect(getCallsReport("2020-01-01", "2026-01-01")).rejects.toThrow("range too wide");
  });

  it("builds a same-origin export URL carrying the range", () => {
    const url = callsReportExportUrl("2026-01-01", "2026-01-31");
    expect(url).toBe(`${API_BASE}/api/reports/calls/export?start=2026-01-01&end=2026-01-31`);
  });
});
