import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getLicenseStatus,
  getCprWarning,
  isEmployeeEligibleForRole,
} from "./licenseUtils";

describe("getLicenseStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("reports No License / Active without expiry", () => {
    expect(getLicenseStatus(null)).toBe("No License");
    expect(getLicenseStatus({ hasLicense: false })).toBe("No License");
    expect(getLicenseStatus({ hasLicense: true })).toBe("Active");
  });

  it("classifies by expiry distance", () => {
    expect(getLicenseStatus({ hasLicense: true, expirationDate: "2026-05-01" })).toBe("Expired");
    expect(getLicenseStatus({ hasLicense: true, expirationDate: "2026-06-30" })).toBe("Expiring Soon");
    expect(getLicenseStatus({ hasLicense: true, expirationDate: "2026-12-31" })).toBe("Active");
  });
});

describe("getCprWarning", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns the appropriate warning string", () => {
    expect(getCprWarning({ cpr: { hasLicense: false } })).toBe("Missing CPR");
    expect(getCprWarning({ cpr: { hasLicense: true, expirationDate: "2026-05-01" } })).toBe("CPR Expired");
    expect(getCprWarning({ cpr: { hasLicense: true, expirationDate: "2026-06-30" } })).toBe("CPR Expiring Soon");
    expect(getCprWarning({ cpr: { hasLicense: true, expirationDate: "2026-12-31" } })).toBe("");
  });
});

describe("isEmployeeEligibleForRole", () => {
  const active = (over = {}) => ({ isActive: true, status: "active", ...over });

  it("rejects inactive employees for any role", () => {
    expect(isEmployeeEligibleForRole({ isActive: false, status: "active" }, "assist1")).toBe(false);
    expect(isEmployeeEligibleForRole({ isActive: true, status: "inactive" }, "assist1")).toBe(false);
  });

  it("driver needs EVOC or driver role", () => {
    expect(isEmployeeEligibleForRole(active({ evoc: { hasLicense: true } }), "driver")).toBe(true);
    expect(isEmployeeEligibleForRole(active({ role: "driver" }), "driver")).toBe(true);
    expect(isEmployeeEligibleForRole(active(), "driver")).toBe(false);
  });

  it("BLS medical accepts EMT or Paramedic; ALS medical requires Paramedic", () => {
    expect(isEmployeeEligibleForRole(active({ emt: { hasLicense: true } }), "medical", "BLS")).toBe(true);
    expect(isEmployeeEligibleForRole(active({ paramedic: { hasLicense: true } }), "medical", "BLS")).toBe(true);
    expect(isEmployeeEligibleForRole(active({ emt: { hasLicense: true } }), "medical", "ALS")).toBe(false);
    expect(isEmployeeEligibleForRole(active({ paramedic: { hasLicense: true } }), "medical", "ALS")).toBe(true);
  });

  it("assist slots accept any active employee", () => {
    expect(isEmployeeEligibleForRole(active(), "assist1")).toBe(true);
    expect(isEmployeeEligibleForRole(active(), "assist2")).toBe(true);
  });
});
