// Frontend mirror of the canonical operational taxonomy.
//
// `backend/utils/taxonomy.py` is AUTHORITATIVE — it validates and normalizes on
// write, and publishes the contract at GET /api/taxonomy. This module mirrors
// that vocabulary and adds the display layer (labels + semantic color tokens)
// that only the UI needs. Keep the value lists in step with the backend; the
// endpoint exists so drift can be spotted rather than silently tolerated.
//
// Colour is never the only signal: every badge pairs its token colour with a
// text label and a tooltip/aria-label, and an unrecognised value degrades to a
// neutral "Unknown" badge instead of breaking the UI.

// ── Vocabularies (mirror of utils/taxonomy.py) ──────────────────────────────

export const SERVICE_LEVELS = ["BLS", "ALS", "BLS-4", "BLS-6", "CCT", "Bariatric", "Stretcher", "Wheelchair"];

export const UNIT_TYPES = ["BLS", "ALS", "BLS-4", "BLS-6", "CCT", "Bariatric", "Assist"];

export const VEHICLE_CAPABILITIES = ["BLS", "ALS", "CCT", "Bariatric", "Stretcher", "Wheelchair", "Assist"];

export const QUALIFICATIONS = [
  { value: "driver_only", label: "Driver-only" },
  { value: "emt", label: "EMT" },
  { value: "paramedic", label: "Paramedic" },
  { value: "assist", label: "Assist" },
];

export const SHIFT_ROLES = [
  { value: "driver", label: "Driver" },
  { value: "medical", label: "Medical" },
  { value: "assist", label: "Assist" },
];

