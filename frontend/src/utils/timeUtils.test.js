import { describe, it, expect } from "vitest";
import {
  isValidTime,
  normalizeTimeValue,
  parseTimeToMinutes,
  convert12hTo24h,
  convert24hTo12h,
  formatTimeForDisplay,
} from "./timeUtils";

describe("isValidTime", () => {
  it("accepts strict 24h HH:MM", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("7:05")).toBe(true);
  });
  it("rejects out-of-range and non-time values", () => {
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("12:60")).toBe(false);
    expect(isValidTime("2:30 PM")).toBe(false);
    expect(isValidTime("")).toBe(false);
    expect(isValidTime(null)).toBe(false);
  });
});

describe("normalizeTimeValue", () => {
  it("normalizes plain and 12h formats to 24h HH:MM", () => {
    expect(normalizeTimeValue("7:00")).toBe("07:00");
    expect(normalizeTimeValue("2:30 PM")).toBe("14:30");
    expect(normalizeTimeValue("12:00 AM")).toBe("00:00");
    expect(normalizeTimeValue("12:00 PM")).toBe("12:00");
    expect(normalizeTimeValue("14:30")).toBe("14:30");
  });
  it("returns null for unparseable input", () => {
    expect(normalizeTimeValue("banana")).toBeNull();
    expect(normalizeTimeValue("25:00")).toBeNull();
    expect(normalizeTimeValue("")).toBeNull();
    expect(normalizeTimeValue(null)).toBeNull();
  });
});

describe("parseTimeToMinutes", () => {
  it("returns minutes since midnight", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("01:30")).toBe(90);
    expect(parseTimeToMinutes("2:30 PM")).toBe(14 * 60 + 30);
  });
  it("returns null when unparseable", () => {
    expect(parseTimeToMinutes("nope")).toBeNull();
  });
});

describe("convert12hTo24h", () => {
  it("converts AM/PM correctly incl. 12 edge cases", () => {
    expect(convert12hTo24h(12, 0, "AM")).toBe("00:00");
    expect(convert12hTo24h(12, 0, "PM")).toBe("12:00");
    expect(convert12hTo24h(1, 5, "PM")).toBe("13:05");
    expect(convert12hTo24h(9, 15, "AM")).toBe("09:15");
  });
  it("returns null for invalid inputs", () => {
    expect(convert12hTo24h(0, 0, "AM")).toBeNull();
    expect(convert12hTo24h(13, 0, "PM")).toBeNull();
    expect(convert12hTo24h(5, 0, "XM")).toBeNull();
  });
});

describe("convert24hTo12h", () => {
  it("splits into hour/minute/period", () => {
    expect(convert24hTo12h("00:00")).toEqual({ hour: "12", minute: "00", period: "AM" });
    expect(convert24hTo12h("13:05")).toEqual({ hour: "1", minute: "05", period: "PM" });
    expect(convert24hTo12h("12:30")).toEqual({ hour: "12", minute: "30", period: "PM" });
  });
  it("returns null when unparseable", () => {
    expect(convert24hTo12h("bad")).toBeNull();
  });
});

describe("formatTimeForDisplay", () => {
  it("formats per preference", () => {
    expect(formatTimeForDisplay("14:30", "24h")).toBe("14:30");
    expect(formatTimeForDisplay("14:30", "12h")).toBe("2:30 PM");
    expect(formatTimeForDisplay("07:00", "12h")).toBe("7:00 AM");
  });
  it("handles special and malformed values gracefully", () => {
    expect(formatTimeForDisplay("will_call")).toBe("Will Call");
    expect(formatTimeForDisplay("")).toBe("");
    expect(formatTimeForDisplay("garbage")).toBe("garbage");
  });
});
