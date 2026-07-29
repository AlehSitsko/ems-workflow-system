import { describe, it, expect } from "vitest";

import { calendarIcsExportUrl } from "./calendarEventsApi";
import API_BASE from "./config.js";

describe("calendarIcsExportUrl", () => {
  it("builds an export URL carrying the range", () => {
    expect(calendarIcsExportUrl("2026-08-01", "2026-08-31")).toBe(
      `${API_BASE}/api/calendar-events/export.ics?start=2026-08-01&end=2026-08-31`,
    );
  });
});
