import React, { useEffect, useMemo, useState } from "react";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/ToastProvider";
import {
  FaAmbulance,
  FaCalendarDay,
  FaExclamationTriangle,
  FaMoon,
  FaPlus,
  FaRedo,
  FaSun,
  FaTimes,
  FaUsers,
} from "react-icons/fa";

import { getEmployees } from "../api/employeesApi";
import PatientOrderSection from "../components/crew/PatientOrderSection";
import UnassignedEmployeesCard from "../components/crew/UnassignedEmployeesCard";
import PlannedUnitsList from "../components/crew/PlannedUnitsList";
import CrewPresetsSection from "../components/crew/CrewPresetsSection";

import {
  createCrewUnit,
  deleteCrewUnit,
  getCrewUnits,
  makeNightCrew,
  updateCrewUnit,
} from "../api/crewApi";

import { createCrewPreset, getCrewPresets } from "../api/crewPresetApi";

import { getEmployeeRoleLabel } from "../utils/employeeRoleUtils";
import { getTodayDate } from "../utils/callUtils";
import EntityDrawer from "../components/ui/EntityDrawer";

const UNIT_TYPES = ["BLS", "ALS", "ASSIST"];

/*
  Default empty crew object.
  Each property stores an employee ID as a string.
*/
const initialCrew = {
  driver: "",
  medical: "",
  assist1: "",
  assist2: "",
};

/*
  Default form state for creating a new unit.
*/
const initialUnitForm = {
  shiftDate: getTodayDate(),
  unitType: "BLS",
  truckNumber: "",
  startTime: "",
  endTime: "",
  endDate: "",
  shiftType: "day",
  crew: { ...initialCrew },
  firstPatient: "",
  nextPatients: [""],
};

