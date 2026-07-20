import { useMemo } from "react";
import { getCprWarning } from "../utils/licenseUtils";
import { findVehicleOverlaps, getVehicleWarnings } from "../utils/vehicleAssignment";

// Unit-form validation/warnings for the Dispatch Board's Create/Edit Unit
// drawer — extracted from DispatchBoardPage.jsx (Phase 2b of its hook/
// component split, see docs/ROADMAP.md Priority 1).

export function useUnitFormValidation({
  unitForm,
  getEmployeeById,
  getEmployeeAssignmentsInOtherUnits,
  vehicles = [],
  units = [],
  editingUnitId = null,
}) {
  const errors = useMemo(() => {
    const errs = [];
    if (!unitForm.shiftDate.trim()) errs.push("Shift Date is required.");
    if (!unitForm.truckNumber.trim()) errs.push("Vehicle is required.");
    if (!unitForm.startTime.trim()) errs.push("Start Time is required.");
    if (!unitForm.noPatient && unitForm.patientOrder.length === 0) errs.push("Add at least one patient, or check \"No patient assigned\".");
    if (!unitForm.crew.driver) errs.push("Driver is required.");
    if (unitForm.unitType === "BLS" && !unitForm.crew.medical) errs.push("BLS unit requires an EMT or Paramedic.");
    if (unitForm.unitType === "ALS" && !unitForm.crew.medical) errs.push("ALS unit requires a Paramedic.");
    return errs;
  }, [unitForm]);

  const warnings = useMemo(() => {
    const warns = [];

    Object.values(unitForm.crew).filter(Boolean).map(id => getEmployeeById(id)).filter(Boolean).forEach(emp => {
      const w = getCprWarning(emp);
      if (w) warns.push(`${emp.firstName} ${emp.lastName}: ${w}.`);
      getEmployeeAssignmentsInOtherUnits(emp.id).forEach(a => {
        warns.push(`${emp.firstName} ${emp.lastName} is already assigned to Truck ${a.truckNumber} (${a.unitType}, ${a.startTime}) as ${a.role}.`);
      });
    });

    // The vehicle is a fleet record now, so it can be checked the same way the
    // crew is: wrong capability for the unit type, or already out on another
    // shift at the same time. Both warn rather than block — planning ahead of a
    // repair and mid-day truck swaps are real.
    const vehicle = vehicles.find(v => String(v.id) === String(unitForm.vehicleId));
    const overlappingUnits = findVehicleOverlaps({ form: unitForm, units, editingUnitId })
      .map(u => ({ label: `${u.unitType} ${u.startTime}${u.endTime ? `–${u.endTime}` : ""}` }));
    warns.push(...getVehicleWarnings({ vehicle, unitType: unitForm.unitType, overlappingUnits }));

    return warns;
  }, [unitForm, getEmployeeById, getEmployeeAssignmentsInOtherUnits, vehicles, units, editingUnitId]);

  return { errors, warnings };
}
