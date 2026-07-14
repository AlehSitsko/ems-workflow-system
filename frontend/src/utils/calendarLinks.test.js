import { describe, it, expect } from "vitest";
import { buildDispatchLink } from "./calendarLinks";

describe("buildDispatchLink", () => {
  it("builds a date-only link", () => {
    expect(buildDispatchLink("2026-07-16")).toBe("/dispatch?date=2026-07-16");
  });

  it("includes a focused call id", () => {
    expect(buildDispatchLink("2026-07-16", { call: 142 })).toBe("/dispatch?date=2026-07-16&call=142");
  });

  it("includes a focused unit id", () => {
    expect(buildDispatchLink("2026-07-16", { unit: 25 })).toBe("/dispatch?date=2026-07-16&unit=25");
  });

  it("omits call/unit when not provided", () => {
    const link = buildDispatchLink("2026-07-16", {});
    expect(link).not.toContain("call");
    expect(link).not.toContain("unit");
  });
});