function CrewPlannerPage() {
  const confirm = useConfirm();
  const toast = useToast();
  /*
    Employee state.
    Employees are loaded from the backend and used for crew assignment.
  */
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  /*
    Selected planning date.
    Crew units are filtered by this date.
  */
  const [selectedDate, setSelectedDate] = useState(getTodayDate());

  /*
    Crew unit state.
    Units represent planned trucks or crews for the selected shift date.
  */
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  /*
    Crew preset state.
    Presets allow saving and reusing crew combinations.
  */
  const [crewPresets, setCrewPresets] = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");

  /*
    Unit form state.
    This is used for both create mode and edit mode.
  */
  const [unitForm, setUnitForm] = useState({
    ...initialUnitForm,
    shiftDate: selectedDate,
  });

  /*
    Drawer state for create/edit unit form.
  */
  const [showUnitDrawer, setShowUnitDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState("form");

  /*
    Stores the ID of the unit currently being edited.
    Null means the form is in create mode.
  */
  const [editingUnitId, setEditingUnitId] = useState(null);

  /*
    Make Night dialog state.
    null = closed; object = { sourceUnit, hasExisting }
  */
  const [nightDialog, setNightDialog] = useState(null);
  const [nightForm, setNightForm] = useState({ startTime: "", endTime: "", endDate: "" });

  /*
    Loads employees from the backend.
  */
  const loadEmployees = async () => {
    setEmployeesLoading(true);
    

    try {
      const data = await getEmployees();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load employees:", error);
      setEmployees([]);
      toast.error("Load failed", error.message || "Failed to load employees");
    } finally {
      setEmployeesLoading(false);
    }
  };

  /*
    Loads planned crew units for the selected date.
  */
  const loadUnits = async () => {
    setUnitsLoading(true);

    try {
      const data = await getCrewUnits(selectedDate);
      setUnits(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load crew units:", error);
      setUnits([]);
      toast.error("Load failed", error.message);
    } finally {
      setUnitsLoading(false);
    }
  };

  /*
    Loads saved crew presets from the backend.
  */
  const loadCrewPresets = async () => {
    setPresetsLoading(true);

    try {
      const data = await getCrewPresets();
      setCrewPresets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load crew presets:", error);
      setCrewPresets([]);
    } finally {
      setPresetsLoading(false);
    }
  };

  /*
    Initial page load.
  */
  useEffect(() => {
    loadEmployees();
    loadCrewPresets();
  }, []);

  /*
    Reload units whenever the selected date changes.
    Also resets edit mode because the visible unit list changed.
  */
  useEffect(() => {
    loadUnits();

    setUnitForm((prev) => ({
      ...prev,
      shiftDate: selectedDate,
    }));

    setEditingUnitId(null);
    setShowUnitDrawer(false);
  }, [selectedDate]);

  /*
    Normalizes license objects so older or incomplete records do not break UI logic.
  */
  const normalizeLicense = (license) => {
    if (!license) {
      return {
        hasLicense: false,
        licenseName: "",
        expirationDate: "",
      };
    }

    return {
      hasLicense: Boolean(license.hasLicense),
      licenseName: license.licenseName || "",
      expirationDate: license.expirationDate || "",
    };
  };

  /*
    Calculates the current status of a license based on expiration date.
  */
  const getLicenseStatus = (license) => {
    const normalizedLicense = normalizeLicense(license);

    if (!normalizedLicense.hasLicense) {
      return "No License";
    }

    if (!normalizedLicense.expirationDate) {
      return "Active";
    }

    const today = new Date();
    const expirationDate = new Date(
      `${normalizedLicense.expirationDate}T23:59:59`
    );

    const diffInMs = expirationDate - today;
    const diffInDays = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays < 0) {
      return "Expired";
    }

    if (diffInDays <= 30) {
      return "Expiring Soon";
    }

    return "Active";
  };

  /*
    Returns a CPR warning message when CPR is missing, expired, or expiring soon.
  */
  const getCprWarning = (employee) => {
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
  };

  /*
    Returns the medical slot label based on unit type.
  */
  const getMedicalSlotLabel = (unitType) => {
    switch (unitType) {
      case "ALS":
        return "Paramedic";
      case "BLS":
        return "EMT";
      case "ASSIST":
      default:
        return "Medical Slot";
    }
  };

  /*
    Determines whether the medical slot should be shown.
    ASSIST units do not use a medical slot at this stage.
  */
  const isMedicalSlotVisible = (unitType) => {
    return unitType === "ALS" || unitType === "BLS";
  };

  /*
    Marks required roles depending on unit type.
  */
  const isRoleRequired = (unitType, role) => {
    switch (unitType) {
      case "ALS":
      case "BLS":
        return role === "driver" || role === "medical";
      case "ASSIST":
        return role === "driver";
      default:
        return false;
    }
  };

  /*
    Finds a full employee object by employee ID.
  */
  const getEmployeeById = (employeeId) => {
    return employees.find(
      (employee) => String(employee.id) === String(employeeId)
    );
  };

  /*
    Returns a display name for an assigned employee.
  */
  const getEmployeeName = (employeeId) => {
    const employee = getEmployeeById(employeeId);

    if (!employee) {
      return "Not assigned";
    }

    return `${employee.firstName} ${employee.lastName}`;
  };

  /*
    Determines whether an employee can be assigned to a specific role.

    Rules:
    - Employee must be technically active.
    - Employee operational status must be active.
    - Driver requires EVOC.
    - BLS medical slot requires EMT or Paramedic.
    - ALS medical slot requires Paramedic.
    - Assist slots allow any technically and operationally active employee.
  */
  const isEmployeeEligibleForRole = (employee, role, unitType) => {
    if (!employee.isActive) {
      return false;
    }

    if (employee.status !== "active") {
      return false;
    }

    if (role === "driver") {
      const hasEvoc = Boolean(employee.evoc?.hasLicense);
      const isDriverRole = String(employee.role || "").toLowerCase() === "driver";
      return hasEvoc || isDriverRole;
    }

    if (role === "medical") {
      if (unitType === "BLS") {
        return Boolean(
          employee.emt?.hasLicense || employee.paramedic?.hasLicense
        );
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
  };

  /*
    Returns employee IDs already selected in other slots of the current form.
    This prevents selecting the same employee twice in one unit.
  */
  const getSelectedEmployeeIds = (currentRole) => {
    return Object.entries(unitForm.crew)
      .filter(([role, employeeId]) => role !== currentRole && employeeId)
      .map(([, employeeId]) => String(employeeId));
  };

  /*
    Checks whether an employee is already assigned to another unit on the same date.
    This creates warnings instead of hard-blocking the assignment.
  */
  const getEmployeeAssignmentsInOtherUnits = (employeeId) => {
    const normalizedEmployeeId = String(employeeId);
    const assignments = [];

    units.forEach((unit) => {
      if (editingUnitId && String(unit.id) === String(editingUnitId)) {
        return;
      }

      Object.entries(unit.crew || {}).forEach(([role, assignedEmployeeId]) => {
        if (String(assignedEmployeeId) === normalizedEmployeeId) {
          assignments.push({
            unitId: unit.id,
            truckNumber: unit.truckNumber,
            unitType: unit.unitType,
            startTime: unit.startTime,
            role,
          });
        }
      });
    });

    return assignments;
  };

  /*
    Returns employees available for a specific role in the current form.
  */
  const getAvailableEmployeesForRole = (role) => {
    const selectedElsewhereInCurrentUnit = getSelectedEmployeeIds(role);

    return employees.filter((employee) => {
      const employeeId = String(employee.id);

      if (selectedElsewhereInCurrentUnit.includes(employeeId)) {
        return false;
      }

      return isEmployeeEligibleForRole(employee, role, unitForm.unitType);
    });
  };

  /*
    Handles planning date change.
  */
  const handleSelectedDateChange = (event) => {
    setSelectedDate(event.target.value);
  };

  /*
    Handles simple unit form fields.
  */
  const handleUnitFieldChange = (event) => {
    const { name, value } = event.target;

    setUnitForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /*
    Handles crew member selection for a specific crew role.
  */
  const handleCrewChange = (role, employeeId) => {
    setUnitForm((prev) => ({
      ...prev,
      crew: {
        ...prev.crew,
        [role]: employeeId,
      },
    }));
  };

  /*
    Applies a saved crew preset to the current unit form.
  */
  const handleApplyPreset = (presetId) => {
    setSelectedPresetId(presetId);

    if (!presetId) {
      return;
    }

    const preset = crewPresets.find(
      (item) => String(item.id) === String(presetId)
    );

    if (!preset) {
      return;
    }

    setUnitForm((prev) => ({
      ...prev,
      unitType: preset.unitType || prev.unitType,
      crew: {
        driver: preset.crew?.driver || "",
        medical: preset.crew?.medical || "",
        assist1: preset.crew?.assist1 || "",
        assist2: preset.crew?.assist2 || "",
      },
    }));
  };

  /*
    Saves the current crew combination as a reusable preset.
  */
  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      toast.warning("Preset name required", "Enter a name before saving.");
      return;
    }

    if (!unitForm.crew.driver && !unitForm.crew.medical) {
      toast.warning("No crew selected", "Select at least one crew member before saving a preset.");
      return;
    }

    try {
      await createCrewPreset({
        presetName: presetName.trim(),
        unitType: unitForm.unitType,
        crew: { ...unitForm.crew },
        notes: "",
      });

      setPresetName("");
      toast.success("Preset saved", "Crew preset created successfully.");

      await loadCrewPresets();
    } catch (error) {
      console.error("Failed to create crew preset:", error);
      toast.error("Preset failed", error.message);
    }
  };

  /*
    Handles first patient field change.
  */
  const handleFirstPatientChange = (event) => {
    setUnitForm((prev) => ({
      ...prev,
      firstPatient: event.target.value,
    }));
  };

  /*
    Handles one next-patient field by index.
  */
  const handleNextPatientChange = (index, value) => {
    setUnitForm((prev) => {
      const updatedPatients = [...prev.nextPatients];
      updatedPatients[index] = value;

      return {
        ...prev,
        nextPatients: updatedPatients,
      };
    });
  };

  /*
    Adds another optional next-patient input.
  */
  const handleAddNextPatientField = () => {
    setUnitForm((prev) => ({
      ...prev,
      nextPatients: [...prev.nextPatients, ""],
    }));
  };

  /*
    Removes a next-patient input.
    At least one empty field is kept for easier data entry.
  */
  const handleRemoveNextPatientField = (index) => {
    setUnitForm((prev) => {
      if (prev.nextPatients.length === 1) {
        return {
          ...prev,
          nextPatients: [""],
        };
      }

      return {
        ...prev,
        nextPatients: prev.nextPatients.filter(
          (_, patientIndex) => patientIndex !== index
        ),
      };
    });
  };

  /*
    Resets the unit form, leaves edit mode, and closes the drawer.
  */
  const resetUnitForm = () => {
    setUnitForm({
      ...initialUnitForm,
      shiftDate: selectedDate,
    });

    setEditingUnitId(null);
    setSelectedPresetId("");
    setPresetName("");
    setShowUnitDrawer(false);
  };

  /*
    Returns true if the user has entered any data into the unit form.
  */
  const isUnitFormDirty = () => {
    if (unitForm.truckNumber.trim()) return true;
    if (unitForm.startTime.trim()) return true;
    if (unitForm.firstPatient.trim()) return true;
    if (unitForm.crew.driver) return true;
    if (unitForm.crew.medical) return true;
    if (unitForm.crew.assist1) return true;
    if (unitForm.crew.assist2) return true;
    if (unitForm.nextPatients.some((p) => p.trim())) return true;
    return false;
  };

  /*
    Closes the drawer with a confirmation prompt if the form has unsaved data.
  */
  const handleCloseDrawer = async () => {
    if (isUnitFormDirty()) {
      const confirmed = await confirm({
        title: "Discard unsaved changes?",
        message: "You have unsaved changes. Close without saving?",
        variant: "warning",
        confirmLabel: "Discard",
      });
      if (!confirmed) return;
    }
    resetUnitForm();
  };

  /*
    Opens the drawer in create mode.
  */
  const handleShowCreateUnit = () => {
    setUnitForm({
      ...initialUnitForm,
      shiftDate: selectedDate,
    });

    setEditingUnitId(null);
    setSelectedPresetId("");
    setPresetName("");
    setShowUnitDrawer(true);
    setDrawerTab("form");
  };

  /*
    Loads an existing unit into the drawer for editing.
  */
  const handleEditUnit = (unit) => {
    setEditingUnitId(unit.id);

    setUnitForm({
      shiftDate: unit.shiftDate || selectedDate,
      unitType: unit.unitType || "BLS",
      truckNumber: unit.truckNumber || "",
      startTime: unit.startTime || "",
      endTime: unit.endTime || "",
      endDate: unit.endDate || "",
      shiftType: unit.shiftType || "day",
      crew: {
        driver: unit.crew?.driver || "",
        medical: unit.crew?.medical || "",
        assist1: unit.crew?.assist1 || "",
        assist2: unit.crew?.assist2 || "",
      },
      firstPatient: unit.firstPatient || "",
      nextPatients:
        unit.nextPatients && unit.nextPatients.length > 0
          ? [...unit.nextPatients]
          : [""],
    });

    setSelectedPresetId("");
    setShowUnitDrawer(true);
    setDrawerTab("form");
  };

  /*
    Clears the medical slot when unit type does not support it.
  */
  useEffect(() => {
    if (!isMedicalSlotVisible(unitForm.unitType)) {
      setUnitForm((prev) => ({
        ...prev,
        crew: {
          ...prev.crew,
          medical: "",
        },
      }));
    }
  }, [unitForm.unitType]);

  /*
    Builds hard validation errors for the unit form.
    These errors block saving.
  */
  const unitValidationErrors = useMemo(() => {
    const errors = [];

    if (!unitForm.shiftDate.trim()) {
      errors.push("Shift Date is required.");
    }

    if (!unitForm.truckNumber.trim()) {
      errors.push("Truck Number is required.");
    }

    if (!unitForm.startTime.trim()) {
      errors.push("Start Time is required.");
    }

    if (!unitForm.firstPatient.trim()) {
      errors.push("First Patient is required.");
    }

    if (!unitForm.crew.driver) {
      errors.push("Driver is required.");
    }

    if (unitForm.unitType === "BLS" && !unitForm.crew.medical) {
      errors.push("BLS unit requires an EMT or Paramedic.");
    }

    if (unitForm.unitType === "ALS" && !unitForm.crew.medical) {
      errors.push("ALS unit requires a Paramedic.");
    }

    return errors;
  }, [unitForm]);

  /*
    Builds warning messages for non-blocking crew issues.
    Warnings do not prevent saving.
  */
  const unitWarningMessages = useMemo(() => {
    const warnings = [];

    const selectedCrewMembers = Object.values(unitForm.crew)
      .filter(Boolean)
      .map((employeeId) => getEmployeeById(employeeId))
      .filter(Boolean);

    selectedCrewMembers.forEach((employee) => {
      const cprWarning = getCprWarning(employee);

      if (cprWarning) {
        warnings.push(
          `${employee.firstName} ${employee.lastName}: ${cprWarning}.`
        );
      }

      const existingAssignments = getEmployeeAssignmentsInOtherUnits(
        employee.id
      );

      existingAssignments.forEach((assignment) => {
        warnings.push(
          `${employee.firstName} ${employee.lastName} is already assigned to Truck ${assignment.truckNumber} (${assignment.unitType}, ${assignment.startTime}) as ${assignment.role}.`
        );
      });
    });

    return warnings;
  }, [unitForm, employees, units, editingUnitId]);

  /*
    Collects employee IDs already assigned to existing units on the selected date.
  */
  const assignedEmployeeIds = useMemo(() => {
    const ids = [];

    units.forEach((unit) => {
      if (editingUnitId && String(unit.id) === String(editingUnitId)) {
        return;
      }

      Object.values(unit.crew || {}).forEach((employeeId) => {
        if (employeeId) {
          ids.push(String(employeeId));
        }
      });
    });

    return ids;
  }, [units, editingUnitId]);

  /*
    Shows active and operationally available employees who are not assigned yet.
  */
  const unassignedEmployees = useMemo(() => {
    return employees.filter((employee) => {
      if (!employee.isActive) {
        return false;
      }

      if (employee.status !== "active") {
        return false;
      }

      return !assignedEmployeeIds.includes(String(employee.id));
    });
  }, [employees, assignedEmployeeIds]);

  /*
    Builds the payload expected by the backend for create/update requests.
  */
  const buildUnitPayload = () => {
    const cleanedNextPatients = unitForm.nextPatients
      .map((patient) => patient.trim())
      .filter(Boolean);

    const existingUnit = editingUnitId
      ? units.find((unit) => String(unit.id) === String(editingUnitId))
      : null;

    return {
      shiftDate: unitForm.shiftDate,
      unitType: unitForm.unitType,
      truckNumber: unitForm.truckNumber.trim(),
      startTime: unitForm.startTime,
      endTime: unitForm.endTime || null,
      endDate: unitForm.endDate || null,
      shiftType: unitForm.shiftType || "day",
      crew: { ...unitForm.crew },
      firstPatient: unitForm.firstPatient.trim(),
      nextPatients: cleanedNextPatients,
      notes: "",
      createdAt: existingUnit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  /*
    Saves a new unit or updates an existing one.
  */
  const handleSaveUnit = async (event) => {
    event.preventDefault();

    if (unitValidationErrors.length > 0) {
      return;
    }

    setUnitsLoading(true);

    try {
      const unitPayload = buildUnitPayload();

      if (editingUnitId) {
        await updateCrewUnit(editingUnitId, unitPayload);
        toast.success("Unit updated");
      } else {
        await createCrewUnit(unitPayload);
        toast.success("Unit created");
      }

      resetUnitForm();
      await loadUnits();
    } catch (error) {
      console.error("Failed to save crew unit:", error);
      toast.error("Save failed", error.message);
    } finally {
      setUnitsLoading(false);
    }
  };

  /*
    Opens the Make Night dialog for a day unit.
  */
  const handleMakeNight = (unit) => {
    const hasExisting = units.some((u) => u.shiftType === "night");
    // Pre-fill next day as default end date for night shift
    const nextDay = new Date(selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    setNightForm({
      startTime: unit.startTime || "",
      endTime: "",
      endDate: nextDay.toISOString().slice(0, 10),
    });
    setNightDialog({ sourceUnit: unit, hasExisting });
  };

  /*
    Submits the Make Night request (replace or keep existing).
  */
  const handleConfirmNight = async (replace) => {
    if (!nightDialog) return;
    setUnitsLoading(true);
    try {
      await makeNightCrew(nightDialog.sourceUnit.id, {
        replace,
        startTime: nightForm.startTime,
        endTime: nightForm.endTime || null,
        endDate: nightForm.endDate || null,
      });
      setNightDialog(null);
      toast.success("Night crew created");
      await loadUnits();
    } catch (err) {
      toast.error("Night crew failed", err.message);
    } finally {
      setUnitsLoading(false);
    }
  };

  /*
    Opens the drawer pre-set to Night shift type.
  */
  const handleShowCreateNightUnit = () => {
    const nextDay = new Date(selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    setUnitForm({
      ...initialUnitForm,
      shiftDate: selectedDate,
      shiftType: "night",
      endDate: nextDay.toISOString().slice(0, 10),
    });
    setEditingUnitId(null);
    setSelectedPresetId("");
    setPresetName("");
    setShowUnitDrawer(true);
    setDrawerTab("form");
  };

  /*
    Deletes a planned unit.
  */
  const handleDeleteUnit = async (unitId) => {
    const confirmed = await confirm({
      title: "Delete planned unit?",
      message: "This will remove the unit and its crew assignment.",
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;

    const isCurrentlyEditing = String(editingUnitId) === String(unitId);

    setUnitsLoading(true);

    try {
      await deleteCrewUnit(unitId);

      if (isCurrentlyEditing) {
        resetUnitForm();
      }

      toast.success("Unit deleted");
      await loadUnits();
    } catch (error) {
      console.error("Failed to delete crew unit:", error);
      toast.error("Delete failed", error.message);
    } finally {
      setUnitsLoading(false);
    }
  };

  /*
    Renders one crew selection dropdown.
    Native select cannot render colored badges inside options, so the role is included in text.
  */
  const renderCrewSelect = (role, label) => {
    const availableEmployees = getAvailableEmployeesForRole(role);
    const selectedEmployeeId = unitForm.crew[role];

    return (
      <div className="col-md-6">
        <label className="form-label fw-semibold">
          {label}

          {isRoleRequired(unitForm.unitType, role) && (
            <span className="badge text-bg-danger ms-2">Required</span>
          )}
        </label>

        <select
          className="form-select"
          value={selectedEmployeeId}
          onChange={(event) => handleCrewChange(role, event.target.value)}
          disabled={unitsLoading}
        >
          <option value="">Select employee...</option>

          {availableEmployees.map((employee) => {
            const existingAssignments = getEmployeeAssignmentsInOtherUnits(
              employee.id
            );

            const isAlreadyAssigned = existingAssignments.length > 0;

            return (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} {employee.lastName} â€”{" "}
                {getEmployeeRoleLabel(employee.role)}
                {isAlreadyAssigned ? " [ALREADY ASSIGNED]" : ""}
              </option>
            );
          })}
        </select>
      </div>
    );
  };

  return (
    <div className="page-stack">
      <section className="content-panel">
        <div className="content-panel-header">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <div>
              <h4 className="mb-0">Shift Planning</h4>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {[
                  { label: "Planned Units", value: units.length, color: "#0d6efd" },
                  { label: "Unassigned", value: unassignedEmployees.length, color: unassignedEmployees.length > 0 ? "#f59e0b" : "#6c757d" },
                  { label: "Warnings", value: unitWarningMessages.length, color: unitWarningMessages.length > 0 ? "#dc3545" : "#6c757d" },
                ].map(s => (
                  <span key={s.label} style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
                    background: `${s.color}14`, color: s.color, border: `1px solid ${s.color}30`,
                  }}>
                    {s.label}: {s.value}
                  </span>
                ))}
              </div>
            </div>
            <div className="input-group" style={{ width: 200 }}>
              <span className="input-group-text"><FaCalendarDay /></span>
              <input
                id="selectedDate"
                type="date"
                className="form-control"
                value={selectedDate}
                onChange={handleSelectedDateChange}
                disabled={unitsLoading}
              />
            </div>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
              onClick={handleShowCreateUnit}
              disabled={unitsLoading || employeesLoading}
            >
              <FaSun style={{ fontSize: 11 }} /><FaPlus style={{ fontSize: 10 }} /> Day Unit
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
              onClick={handleShowCreateNightUnit}
              disabled={unitsLoading || employeesLoading}
              style={{ color: "#6ea8fe", borderColor: "#6ea8fe" }}
            >
              <FaMoon style={{ fontSize: 11 }} /><FaPlus style={{ fontSize: 10 }} /> Night Unit
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
              onClick={loadUnits}
              disabled={unitsLoading}
            >
              <FaRedo /> Refresh
            </button>
          </div>
        </div>
      </section>

      <PlannedUnitsList
        selectedDate={selectedDate}
        units={units}
        unitsLoading={unitsLoading}
        onEditUnit={handleEditUnit}
        onDeleteUnit={handleDeleteUnit}
        onMakeNight={handleMakeNight}
        getEmployeeName={getEmployeeName}
        getEmployeeById={getEmployeeById}
        isMedicalSlotVisible={isMedicalSlotVisible}
        getMedicalSlotLabel={getMedicalSlotLabel}
      />

      {/* Make Night Dialog */}
      {nightDialog && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1060,
          background: "var(--ems-overlay-bg, rgba(15,23,42,0.5))",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "var(--ems-bg-surface)", border: "1px solid var(--ems-border)",
            borderRadius: 16, padding: "1.75rem", width: "100%", maxWidth: 440,
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)", color: "var(--ems-text-primary)",
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <FaMoon style={{ color: "#6ea8fe" }} /> Make Night Crew
            </div>
            <p style={{ color: "var(--ems-text-muted)", fontSize: 14, marginBottom: 16 }}>
              Copying crew from Truck <strong>{nightDialog.sourceUnit.truckNumber}</strong> to a night shift.
              {nightDialog.hasExisting && (
                <span style={{ color: "var(--bs-warning)" }}> A night crew already exists for this date.</span>
              )}
            </p>
            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label" style={{ fontSize: 12 }}>Night Start Time</label>
                <input type="time" className="form-control form-control-sm" value={nightForm.startTime}
                  onChange={e => setNightForm(f => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="col-6">
                <label className="form-label" style={{ fontSize: 12 }}>End Time</label>
                <input type="time" className="form-control form-control-sm" value={nightForm.endTime}
                  onChange={e => setNightForm(f => ({ ...f, endTime: e.target.value }))} />
              </div>
              <div className="col-12">
                <label className="form-label" style={{ fontSize: 12 }}>End Date (next day)</label>
                <input type="date" className="form-control form-control-sm" value={nightForm.endDate}
                  onChange={e => setNightForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            {nightDialog.hasExisting ? (
              <div className="d-flex gap-2 flex-wrap">
                <button className="btn btn-sm btn-danger flex-fill" onClick={() => handleConfirmNight(true)}>Replace existing night crew</button>
                <button className="btn btn-sm btn-outline-primary flex-fill" onClick={() => handleConfirmNight(false)}>Keep both</button>
                <button className="btn btn-sm btn-outline-secondary w-100 mt-1" onClick={() => setNightDialog(null)}>Cancel</button>
              </div>
            ) : (
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-primary flex-fill" onClick={() => handleConfirmNight(false)}>Create Night Crew</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setNightDialog(null)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      <EntityDrawer
        open={showUnitDrawer}
        onClose={handleCloseDrawer}
        title={editingUnitId ? "Edit Unit" : "Create Unit"}
        subtitle="Truck info, crew members, presets, and patient order"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={handleCloseDrawer}
              disabled={unitsLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="crew-drawer-form"
              className="btn btn-primary d-inline-flex align-items-center gap-2"
              disabled={unitsLoading || employeesLoading}
            >
              <FaPlus />
              {unitsLoading ? "Saving..." : editingUnitId ? "Update Unit" : "Create Unit"}
            </button>
          </>
        }
      >
        <form id="crew-drawer-form" onSubmit={handleSaveUnit}>
            <div>
                {employeesLoading ? (
                  <div className="empty-state">
                    <FaUsers />
                    <h5>Loading employees</h5>
                    <p>Please wait while employee records are loaded.</p>
                  </div>
                ) : employees.length === 0 ? (
                  <div className="empty-state">
                    <FaUsers />
                    <h5>No employees found</h5>
                    <p>Add employees on the Employees page first.</p>
                  </div>
                ) : (
                  <>
                    {unitValidationErrors.length > 0 && (
                      <div className="alert alert-danger">
                        <h5 className="mb-2">Unit Validation Errors</h5>

                        <ul className="mb-0">
                          {unitValidationErrors.map((message, index) => (
                            <li key={`unit-error-${index}`}>{message}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {unitWarningMessages.length > 0 && (
                      <div className="alert alert-warning">
                        <h5 className="mb-2">Unit Warnings</h5>

                        <ul className="mb-0">
                          {unitWarningMessages.map((message, index) => (
                            <li key={`unit-warning-${index}`}>{message}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="crew-form-section">
                      <div className="crew-form-section-header">
                        <span className="crew-form-section-icon">
                          <FaAmbulance />
                        </span>

                        <h5>Unit Information</h5>
                      </div>

                      <div className="row g-3">
                        <div className="col-md-6">
                          <label
                            htmlFor="shiftDate"
                            className="form-label fw-semibold"
                          >
                            Shift Date
                          </label>

                          <input
                            id="shiftDate"
                            name="shiftDate"
                            type="date"
                            className="form-control"
                            value={unitForm.shiftDate}
                            onChange={handleUnitFieldChange}
                            disabled={unitsLoading}
                          />
                        </div>

                        <div className="col-md-6">
                          <label
                            htmlFor="unitType"
                            className="form-label fw-semibold"
                          >
                            Unit Type
                          </label>

                          <select
                            id="unitType"
                            name="unitType"
                            className="form-select"
                            value={unitForm.unitType}
                            onChange={handleUnitFieldChange}
                            disabled={unitsLoading}
                          >
                            {UNIT_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-md-6">
                          <label
                            htmlFor="truckNumber"
                            className="form-label fw-semibold"
                          >
                            Truck Number
                          </label>

                          <input
                            id="truckNumber"
                            name="truckNumber"
                            type="text"
                            className="form-control"
                            value={unitForm.truckNumber}
                            onChange={handleUnitFieldChange}
                            disabled={unitsLoading}
                          />
                        </div>

                        <div className="col-md-6">
                          <label htmlFor="startTime" className="form-label fw-semibold">Start Time</label>
                          <input
                            id="startTime" name="startTime" type="time"
                            className="form-control" value={unitForm.startTime}
                            onChange={handleUnitFieldChange} disabled={unitsLoading}
                          />
                        </div>

                        <div className="col-md-6">
                          <label htmlFor="endTime" className="form-label fw-semibold">End Time <span className="text-muted fw-normal">(optional)</span></label>
                          <input
                            id="endTime" name="endTime" type="time"
                            className="form-control" value={unitForm.endTime}
                            onChange={handleUnitFieldChange} disabled={unitsLoading}
                          />
                        </div>

                        <div className="col-md-6">
                          <label htmlFor="endDate" className="form-label fw-semibold">End Date <span className="text-muted fw-normal">(if next day)</span></label>
                          <input
                            id="endDate" name="endDate" type="date"
                            className="form-control" value={unitForm.endDate}
                            onChange={handleUnitFieldChange} disabled={unitsLoading}
                          />
                        </div>

                        <div className="col-md-6">
                          <label className="form-label fw-semibold">Shift Type</label>
                          <div className="d-flex gap-2">
                            {["day", "night"].map((t) => (
                              <button
                                key={t} type="button"
                                className={`btn btn-sm flex-fill ${unitForm.shiftType === t ? (t === "night" ? "btn-secondary" : "btn-warning") : "btn-outline-secondary"}`}
                                style={unitForm.shiftType === t && t === "night" ? { background: "#1a2a4a", color: "#6ea8fe", borderColor: "#6ea8fe" } : undefined}
                                onClick={() => setUnitForm((p) => ({ ...p, shiftType: t }))}
                                disabled={unitsLoading}
                              >
                                {t === "day" ? <><FaSun style={{ marginRight: 4 }} />Day</> : <><FaMoon style={{ marginRight: 4 }} />Night</>}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="crew-form-section">
                      <div className="crew-form-section-header">
                        <span className="crew-form-section-icon">
                          <FaUsers />
                        </span>
                        <h5>Crew Assignment</h5>
                      </div>

                      {/* Available staff reference */}
                      {unassignedEmployees.length > 0 && (
                        <div style={{
                          background: "var(--ems-bg-surface-2)",
                          border: "1px solid var(--ems-border)",
                          borderRadius: 10,
                          padding: "10px 14px",
                          marginBottom: 12,
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ems-text-muted)", marginBottom: 8 }}>
                            Available Staff ({unassignedEmployees.length})
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {unassignedEmployees.map((emp) => {
                              const cprWarn = getCprWarning(emp);
                              return (
                                <span key={emp.id} style={{
                                  display: "inline-flex", alignItems: "center", gap: 5,
                                  fontSize: 12, padding: "3px 10px", borderRadius: 20,
                                  background: cprWarn ? "rgba(220,53,69,0.08)" : "var(--ems-section-bg)",
                                  border: `1px solid ${cprWarn ? "rgba(220,53,69,0.3)" : "var(--ems-section-border)"}`,
                                  color: "var(--ems-text-primary)",
                                }}>
                                  {emp.firstName} {emp.lastName}
                                  <span style={{ fontSize: 10, color: "var(--ems-text-muted)" }}>
                                    {getEmployeeRoleLabel(emp.role)}
                                  </span>
                                  {cprWarn && <span style={{ fontSize: 10, color: "#f87171" }}>⚠</span>}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="row g-3">
                        <CrewPresetsSection
                          crewPresets={crewPresets}
                          selectedPresetId={selectedPresetId}
                          presetName={presetName}
                          presetsLoading={presetsLoading}
                          unitsLoading={unitsLoading}
                          onApplyPreset={handleApplyPreset}
                          onPresetNameChange={setPresetName}
                          onSavePreset={handleSavePreset}
                        />

                        {renderCrewSelect("driver", "Driver")}

                        {isMedicalSlotVisible(unitForm.unitType) &&
                          renderCrewSelect(
                            "medical",
                            getMedicalSlotLabel(unitForm.unitType)
                          )}

                        {renderCrewSelect("assist1", "Assist 1")}
                        {renderCrewSelect("assist2", "Assist 2")}
                      </div>
                    </div>

                    <div className="crew-form-section">
                      <PatientOrderSection
                        firstPatient={unitForm.firstPatient}
                        nextPatients={unitForm.nextPatients}
                        onFirstPatientChange={handleFirstPatientChange}
                        onNextPatientChange={handleNextPatientChange}
                        onAddNextPatientField={handleAddNextPatientField}
                        onRemoveNextPatientField={handleRemoveNextPatientField}
                        disabled={unitsLoading}
                      />
                    </div>
                  </>
                )}
            </div>
          </form>
      </EntityDrawer>
    </div>
  );
}

export default CrewPlannerPage;


