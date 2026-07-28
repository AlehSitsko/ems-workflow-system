import { describe, it, expect } from "vitest";

import { computePlannedEnd } from "./tripTiming";

describe("computePlannedEnd", () => {
  it("adds the duration to the pickup time", () => {
    expect(computePlannedEnd("10:00", 90)).toEqual({ time: "11:30", nextDay: false });
    expect(computePlannedEnd("09:15", 45)).toEqual({ time: "10:00", nextDay: false });
  });

  it("flags crossing midnight", () => {
    expect(computePlannedEnd("23:30", 60)).toEqual({ time: "00:30", nextDay: true });
    expect(computePlannedEnd("23:00", 60)).toEqual({ time: "00:00", nextDay: true });
  });

  it("accepts numeric strings", () => {
    expect(computePlannedEnd("10:00", "30")).toEqual({ time: "10:30", nextDay: false });
  });

  it("returns null when it cannot be computed", () => {
    expect(computePlannedEnd("", 60)).toBeNull();
    expect(computePlannedEnd("10:00", 0)).toBeNull();
    expect(computePlannedEnd("10:00", "")).toBeNull();
    expect(computePlannedEnd("10:00", -5)).toBeNull();
    expect(computePlannedEnd("nope", 60)).toBeNull();
    expect(computePlannedEnd("25:00", 60)).toBeNull();
  });
});
