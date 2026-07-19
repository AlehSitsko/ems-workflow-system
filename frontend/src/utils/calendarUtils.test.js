import { describe, it, expect } from "vitest";
import {
  isWeekend,
  getMonthMatrix,
  getMonthTitle,
  shiftMonth,
  getWeekdayLabels,
  addDays,
  startOfWeek,
  getWeekDays,
  getRangeTitle,
} from "./calendarUtils";

describe("isWeekend", () => {
  it("is true for Saturday and Sunday", () => {
    expect(isWeekend(new Date(2026, 6, 4))).toBe(true); // Sat
    expect(isWeekend(new Date(2026, 6, 5))).toBe(true); // Sun
  });

  it("is false for weekdays", () => {
    expect(isWeekend(new Date(2026, 6, 6))).toBe(false); // Mon
  });
});

describe("getMonthMatrix", () => {
  const matrix = getMonthMatrix(2026, 6, new Date(2026, 6, 15)); // July 2026

  it("always returns a fixed 6×7 grid", () => {
    expect(matrix).toHaveLength(6);
    matrix.forEach((week) => expect(week).toHaveLength(7));
  });

  it("starts on the Sunday leading into the month", () => {
    // July 1 2026 is a Wednesday → grid starts Sunday June 28.
    expect(matrix[0][0].iso).toBe("2026-06-28");
    expect(matrix[0][0].inCurrentMonth).toBe(false);
  });

  it("flags days inside the current month", () => {
    const july1 = matrix[0].find((c) => c.iso === "2026-07-01");
    expect(july1.inCurrentMonth).toBe(true);
    expect(july1.day).toBe(1);
  });

  it("marks today and holidays", () => {
    const today = matrix.flat().find((c) => c.iso === "2026-07-15");
    expect(today.isToday).toBe(true);
    const july4 = matrix.flat().find((c) => c.iso === "2026-07-04");
    expect(july4.holiday?.shortName).toBe("Independence Day");
    expect(july4.isWeekend).toBe(true);
  });
});

describe("getMonthTitle", () => {
  it("formats the month and year", () => {
    expect(getMonthTitle(2026, 6)).toBe("July 2026");
  });
});

describe("week start", () => {
  it("rotates weekday labels for a Monday start", () => {
    expect(getWeekdayLabels(0)[0]).toBe("Sun");
    expect(getWeekdayLabels(1)[0]).toBe("Mon");
    expect(getWeekdayLabels(1)[6]).toBe("Sun");
  });

  it("starts the grid on the configured weekday", () => {
    // July 1 2026 is Wednesday; Monday-start grid begins Mon June 29.
    const matrix = getMonthMatrix(2026, 6, new Date(2026, 6, 15), 1);
    expect(matrix[0][0].iso).toBe("2026-06-29");
  });
});

describe("shiftMonth", () => {
  it("rolls forward across the year boundary", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });

  it("rolls backward across the year boundary", () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe("addDays / startOfWeek", () => {
  it("adds days without timezone drift", () => {
    const d = addDays(new Date(2026, 6, 16), 5);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(21);
  });

  it("crosses month boundaries", () => {
    const d = addDays(new Date(2026, 6, 30), 3);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(2);
  });

  it("startOfWeek honours a Sunday start", () => {
    // Thu Jul 16 2026 → Sun Jul 12.
    const s = startOfWeek(new Date(2026, 6, 16), 0);
    expect([s.getMonth(), s.getDate()]).toEqual([6, 12]);
  });

  it("startOfWeek honours a Monday start", () => {
    const s = startOfWeek(new Date(2026, 6, 16), 1);
    expect([s.getMonth(), s.getDate()]).toEqual([6, 13]);
  });
});

describe("getWeekDays", () => {
  it("returns 7 consecutive days from the week start", () => {
    const days = getWeekDays(new Date(2026, 6, 16), new Date(2026, 6, 16), 0);
    expect(days).toHaveLength(7);
    expect(days[0].iso).toBe("2026-07-12");
    expect(days[6].iso).toBe("2026-07-18");
    expect(days[4].isToday).toBe(true); // Thu Jul 16
  });
});

describe("getRangeTitle", () => {
  it("collapses the month when the range stays within it", () => {
    expect(getRangeTitle(new Date(2026, 6, 13), new Date(2026, 6, 19))).toBe("Jul 13 – 19, 2026");
  });

  it("spells both months across a boundary", () => {
    expect(getRangeTitle(new Date(2026, 5, 29), new Date(2026, 6, 5))).toBe("Jun 29 – Jul 5, 2026");
  });
});
