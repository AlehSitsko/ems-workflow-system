import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  minCrewForType,
  isAlsUnit,
  isEmergencyCall,
  isWillCall,
  timeToMinutes,
  expandAndSort,
  getShiftAlertSeverity,
} from "./dispatchBoardUtils";

describe("minCrewForType", () => {
  it("requires 4 for BLS-4/BLS-6, else 2", () => {
    expect(minCrewForType("BLS-4")).toBe(4);
    expect(minCrewForType("BLS-6")).toBe(4);
    expect(minCrewForType("ALS")).toBe(2);
    expect(minCrewForType("")).toBe(2);
  });
});

describe("call/unit type predicates", () => {
  it("classifies case-insensitively", () => {
    expect(isAlsUnit("als")).toBe(true);
    expect(isAlsUnit("BLS")).toBe(false);
    expect(isEmergencyCall({ call_type: "Emergency" })).toBe(true);
    expect(isWillCall({ call_type: "will_call" })).toBe(true);
    expect(isWillCall({ call_type: "return" })).toBe(false);
  });
});

describe("timeToMinutes", () => {
  it("parses 12h and 24h forms", () => {
    expect(timeToMinutes("2:30 PM")).toBe(14 * 60 + 30);
    expect(timeToMinutes("12:00 AM")).toBe(0);
    expect(timeToMinutes("09:15")).toBe(9 * 60 + 15);
  });
  it("returns a large sentinel for empty/unparseable", () => {
    expect(timeToMinutes("")).toBe(99999);
    expect(timeToMinutes(null)).toBe(99999);
  });
});

describe("expandAndSort", () => {
  it("sorts scheduled calls by pickup time and pushes will-call last", () => {
    const calls = [
      { id: 1, pickup_time: "10:00", call_type: "scheduled" },
      { id: 2, pickup_time: "08:00", call_type: "scheduled" },
      { id: 3, call_type: "will_call" },
    ];
    const out = expandAndSort(calls);
    expect(out.map((c) => c.id)).toEqual([2, 1, 3]);
    expect(out[2]._slot).toBe("will_call");
  });

  it("expands legacy return info embedded in notes into two slots", () => {
    const calls = [{
      id: 5,
      pickup_time: "09:00",
      notes: "Return pickup: Clinic; Return destination: Home; Return time: 15:00",
    }];
    const out = expandAndSort(calls);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c._slot).sort()).toEqual(["outbound", "return"]);
    const ret = out.find((c) => c._slot === "return");
    expect(ret.pickup_address).toBe("Clinic");
    expect(ret.dropoff_address).toBe("Home");
  });
});

describe("getShiftAlertSeverity", () => {
  const REF = new Date("2026-06-15T12:00:00");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(REF);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const base = {
    startTime: "06:00",
    shiftDurationHours: 12,
    shiftDate: "2026-06-15",
  };

  it("returns null when required fields are missing", () => {
    expect(getShiftAlertSeverity({})).toBeNull();
    expect(getShiftAlertSeverity({ ...base, plannedEndTime: undefined })).toBeNull();
  });

  it("returns null for completed/cancelled shifts", () => {
    expect(getShiftAlertSeverity({ ...base, plannedEndTime: "12:10", shiftStatus: "completed" })).toBeNull();
    expect(getShiftAlertSeverity({ ...base, plannedEndTime: "12:10", shiftStatus: "cancelled" })).toBeNull();
  });

  it("returns null for units on a different date", () => {
    expect(getShiftAlertSeverity({ ...base, shiftDate: "2026-06-14", plannedEndTime: "12:10" })).toBeNull();
  });

  it("returns null when comfortably before end (>30m left)", () => {
    // ends 14:00, now 12:00 -> 120m left
    expect(getShiftAlertSeverity({ ...base, plannedEndTime: "14:00" })).toBeNull();
  });

  it("escalates as end approaches and passes", () => {
    // 20m left -> warning
    expect(getShiftAlertSeverity({ ...base, plannedEndTime: "12:20" })).toBe("warning");
    // 10m left -> serious
    expect(getShiftAlertSeverity({ ...base, plannedEndTime: "12:10" })).toBe("serious");
    // 20m overdue -> minor
    expect(getShiftAlertSeverity({ ...base, plannedEndTime: "11:40" })).toBe("minor");
    // 90m overdue -> serious
    expect(getShiftAlertSeverity({ ...base, plannedEndTime: "10:30" })).toBe("serious");
    // 3h overdue -> critical
    expect(getShiftAlertSeverity({ ...base, plannedEndTime: "09:00" })).toBe("critical");
  });
});
