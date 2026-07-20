import { describe, it, expect } from "vitest";
import {
  isVehicleReady,
  getSelectableVehicles,
  describeVehicleOption,
  vehicleSupportsUnitType,
  getVehicleWarnings,
  getUnitTimeRange,
  findVehicleOverlaps,
} from "./vehicleAssignment";

const vehicle = (over = {}) => ({
  id: 1, unitName: "Ambu-1", unitNumber: "101", unitType: "BLS",
  capabilities: ["BLS"], isActive: true, isRetired: false,
  operationalStatus: "in_service", availableForService: true,
  ...over,
});

describe("isVehicleReady", () => {
  it("trusts the backend's availableForService when present", () => {
    expect(isVehicleReady(vehicle())).toBe(true);
    expect(isVehicleReady(vehicle({ availableForService: false }))).toBe(false);
  });

  it("falls back to the component flags for older payloads", () => {
    const legacy = (over) => { const v = vehicle(over); delete v.availableForService; return v; };
    expect(isVehicleReady(legacy())).toBe(true);
    expect(isVehicleReady(legacy({ operationalStatus: "out_of_service" }))).toBe(false);
    expect(isVehicleReady(legacy({ isRetired: true }))).toBe(false);
    expect(isVehicleReady(legacy({ isActive: false }))).toBe(false);
  });
});

describe("getSelectableVehicles", () => {
  const ready = vehicle({ id: 1 });
  const broken = vehicle({ id: 2, unitName: "Ambu-2", availableForService: false, operationalStatus: "maintenance" });

  it("offers only ready vehicles by default", () => {
    expect(getSelectableVehicles([ready, broken]).map((v) => v.id)).toEqual([1]);
  });

  it("keeps the shift's current vehicle even once it stops being ready", () => {
    // Otherwise editing the crew of an already-planned shift would drop the truck.
    expect(getSelectableVehicles([ready, broken], 2).map((v) => v.id)).toEqual([1, 2]);
  });

  it("does not duplicate a current vehicle that is still ready", () => {
    expect(getSelectableVehicles([ready, broken], 1).map((v) => v.id)).toEqual([1]);
  });
});

describe("describeVehicleOption", () => {
  it("labels a ready vehicle plainly", () => {
    expect(describeVehicleOption(vehicle())).toBe("Ambu-1 (#101) — BLS");
  });

  it("spells out why an offered vehicle is not ready", () => {
    expect(describeVehicleOption(vehicle({ availableForService: false, operationalStatus: "out_of_service" })))
      .toBe("Ambu-1 (#101) — BLS — out of service");
  });
});

describe("vehicleSupportsUnitType", () => {
  it("matches on capabilities", () => {
    const v = vehicle({ capabilities: ["BLS", "Wheelchair"] });
    expect(vehicleSupportsUnitType(v, "BLS")).toBe(true);
    expect(vehicleSupportsUnitType(v, "ALS")).toBe(false);
  });

  it("falls back to the headline unit type when capabilities are empty", () => {
    expect(vehicleSupportsUnitType(vehicle({ capabilities: [], unitType: "ALS" }), "ALS")).toBe(true);
  });

  it("normalises aliases on both sides", () => {
    expect(vehicleSupportsUnitType(vehicle({ capabilities: ["bariatric"] }), "bari")).toBe(true);
  });
});

describe("getVehicleWarnings", () => {
  it("is silent for a ready, capable, unbooked vehicle", () => {
    expect(getVehicleWarnings({ vehicle: vehicle(), unitType: "BLS" })).toEqual([]);
  });

  it("warns about an out-of-service vehicle", () => {
    const w = getVehicleWarnings({
      vehicle: vehicle({ availableForService: false, operationalStatus: "out_of_service" }),
      unitType: "BLS",
    });
    expect(w).toEqual(["Ambu-1 is out of service."]);
  });

  it("warns about a capability mismatch", () => {
    const w = getVehicleWarnings({ vehicle: vehicle(), unitType: "ALS" });
    expect(w[0]).toBe("Ambu-1 is not ALS capable (BLS).");
  });

  it("warns once per overlapping shift", () => {
    const w = getVehicleWarnings({
      vehicle: vehicle(),
      unitType: "BLS",
      overlappingUnits: [{ label: "BLS 08:00–20:00" }, { label: "ALS 18:00–06:00" }],
    });
    expect(w).toEqual([
      "Ambu-1 is already on shift BLS 08:00–20:00.",
      "Ambu-1 is already on shift ALS 18:00–06:00.",
    ]);
  });

  it("says nothing when no vehicle is picked yet", () => {
    expect(getVehicleWarnings({ vehicle: null, unitType: "BLS" })).toEqual([]);
  });
});

describe("getUnitTimeRange", () => {
  it("returns null until an end time is known", () => {
    expect(getUnitTimeRange("2026-07-20", "08:00", "", "")).toBeNull();
  });

  it("measures a same-day shift", () => {
    const r = getUnitTimeRange("2026-07-20", "08:00", "20:00", "");
    expect((r.end - r.start) / 3600000).toBe(12);
  });

  it("rolls a night shift onto the next local day", () => {
    // The rollover must be computed in local time. toISOString() would move the
    // date back a day everywhere east of Greenwich, making the range negative
    // (and therefore null) instead of a 12-hour night.
    const r = getUnitTimeRange("2026-07-20", "20:00", "08:00", "");
    expect(r).not.toBeNull();
    expect((r.end - r.start) / 3600000).toBe(12);
    expect(new Date(r.end).getDate()).toBe(21);
  });

  it("lets an explicit end date win", () => {
    const r = getUnitTimeRange("2026-07-20", "20:00", "08:00", "2026-07-22");
    expect(new Date(r.end).getDate()).toBe(22);
  });
});

describe("findVehicleOverlaps", () => {
  const form = { shiftDate: "2026-07-20", startTime: "08:00", endTime: "20:00", endDate: "", vehicleId: 1, truckNumber: "101" };
  const other = (over = {}) => ({
    id: 9, shiftDate: "2026-07-20", startTime: "18:00", endTime: "23:00", endDate: "",
    vehicleId: 1, truckNumber: "101", shiftStatus: "scheduled", ...over,
  });

  it("finds a booking that overlaps on the same vehicle", () => {
    expect(findVehicleOverlaps({ form, units: [other()] }).map((u) => u.id)).toEqual([9]);
  });

  it("ignores a different vehicle even when the truck numbers were reused", () => {
    expect(findVehicleOverlaps({ form, units: [other({ vehicleId: 2 })] })).toEqual([]);
  });

  it("ignores back-to-back shifts that only touch", () => {
    expect(findVehicleOverlaps({ form, units: [other({ startTime: "20:00", endTime: "23:00" })] })).toEqual([]);
  });

  it("ignores cancelled and completed shifts", () => {
    expect(findVehicleOverlaps({ form, units: [other({ shiftStatus: "cancelled" }), other({ id: 10, shiftStatus: "completed" })] })).toEqual([]);
  });

  it("ignores the shift being edited", () => {
    expect(findVehicleOverlaps({ form, units: [other()], editingUnitId: 9 })).toEqual([]);
  });

  it("falls back to the truck number for legacy shifts with no link", () => {
    const legacyForm = { ...form, vehicleId: null };
    expect(findVehicleOverlaps({ form: legacyForm, units: [other({ vehicleId: null })] }).map((u) => u.id)).toEqual([9]);
  });
});
