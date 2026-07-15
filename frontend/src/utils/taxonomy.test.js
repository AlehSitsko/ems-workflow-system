import { describe, it, expect } from "vitest";
import {
  SERVICE_LEVELS, UNIT_TYPES,
  normalizeServiceLevel, normalizeUnitType, normalizeVehicleCapability,
  normalizeQualification, isAdministrativeRole,
  describeLevel, describeQualification, describeShiftRole,
} from "./taxonomy";

// This mirror must mean the same thing as backend/utils/taxonomy.py — the cases
// below are the legacy values actually present in the database.

describe("normalizeServiceLevel", () => {
  it("canonicalizes legacy casing and separators", () => {
    expect(normalizeServiceLevel("bls")).toBe("BLS");
    expect(normalizeServiceLevel("als")).toBe("ALS");
    expect(normalizeServiceLevel("  Stretcher ")).toBe("Stretcher");
    expect(normalizeServiceLevel("BLS4")).toBe("BLS-4");
    expect(normalizeServiceLevel("BARI")).toBe("Bariatric");
    expect(normalizeServiceLevel("wc")).toBe("Wheelchair");
  });

  it("rejects emergency — it is a call type, not a level of care", () => {
    expect(normalizeServiceLevel("emergency")).toBeNull();
    expect(normalizeServiceLevel("Emergency")).toBeNull();
  });

  it("returns null for empty/unknown", () => {
    ["", "   ", null, undefined, "banana"].forEach((v) => {
      expect(normalizeServiceLevel(v)).toBeNull();
    });
  });

  it("maps every canonical value to itself", () => {
    SERVICE_LEVELS.forEach((v) => expect(normalizeServiceLevel(v)).toBe(v));
  });
});

describe("normalizeUnitType / normalizeVehicleCapability", () => {
  it("canonicalizes unit types", () => {
    expect(normalizeUnitType("bls")).toBe("BLS");
    expect(normalizeUnitType("ASSIST")).toBe("Assist");
    expect(normalizeUnitType("BLS6")).toBe("BLS-6");
    expect(normalizeUnitType("spaceship")).toBeNull();
    UNIT_TYPES.forEach((v) => expect(normalizeUnitType(v)).toBe(v));
  });

  it("canonicalizes the legacy BARI vehicle spelling", () => {
    expect(normalizeVehicleCapability("BARI")).toBe("Bariatric");
    expect(normalizeVehicleCapability("nope")).toBeNull();
  });
});

describe("qualification vs administrative role", () => {
  it("normalizes qualifications", () => {
    expect(normalizeQualification("Driver")).toBe("driver_only");
    expect(normalizeQualification("EMT")).toBe("emt");
    expect(normalizeQualification("Paramedic")).toBe("paramedic");
    expect(normalizeQualification("medic")).toBe("paramedic");
  });

  it("treats Supervisor as administrative, not a clinical qualification", () => {
    expect(normalizeQualification("Supervisor")).toBeNull();
    expect(isAdministrativeRole("Supervisor")).toBe(true);
    expect(isAdministrativeRole("Paramedic")).toBe(false);
  });
});

describe("describeLevel", () => {
  it("describes a known level with its semantic token", () => {
    const d = describeLevel("bls");
    expect(d).toMatchObject({ canonical: "BLS", known: true, label: "BLS", token: "bls" });
  });

  it("degrades an unrecognised value to a neutral badge that keeps the raw text", () => {
    const d = describeLevel("emergency");
    expect(d.known).toBe(false);
    expect(d.token).toBe("unknown");
    expect(d.label).toBe("Unknown");
    expect(d.title).toContain("emergency"); // raw value stays visible
  });

  it("renders an em dash for an unset value", () => {
    expect(describeLevel("").label).toBe("—");
    expect(describeLevel(null).title).toBe("Not set");
  });
});

describe("describeQualification", () => {
  it("labels a clinical qualification", () => {
    expect(describeQualification("Paramedic")).toMatchObject({
      canonical: "paramedic", label: "Paramedic", token: "paramedic", administrative: false,
    });
  });

  it("flags an administrative role separately", () => {
    const d = describeQualification("Supervisor");
    expect(d.administrative).toBe(true);
    expect(d.token).toBe("admin");
    expect(d.title).toContain("Administrative");
  });

  it("degrades unknown to neutral", () => {
    expect(describeQualification("wizard")).toMatchObject({ known: false, token: "unknown" });
  });
});

describe("describeShiftRole", () => {
  it("comes from the crew slot, independent of qualification", () => {
    expect(describeShiftRole("driver")).toMatchObject({ known: true, label: "Driver" });
    expect(describeShiftRole("medical").label).toBe("Medical");
    expect(describeShiftRole(null).known).toBe(false);
  });
});
