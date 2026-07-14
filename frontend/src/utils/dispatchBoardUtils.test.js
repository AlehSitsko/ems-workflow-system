import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  todayStr,
  isIsoDate,
  addDays,
  boardMode,
  canEditAssignments,
  canUseLiveStatus,
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

// ── Date modes & boundary-safe date math (Calendar ↔ Dispatch integration) ──

describe("todayStr", () => {
  it("returns a local YYYY-MM-DD string", () => {
    expect(isIsoDate(todayStr())).toBe(true);
  });
});

describe("isIsoDate", () => {
  it("accepts YYYY-MM-DD and rejects anything else", () => {
    expect(isIsoDate("2026-07-16")).toBe(true);
    expect(isIsoDate("2026-7-6")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe("addDays (timezone-safe boundaries)", () => {
  it("steps within a month", () => {
    expect(addDays("2026-07-16", 1)).toBe("2026-07-17");
    expect(addDays("2026-07-16", -1)).toBe("2026-07-15");
  });
  it("rolls across a month boundary", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("rolls across a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("boardMode", () => {
  it("is live for today", () => {
    expect(boardMode("2026-07-16", "2026-07-16")).toBe("live");
    expect(boardMode(todayStr())).toBe("live");
  });
  it("is planning for a future date", () => {
    expect(boardMode("2026-07-20", "2026-07-16")).toBe("planning");
    expect(boardMode("2027-01-01", "2026-12-31")).toBe("planning");
  });
  it("is history for a past date", () => {
    expect(boardMode("2026-07-10", "2026-07-16")).toBe("history");
    expect(boardMode("2026-12-31", "2027-01-01")).toBe("history");
  });
});

describe("mode capabilities", () => {
  it("allows assignment edits in planning and live, not history", () => {
    expect(canEditAssignments("planning")).toBe(true);
    expect(canEditAssignments("live")).toBe(true);
    expect(canEditAssignments("history")).toBe(false);
  });
  it("allows live status only in live mode", () => {
    expect(canUseLiveStatus("live")).toBe(true);
    expect(canUseLiveStatus("planning")).toBe(false);
    expect(canUseLiveStatus("history")).toBe(false);
  });
});
