import { describe, it, expect, vi, afterEach } from "vitest";
import { formatDate, formatDateTime, daysUntil, describeDueDate, parseOperationalDate } from "./dateDisplay";

afterEach(() => vi.useRealTimers());

describe("parseOperationalDate", () => {
  it("parses a plain calendar day in local time, not UTC", () => {
    const d = parseOperationalDate("2026-07-15");
    // Parsed from parts: the local day must be exactly what was written, which
    // new Date("2026-07-15") cannot guarantee behind UTC.
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(15);
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    ["", "15/07/2026", "2026-7-5", null, undefined].forEach((v) => {
      expect(parseOperationalDate(v)).toBeNull();
    });
  });
});

describe("formatDate", () => {
  it("renders a human date, never a raw ISO string", () => {
    expect(formatDate("2026-07-15")).toBe("Jul 15, 2026");
    expect(formatDate("2026-01-02")).toBe("Jan 2, 2026");
  });

  it("falls back rather than printing junk", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("nonsense", { fallback: "Not set" })).toBe("Not set");
  });
});

describe("formatDateTime", () => {
  it("respects the 12h/24h user setting", () => {
    expect(formatDateTime("2026-06-28T08:15:03", "12h")).toBe("Jun 28, 2026, 8:15 AM");
    expect(formatDateTime("2026-06-28T08:15:03", "24h")).toBe("Jun 28, 2026, 08:15");
  });

  it("degrades to just the date when there is no time part", () => {
    expect(formatDateTime("2026-06-28", "12h")).toBe("Jun 28, 2026");
  });

  it("falls back for empty input", () => {
    expect(formatDateTime("", "12h")).toBe("—");
  });
});

describe("daysUntil", () => {
  it("ignores the time of day so tomorrow is never 0 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 23, 30));   // late evening
    expect(daysUntil("2026-07-16")).toBe(1);
    expect(daysUntil("2026-07-15")).toBe(0);
    expect(daysUntil("2026-07-14")).toBe(-1);
  });

  it("crosses month and year boundaries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 12, 0));
    expect(daysUntil("2027-01-01")).toBe(1);
  });
});

describe("describeDueDate", () => {
  it("phrases upcoming maintenance with a tone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    expect(describeDueDate("2026-08-02")).toMatchObject({ label: "Due in 18 days", tone: "success" });
  });

  it("warns as the date closes in", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    expect(describeDueDate("2026-07-17")).toMatchObject({ label: "Due in 2 days", tone: "warning" });
    expect(describeDueDate("2026-07-15")).toMatchObject({ label: "Due today", tone: "warning" });
  });

  it("flags an overdue date as danger", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    expect(describeDueDate("2026-06-25")).toMatchObject({ label: "Overdue by 20 days", tone: "danger" });
  });

  it("uses the singular for one day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    expect(describeDueDate("2026-07-16").label).toBe("Due in 1 day");
    expect(describeDueDate("2026-07-14").label).toBe("Overdue by 1 day");
  });

  it("says so when nothing is scheduled", () => {
    expect(describeDueDate(null)).toMatchObject({ label: "Not scheduled", tone: "neutral" });
  });
});