// Organisational roles an employee can hold — separate from their clinical
// qualification (see the Employee.role split).
export const ADMIN_ROLES = [
  { value: "supervisor", label: "Supervisor" },
  { value: "manager", label: "Manager" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

// `emergency` is a call type / priority — never a level of care.
const NOT_SERVICE_LEVELS = new Set(["emergency", "none"]);

const ADMINISTRATIVE_ROLES = new Set(["supervisor", "manager", "admin", "dispatcher", "hr"]);

// ── Normalizers (same meaning as the backend) ───────────────────────────────

function aliasKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildAliases(values, extra = {}) {
  const map = {};
  values.forEach((v) => { map[aliasKey(v)] = v; });
  return { ...map, ...extra };
}

const SERVICE_LEVEL_ALIASES = buildAliases(SERVICE_LEVELS, {
  bari: "Bariatric", bariatric: "Bariatric", wc: "Wheelchair", wheel: "Wheelchair",
  strecher: "Stretcher",
});
const UNIT_TYPE_ALIASES = buildAliases(UNIT_TYPES, { bari: "Bariatric", support: "Assist" });
const VEHICLE_CAPABILITY_ALIASES = buildAliases(VEHICLE_CAPABILITIES, {
  bari: "Bariatric", wc: "Wheelchair", support: "Assist",
});
const QUALIFICATION_ALIASES = {
  driver: "driver_only", driveronly: "driver_only", emt: "emt", emtb: "emt",
  paramedic: "paramedic", medic: "paramedic", assist: "assist", support: "assist",
};

export function normalizeServiceLevel(value) {
  const key = aliasKey(value);
  if (!key || NOT_SERVICE_LEVELS.has(key)) return null;
  return SERVICE_LEVEL_ALIASES[key] ?? null;
}

export function normalizeUnitType(value) {
  const key = aliasKey(value);
  return key ? (UNIT_TYPE_ALIASES[key] ?? null) : null;
}

export function normalizeVehicleCapability(value) {
  const key = aliasKey(value);
  return key ? (VEHICLE_CAPABILITY_ALIASES[key] ?? null) : null;
}

export function normalizeQualification(value) {
  const key = aliasKey(value);
  if (!key || ADMINISTRATIVE_ROLES.has(key)) return null;
  return QUALIFICATION_ALIASES[key] ?? null;
}

export function isAdministrativeRole(value) {
  return ADMINISTRATIVE_ROLES.has(aliasKey(value));
}

// ── Display layer ───────────────────────────────────────────────────────────

// Canonical value → semantic colour token suffix (see --ems-tax-* in theme.css).
const LEVEL_TOKENS = {
  BLS: "bls",
  ALS: "als",
  "BLS-4": "bls4",
  "BLS-6": "bls6",
  CCT: "cct",
  Bariatric: "bariatric",
  Stretcher: "stretcher",
  Wheelchair: "wheelchair",
  Assist: "assist",
};

const QUALIFICATION_TOKENS = {
  driver_only: "driver",
  emt: "emt",
  paramedic: "paramedic",
  assist: "assist",
};

const QUALIFICATION_LABELS = Object.fromEntries(QUALIFICATIONS.map((q) => [q.value, q.label]));
const SHIFT_ROLE_LABELS = Object.fromEntries(SHIFT_ROLES.map((r) => [r.value, r.label]));

/**
 * Presentation for any service level / unit type / vehicle capability value.
 * Always returns something renderable — an unrecognised value becomes a neutral
 * "Unknown" badge that keeps the raw text in its title, so bad data stays
 * visible rather than crashing or being hidden.
 */
export function describeLevel(rawValue, { normalizer = normalizeServiceLevel } = {}) {
  const canonical = normalizer(rawValue);
  if (!canonical) {
    const raw = String(rawValue ?? "").trim();
    return {
      canonical: null,
      known: false,
      label: raw ? "Unknown" : "—",
      token: "unknown",
      title: raw ? `Unrecognised value: ${raw}` : "Not set",
    };
  }
  return {
    canonical,
    known: true,
    label: canonical,
    token: LEVEL_TOKENS[canonical] || "unknown",
    title: canonical,
  };
}

/** Presentation for an employee qualification (Employee.role today). */
export function describeQualification(rawValue) {
  const canonical = normalizeQualification(rawValue);
  if (canonical) {
    return {
      canonical,
      known: true,
      administrative: false,
      label: QUALIFICATION_LABELS[canonical],
      token: QUALIFICATION_TOKENS[canonical] || "unknown",
      title: `Qualification: ${QUALIFICATION_LABELS[canonical]}`,
    };
  }
  if (isAdministrativeRole(rawValue)) {
    const raw = String(rawValue ?? "").trim();
    const label = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    // Administrative roles are shown as their own badge — they are not a
    // clinical qualification and must not imply one.
    return { canonical: null, known: true, administrative: true, label, token: "admin", title: `Administrative role: ${label}` };
  }
  const raw = String(rawValue ?? "").trim();
  return {
    canonical: null,
    known: false,
    administrative: false,
    label: raw ? "Unknown" : "—",
    token: "unknown",
    title: raw ? `Unrecognised qualification: ${raw}` : "No qualification set",
  };
}

// ── Operational status (a separate dimension from capability) ───────────────
//
// A vehicle's capability says what it CAN do; its operational status says
// whether it is usable right now. Keeping them apart is why a Bariatric unit
// that is out of service shows a purple capability AND a red status, instead of
// one colour trying to mean both.

export const OPERATIONAL_STATUSES = ["in_service", "out_of_service", "maintenance"];

const OPERATIONAL_STATUS_META = {
  in_service: { label: "In Service", tone: "success" },
  out_of_service: { label: "Out of Service", tone: "danger" },
  maintenance: { label: "Maintenance", tone: "warning" },
  retired: { label: "Retired", tone: "neutral" },
};

/**
 * Presentation for a vehicle's operational status.
 * `isRetired` wins: a retired vehicle is not "in service" whatever the column says.
 */
export function describeOperationalStatus(value, { isRetired = false } = {}) {
  if (isRetired) {
    return { value: "retired", known: true, title: "Retired", ...OPERATIONAL_STATUS_META.retired };
  }
  const normalized = OPERATIONAL_STATUSES.find((s) => aliasKey(s) === aliasKey(value));
  const meta = OPERATIONAL_STATUS_META[normalized];
  if (!meta) {
    const raw = String(value ?? "").trim();
    return {
      value: null,
      known: false,
      label: raw ? "Unknown" : "—",
      tone: "neutral",
      title: raw ? `Unrecognised status: ${raw}` : "No status set",
    };
  }
  return { value: normalized, known: true, ...meta, title: meta.label };
}

/** Presentation for the role an employee works on a given shift (from the slot). */
export function describeShiftRole(role) {
  const key = aliasKey(role);
  const label = SHIFT_ROLE_LABELS[key];
  if (!label) return { known: false, label: "—", value: null, title: "No shift role" };
  return { known: true, value: key, label, title: `Shift role: ${label}` };
}
