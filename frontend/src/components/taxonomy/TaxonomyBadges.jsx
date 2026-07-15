import { FaCar, FaStarOfLife, FaHandsHelping, FaUserShield } from "react-icons/fa";

import {
  describeLevel, describeQualification, describeShiftRole,
  normalizeUnitType, normalizeVehicleCapability,
} from "../../utils/taxonomy";

// Reusable operational classification badges.
//
// Every badge renders colour + text + a tooltip/aria-label, so the category is
// never communicated by colour alone. Unrecognised values degrade to a neutral
// "Unknown" badge that keeps the raw value in its title rather than breaking.
// Colours come from the semantic --ems-tax-* / --ems-qual-* tokens (theme.css),
// so one meaning maps to one colour in every module and in both themes.

function Badge({ token, label, title, group = "tax", className = "" }) {
  const rgb = `var(--ems-${group}-${token}-rgb)`;
  return (
    <span
      className={`taxonomy-badge ${className}`}
      title={title}
      aria-label={title}
      style={{
        color: `rgb(${rgb})`,
        background: `rgba(${rgb}, 0.14)`,
        border: `1px solid rgba(${rgb}, 0.4)`,
      }}
    >
      {label}
    </span>
  );
}

/** Actual level of care for a trip (Call.service_level) or a patient default. */
export function ServiceLevelBadge({ value, prefix }) {
  const d = describeLevel(value);
  return <Badge token={d.token} label={prefix ? `${prefix} ${d.label}` : d.label} title={prefix ? `${prefix}: ${d.title}` : d.title} />;
}

/** How a crew unit is deployed for the day (DailyCrewUnit.unit_type). */
export function UnitTypeBadge({ value }) {
  const d = describeLevel(value, { normalizer: normalizeUnitType });
  return <Badge token={d.token} label={d.label} title={`Unit type: ${d.title}`} />;
}

/** What a physical vehicle can do. */
export function VehicleTypeBadge({ value }) {
  const d = describeLevel(value, { normalizer: normalizeVehicleCapability });
  return <Badge token={d.token} label={d.label} title={`Vehicle capability: ${d.title}`} />;
}

/** What an employee is qualified to do — NOT the role they work on a shift. */
export function QualificationBadge({ value }) {
  const d = describeQualification(value);
  return <Badge group="qual" token={d.token} label={d.label} title={d.title} />;
}

const SHIFT_ROLE_ICONS = {
  driver: FaCar,
  medical: FaStarOfLife,
  assist: FaHandsHelping,
};

/**
 * The role an employee works on THIS shift (from the crew slot). Deliberately
 * icon-led and colour-neutral so it can never be mistaken for the qualification
 * colour — a Paramedic rostered as Driver shows a blue qualification and a
 * Driver shift role.
 */
export function AssignedRoleBadge({ role }) {
  const d = describeShiftRole(role);
  if (!d.known) return null;
  const Icon = SHIFT_ROLE_ICONS[d.value] || FaUserShield;
  return (
    <span className="taxonomy-role-badge" title={d.title} aria-label={d.title}>
      <Icon aria-hidden="true" />
      {d.label}
    </span>
  );
}

/**
 * Employee avatar with a qualification-coloured ring. The ring is a secondary
 * cue only — the accessible name always spells out the qualification (and the
 * shift role when supplied).
 */
export function EmployeeAvatar({ name, qualification, shiftRole, size = 28 }) {
  const d = describeQualification(qualification);
  const rgb = `var(--ems-qual-${d.token}-rgb)`;
  const initials = String(name || "?")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0].toUpperCase()).join("") || "?";
  const roleText = shiftRole ? describeShiftRole(shiftRole).label : null;
  const title = [name || "Unassigned", d.label, roleText && `${roleText} this shift`]
    .filter(Boolean).join(" — ");

  return (
    <span
      className="employee-avatar"
      title={title}
      aria-label={title}
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.4),
        color: `rgb(${rgb})`,
        background: `rgba(${rgb}, 0.16)`,
        boxShadow: `0 0 0 2px rgb(${rgb})`,
      }}
    >
      {initials}
    </span>
  );
}
