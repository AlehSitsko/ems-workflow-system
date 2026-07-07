import { useMemo } from "react";
import { getCprWarning } from "../utils/licenseUtils";

// Unit-form validation/warnings for the Dispatch Board's Create/Edit Unit
// drawer — extracted from DispatchBoardPage.jsx (Phase 2b of its hook/
// component split, see docs/ROADMAP.md Priority 1).

export function useUnitFormValidation({ unitForm, getEmployeeById, getEmployeeAssignmentsInOtherUnits }) {
  const errors = useMemo(() => {
    const errs = [];
    if (!unitForm.shiftDate.trim()) errs.push("Shift Date is required.");
    if (!unitForm.truckNumber.trim()) errs.push("Truck Number is required.");
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
    return warns;
  }, [unitForm, getEmployeeById, getEmployeeAssignmentsInOtherUnits]);

  return { errors, warnings };
}
