import { describe, it, expect } from "vitest";
import {
  isWeekend,
  getMonthMatrix,
  getMonthTitle,
  shiftMonth,
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

describe("shiftMonth", () => {
  it("rolls forward across the year boundary", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });

  it("rolls backward across the year boundary", () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});
