import { describe, it, expect } from "vitest";
import {
  toISODate,
  nthWeekdayOfMonth,
  lastWeekdayOfMonth,
  getUsFederalHolidays,
  getHoliday,
} from "./holidayUtils";

describe("toISODate", () => {
  it("formats a local date as YYYY-MM-DD with zero padding", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toISODate(new Date(2026, 11, 25))).toBe("2026-12-25");
  });
});

describe("nthWeekdayOfMonth", () => {
  it("finds the 3rd Monday of January 2026 (MLK Day)", () => {
    expect(toISODate(nthWeekdayOfMonth(2026, 0, 1, 3))).toBe("2026-01-19");
  });

  it("finds the 4th Thursday of November 2026 (Thanksgiving)", () => {
    expect(toISODate(nthWeekdayOfMonth(2026, 10, 4, 4))).toBe("2026-11-26");
  });
});

describe("lastWeekdayOfMonth", () => {
  it("finds the last Monday of May 2026 (Memorial Day)", () => {
    expect(toISODate(lastWeekdayOfMonth(2026, 4, 1))).toBe("2026-05-25");
  });
});

describe("getUsFederalHolidays", () => {
  it("returns all 11 federal holidays sorted by date", () => {
    const holidays = getUsFederalHolidays(2026);
    expect(holidays).toHaveLength(11);
    const dates = holidays.map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("computes the fixed and floating holidays for 2026", () => {
    const byName = Object.fromEntries(getUsFederalHolidays(2026).map((h) => [h.shortName, h.date]));
    expect(byName["New Year's"]).toBe("2026-01-01");
    expect(byName["Memorial Day"]).toBe("2026-05-25");
    expect(byName["Juneteenth"]).toBe("2026-06-19");
    expect(byName["Independence Day"]).toBe("2026-07-04");
    expect(byName["Labor Day"]).toBe("2026-09-07");
    expect(byName["Thanksgiving"]).toBe("2026-11-26");
    expect(byName["Christmas"]).toBe("2026-12-25");
  });
});

describe("getHoliday", () => {
  it("resolves a holiday by ISO string", () => {
    expect(getHoliday("2026-12-25")?.name).toBe("Christmas Day");
  });

  it("resolves a holiday by Date", () => {
    expect(getHoliday(new Date(2026, 6, 4))?.shortName).toBe("Independence Day");
  });

  it("returns null for an ordinary day", () => {
    expect(getHoliday("2026-07-05")).toBeNull();
  });

  it("resolves holidays across year boundaries (grid spill)", () => {
    expect(getHoliday("2025-12-25")?.name).toBe("Christmas Day");
    expect(getHoliday("2027-01-01")?.name).toBe("New Year's Day");
  });
});
