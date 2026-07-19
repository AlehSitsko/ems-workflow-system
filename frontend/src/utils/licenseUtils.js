// Shared employee license/certification helpers used by both Crew Planner
// and Dispatch Board unit-crew forms. Extracted from duplicated per-page
// copies to keep license-status and role-eligibility rules in one place.

export function normalizeLicense(license) {
  if (!license) {
    return { hasLicense: false, licenseName: "", expirationDate: "" };
  }
  return {
    hasLicense: Boolean(license.hasLicense),
    licenseName: license.licenseName || "",
    expirationDate: license.expirationDate || "",
  };
}

export function getLicenseStatus(license) {
  const normalizedLicense = normalizeLicense(license);

  if (!normalizedLicense.hasLicense) {
    return "No License";
  }
  if (!normalizedLicense.expirationDate) {
    return "Active";
  }

  const today = new Date();
  const expirationDate = new Date(`${normalizedLicense.expirationDate}T23:59:59`);
  const diffInDays = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));

  if (diffInDays < 0) {
    return "Expired";
  }
  if (diffInDays <= 30) {
    return "Expiring Soon";
  }
  return "Active";
}

export function getCprWarning(employee) {
  const cpr = normalizeLicense(employee.cpr);
  const cprStatus = getLicenseStatus(cpr);

  if (!cpr.hasLicense) {
    return "Missing CPR";
  }
  if (cprStatus === "Expired") {
    return "CPR Expired";
  }
  if (cprStatus === "Expiring Soon") {
    return "CPR Expiring Soon";
  }
  return "";
}

/*
  Determines whether an employee can be assigned to a specific crew role.

  Rules:
  - Employee must be technically active.
  - Employee operational status must be active.
  - Driver requires EVOC (or role === "driver").
  - BLS medical slot requires EMT or Paramedic.
  - ALS medical slot requires Paramedic.
  - Assist slots allow any technically and operationally active employee.
*/
export function isEmployeeEligibleForRole(employee, role, unitType) {
  if (!employee.isActive || employee.status !== "active") {
    return false;
  }

  if (role === "driver") {
    const hasEvoc = Boolean(employee.evoc?.hasLicense);
    // A driver-only employee can drive without an EVOC record. Prefer the split
    // `qualification` field; fall back to the legacy `role` for any record the
    // API hasn't re-serialised yet.
    const isDriverQualified = employee.qualification === "driver_only"
      || String(employee.role || "").toLowerCase() === "driver";
    return hasEvoc || isDriverQualified;
  }

  if (role === "medical") {
    if (unitType === "BLS") {
      return Boolean(employee.emt?.hasLicense || employee.paramedic?.hasLicense);
    }
    if (unitType === "ALS") {
      return Boolean(employee.paramedic?.hasLicense);
    }
    return false;
  }

  if (role === "assist1" || role === "assist2") {
    return true;
  }

  return false;
}
