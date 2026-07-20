import { normalizeUnitType, normalizeVehicleCapability } from "./taxonomy";
import { toISODate } from "./holidayUtils";

// Shared rules for putting a fleet vehicle on a crew shift. Used by both the
// Dispatch Board and the Crew Planner so the two forms cannot drift apart.

// Vehicles that may be put on a shift: in the fleet, not retired, in service.
// The backend already computes this as `availableForService`; the local checks
// are the fallback for payloads that predate that field.
export function isVehicleReady(v) {
  if (!v) return false;
  if (typeof v.availableForService === "boolean") return v.availableForService;
  return Boolean(v.isActive) && !v.isRetired && (v.operationalStatus || "in_service") === "in_service";
}

// Options for the picker: every ready vehicle, plus whichever one this shift
// already runs. A vehicle that went out of service after the shift was planned
// must stay selectable, otherwise editing the crew would silently drop it.
export function getSelectableVehicles(vehicles, selectedVehicleId) {
  const list = (vehicles || []).filter(isVehicleReady);
  if (!selectedVehicleId) return list;

  const already = list.some((v) => String(v.id) === String(selectedVehicleId));
  if (already) return list;

  const current = (vehicles || []).find((v) => String(v.id) === String(selectedVehicleId));
  return current ? [...list, current] : list;
}

// "Ambu-1 (#101) — BLS", with the reason it is not ready appended when that
// applies, so an unusual choice is never silently unusual.
export function describeVehicleOption(v) {
  const base = `${v.unitName} (#${v.unitNumber}) — ${v.unitType}`;
  if (isVehicleReady(v)) return base;
  if (v.isRetired) return `${base} — retired`;
  if (!v.isActive) return `${base} — inactive`;
  const status = (v.operationalStatus || "").replace(/_/g, " ");
  return status ? `${base} — ${status}` : base;
}

// Can this vehicle run this unit type? Capabilities are authoritative; they
// fall back to the headline unitType for vehicles that predate the field.
export function vehicleSupportsUnitType(vehicle, unitType) {
  if (!vehicle || !unitType) return true;

  const wanted = normalizeUnitType(unitType) || unitType;
  const caps = (vehicle.capabilities && vehicle.capabilities.length
    ? vehicle.capabilities
    : [vehicle.unitType]
  ).map((c) => normalizeVehicleCapability(c) || c);

  return caps.includes(wanted);
}

// A shift's absolute time range as epoch-ms { start, end }, or null when the
// end cannot be determined. Night shifts crossing midnight are handled: an
// explicit endDate wins, otherwise an end earlier than the start is the next
// day. toISODate keeps that rollover in local time — toISOString() would shift
// the date by the UTC offset and mis-date the shift east of Greenwich.
export function getUnitTimeRange(shiftDate, startTime, endTime, endDate) {
  if (!shiftDate || !startTime || !endTime) return null;

  const start = new Date(`${shiftDate}T${startTime}:00`);
  let endDay = endDate || shiftDate;
  if (!endDate && endTime < startTime) {
    const d = new Date(`${shiftDate}T00:00:00`);
    d.setDate(d.getDate() + 1);
    endDay = toISODate(d);
  }

  const end = new Date(`${endDay}T${endTime}:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return null;
  return { start: start.getTime(), end: end.getTime() };
}

// Shifts already booked on the same vehicle whose time overlaps `form`.
// Matching is by vehicleId, falling back to the truck number only for legacy
// shifts that carry no link. Cancelled/completed shifts and the shift being
// edited are excluded.
export function findVehicleOverlaps({ form, units = [], editingUnitId = null }) {
  const formRange = getUnitTimeRange(form.shiftDate, form.startTime, form.endTime, form.endDate);
  if (!formRange) return [];

  const truck = (form.truckNumber || "").trim().toLowerCase();
  if (!form.vehicleId && !truck) return [];

  return units.filter((u) => {
    if (editingUnitId && String(u.id) === String(editingUnitId)) return false;
    if (["cancelled", "completed"].includes(u.shiftStatus)) return false;

    const sameVehicle = form.vehicleId && u.vehicleId
      ? String(u.vehicleId) === String(form.vehicleId)
      : (u.truckNumber || "").trim().toLowerCase() === truck;
    if (!sameVehicle) return false;

    const other = getUnitTimeRange(u.shiftDate, u.startTime, u.endTime, u.endDate);
    // Half-open overlap: start < otherEnd && otherStart < end.
    return other ? formRange.start < other.end && other.start < formRange.end : false;
  });
}

// Non-blocking warnings about the chosen vehicle. Both cases are real-world
// legitimate — planning ahead of a repair, a mid-day truck swap — so they warn
// rather than block, consistent with the crew warnings alongside them.
export function getVehicleWarnings({ vehicle, unitType, overlappingUnits = [] }) {
  if (!vehicle) return [];

  const warnings = [];

  if (!isVehicleReady(vehicle)) {
    const reason = vehicle.isRetired
      ? "retired"
      : !vehicle.isActive
        ? "inactive"
        : (vehicle.operationalStatus || "").replace(/_/g, " ") || "not available";
    warnings.push(`${vehicle.unitName} is ${reason}.`);
  }

  if (!vehicleSupportsUnitType(vehicle, unitType)) {
    warnings.push(
      `${vehicle.unitName} is not ${unitType} capable (${(vehicle.capabilities || [vehicle.unitType]).join(", ")}).`,
    );
  }

  overlappingUnits.forEach((u) => {
    warnings.push(`${vehicle.unitName} is already on shift ${u.label}.`);
  });

  return warnings;
}
