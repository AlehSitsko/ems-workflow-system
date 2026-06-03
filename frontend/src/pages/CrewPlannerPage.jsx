import React, { useEffect, useMemo, useState } from "react";

import { getEmployees } from "../api/employeesApi";
import PatientOrderSection from "../components/crew/PatientOrderSection";

import {
  createCrewUnit,
  deleteCrewUnit,
  getCrewUnits,
  updateCrewUnit,
} from "../api/crewApi";

import {
  createCrewPreset,
  getCrewPresets,
} from "../api/crewPresetApi";

/*
  Available unit types for the planner.
  These values are used by validation and crew slot visibility rules.
*/
const UNIT_TYPES = ["BLS", "ALS", "ASSIST"];

/*
  Returns today's date in YYYY-MM-DD format for date inputs.
*/
const getTodayDate = () => new Date().toISOString().split("T")[0];

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
  crew: { ...initialCrew },
  firstPatient: "",
  nextPatients: [""],
};

function CrewPlannerPage() {
  /*
    Employee state.
    Employees are loaded from the backend and used for crew assignment.
  */
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState("");

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
  const [unitsError, setUnitsError] = useState("");
  const [unitsMessage, setUnitsMessage] = useState("");

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
    Stores the ID of the unit currently being edited.
    Null means the form is in create mode.
  */
  const [editingUnitId, setEditingUnitId] = useState(null);

  /*
    Loads employees from the backend.
  */
  const loadEmployees = async () => {
    setEmployeesLoading(true);
    setEmployeesError("");

    try {
      const data = await getEmployees();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load employees:", error);
      setEmployees([]);
      setEmployeesError(
        error.message || "Failed to load employees from backend."
      );
    } finally {
      setEmployeesLoading(false);
    }
  };

  /*
    Loads planned crew units for the selected date.
  */
  const loadUnits = async () => {
    setUnitsLoading(true);
    setUnitsError("");

    try {
      const data = await getCrewUnits(selectedDate);
      setUnits(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load crew units:", error);
      setUnits([]);
      setUnitsError(error.message || "Failed to load crew units.");
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
    - BLS medical slot requires EMT.
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
      return Boolean(employee.evoc?.hasLicense);
    }

    if (role === "medical") {
      if (unitType === "BLS") {
        return Boolean(employee.emt?.hasLicense);
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
    setUnitsMessage("");
    setUnitsError("");
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
      alert("Preset Name is required.");
      return;
    }

    if (!unitForm.crew.driver && !unitForm.crew.medical) {
      alert("Select at least one crew member before saving a preset.");
      return;
    }

    setUnitsError("");
    setUnitsMessage("");

    try {
      await createCrewPreset({
        presetName: presetName.trim(),
        unitType: unitForm.unitType,
        crew: { ...unitForm.crew },
        notes: "",
      });

      setPresetName("");
      setUnitsMessage("Crew preset created successfully.");

      await loadCrewPresets();
    } catch (error) {
      console.error("Failed to create crew preset:", error);
      setUnitsError(error.message || "Failed to create crew preset.");
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
    Resets the unit form and leaves edit mode.
  */
  const resetUnitForm = () => {
    setUnitForm({
      ...initialUnitForm,
      shiftDate: selectedDate,
    });

    setEditingUnitId(null);
    setSelectedPresetId("");
  };

  /*
    Loads an existing unit into the form for editing.
  */
  const handleEditUnit = (unit) => {
    setEditingUnitId(unit.id);

    setUnitForm({
      shiftDate: unit.shiftDate || selectedDate,
      unitType: unit.unitType || "BLS",
      truckNumber: unit.truckNumber || "",
      startTime: unit.startTime || "",
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
    setUnitsMessage("");
    setUnitsError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
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
      errors.push("BLS unit requires an EMT.");
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
    setUnitsError("");
    setUnitsMessage("");

    try {
      const unitPayload = buildUnitPayload();

      if (editingUnitId) {
        await updateCrewUnit(editingUnitId, unitPayload);
        setUnitsMessage("Crew unit updated successfully.");
      } else {
        await createCrewUnit(unitPayload);
        setUnitsMessage("Crew unit created successfully.");
      }

      resetUnitForm();
      await loadUnits();
    } catch (error) {
      console.error("Failed to save crew unit:", error);
      setUnitsError(error.message || "Failed to save crew unit.");
    } finally {
      setUnitsLoading(false);
    }
  };

  /*
    Deletes a planned unit.
  */
  const handleDeleteUnit = async (unitId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this planned unit?"
    );

    if (!confirmed) {
      return;
    }

    const isCurrentlyEditing = String(editingUnitId) === String(unitId);

    setUnitsLoading(true);
    setUnitsError("");
    setUnitsMessage("");

    try {
      await deleteCrewUnit(unitId);

      if (isCurrentlyEditing) {
        resetUnitForm();
      }

      setUnitsMessage("Crew unit deleted successfully.");
      await loadUnits();
    } catch (error) {
      console.error("Failed to delete crew unit:", error);
      setUnitsError(error.message || "Failed to delete crew unit.");
    } finally {
      setUnitsLoading(false);
    }
  };

  /*
    Renders one crew selection dropdown.
  */
  const renderCrewSelect = (role, label) => {
    const availableEmployees = getAvailableEmployeesForRole(role);
    const selectedEmployeeId = unitForm.crew[role];

    return (
      <div className="col-md-6 col-xl-3">
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
                {employee.firstName} {employee.lastName}
                {isAlreadyAssigned ? " [ALREADY ASSIGNED]" : ""}
              </option>
            );
          })}
        </select>
      </div>
    );
  };

  return (
    <div className="container mt-4">
      {/* Page header. */}
      <div className="mb-4">
        <h1 className="mb-2">Unit Planner</h1>

        <p className="text-muted mb-0">
          Create and manage EMS units by shift date with crew assignment and
          patient order.
        </p>
      </div>

      {/* Employee loading error. */}
      {employeesError && (
        <div className="alert alert-danger">{employeesError}</div>
      )}

      {/* Unit loading or saving error. */}
      {unitsError && <div className="alert alert-danger">{unitsError}</div>}

      {/* Successful unit operation message. */}
      {unitsMessage && (
        <div className="alert alert-success">{unitsMessage}</div>
      )}

      {/* Current module status message. */}
      <div className="alert alert-info">
        <h5 className="mb-2">Current Stage</h5>

        <p className="mb-0">
          Crew Planner stores planned units by shift date and supports reusable
          crew presets.
        </p>
      </div>

      {/* Shift date selector. */}
      <div className="card shadow-sm mb-4">
        <div className="card-header">
          <h5 className="mb-0">Shift Date</h5>
        </div>

        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label htmlFor="selectedDate" className="form-label fw-semibold">
                Planning Date
              </label>

              <input
                id="selectedDate"
                type="date"
                className="form-control"
                value={selectedDate}
                onChange={handleSelectedDateChange}
                disabled={unitsLoading}
              />
            </div>

            <div className="col-md-8">
              <p className="text-muted mb-0">
                Use this date to review current, previous, or future crew
                assignments.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Unassigned employees summary. */}
      <div className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Unassigned Employees</h5>

          <span className="badge text-bg-secondary">
            {unassignedEmployees.length}
          </span>
        </div>

        <div className="card-body py-3">
          {employeesLoading ? (
            <p className="text-muted mb-0">Loading employees...</p>
          ) : unassignedEmployees.length === 0 ? (
            <p className="text-muted mb-0">No unassigned active employees.</p>
          ) : (
            <div className="d-flex flex-wrap gap-2">
              {unassignedEmployees.map((employee) => {
                const cprWarning = getCprWarning(employee);

                return (
                  <span
                    key={employee.id}
                    className={`badge ${
                      cprWarning
                        ? cprWarning === "CPR Expiring Soon"
                          ? "text-bg-warning"
                          : "text-bg-danger"
                        : "text-bg-light border text-dark"
                    }`}
                  >
                    {employee.firstName} {employee.lastName}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Hard validation errors that block saving. */}
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

      {/* Non-blocking warning messages. */}
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

      {/* Create/edit unit form. */}
      <div className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            {editingUnitId ? "Edit Unit" : "Create New Unit"}
          </h5>

          {editingUnitId && (
            <span className="badge text-bg-info">Editing Mode</span>
          )}
        </div>

        <div className="card-body">
          {employeesLoading ? (
            <p className="text-muted mb-0">Loading employees...</p>
          ) : employees.length === 0 ? (
            <p className="text-muted mb-0">
              No employees found. Add employees on the Employees page first.
            </p>
          ) : (
            <form onSubmit={handleSaveUnit}>
              <div className="row g-3">
                {/* Basic unit information. */}
                <div className="col-md-3">
                  <label htmlFor="shiftDate" className="form-label fw-semibold">
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

                <div className="col-md-3">
                  <label htmlFor="unitType" className="form-label fw-semibold">
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

                <div className="col-md-3">
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

                <div className="col-md-3">
                  <label htmlFor="startTime" className="form-label fw-semibold">
                    Start Time
                  </label>

                  <input
                    id="startTime"
                    name="startTime"
                    type="time"
                    className="form-control"
                    value={unitForm.startTime}
                    onChange={handleUnitFieldChange}
                    disabled={unitsLoading}
                  />
                </div>

                {/* Crew assignment section. */}
                <div className="col-12">
                  <hr />
                  <h5 className="mb-0">Crew Assignment</h5>
                </div>

                {/* Crew presets block. */}
                <div className="col-12">
                  <div className="card bg-light border-0">
                    <div className="card-body">
                      <h6 className="mb-3">Crew Presets</h6>

                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label fw-semibold">
                            Apply Existing Preset
                          </label>

                          <select
                            className="form-select"
                            value={selectedPresetId}
                            onChange={(event) =>
                              handleApplyPreset(event.target.value)
                            }
                            disabled={presetsLoading || unitsLoading}
                          >
                            <option value="">Select preset...</option>

                            {crewPresets.map((preset) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.presetName}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-md-6">
                          <label className="form-label fw-semibold">
                            Save Current Crew as Preset
                          </label>

                          <div className="d-flex gap-2">
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Preset name..."
                              value={presetName}
                              onChange={(event) =>
                                setPresetName(event.target.value)
                              }
                              disabled={presetsLoading || unitsLoading}
                            />

                            <button
                              type="button"
                              className="btn btn-outline-success"
                              onClick={handleSavePreset}
                              disabled={presetsLoading || unitsLoading}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Role-based crew selectors. */}
                {renderCrewSelect("driver", "Driver")}

                {isMedicalSlotVisible(unitForm.unitType) &&
                  renderCrewSelect(
                    "medical",
                    getMedicalSlotLabel(unitForm.unitType)
                  )}

                {renderCrewSelect("assist1", "Assist 1")}

                {renderCrewSelect("assist2", "Assist 2")}

                {/* Patient order section. */}
                <PatientOrderSection
                  firstPatient={unitForm.firstPatient}
                  nextPatients={unitForm.nextPatients}
                  onFirstPatientChange={handleFirstPatientChange}
                  onNextPatientChange={handleNextPatientChange}
                  onAddNextPatientField={handleAddNextPatientField}
                  onRemoveNextPatientField={handleRemoveNextPatientField}
                  disabled={unitsLoading}
                />

                {/* Form actions. */}
                <div className="col-12 d-flex gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={unitsLoading}
                  >
                    {editingUnitId ? "Update Unit" : "Create Unit"}
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={resetUnitForm}
                    disabled={unitsLoading}
                  >
                    {editingUnitId ? "Cancel Edit" : "Clear Form"}
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-info"
                    onClick={loadUnits}
                    disabled={unitsLoading}
                  >
                    Refresh Units
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Planned units list. */}
      <div className="card shadow-sm">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Planned Units for {selectedDate}</h5>

          <span className="badge text-bg-secondary">{units.length}</span>
        </div>

        <div className="card-body">
          {unitsLoading && units.length === 0 ? (
            <p className="text-muted mb-0">Loading planned units...</p>
          ) : units.length === 0 ? (
            <p className="text-muted mb-0">No units created for this date.</p>
          ) : (
            <div className="row g-3">
              {units.map((unit) => (
                <div key={unit.id} className="col-12">
                  <div className="card border-light-subtle">
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-start mb-3">
                        <div>
                          <h5 className="mb-1">
                            {unit.startTime} — Truck {unit.truckNumber}
                          </h5>

                          <div className="d-flex flex-wrap gap-2">
                            <span className="badge text-bg-primary">
                              {unit.unitType}
                            </span>

                            <span className="badge text-bg-secondary">
                              Date: {unit.shiftDate}
                            </span>

                            <span className="badge text-bg-dark">
                              First: {unit.firstPatient}
                            </span>
                          </div>
                        </div>

                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleEditUnit(unit)}
                            disabled={unitsLoading}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDeleteUnit(unit.id)}
                            disabled={unitsLoading}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Saved crew summary. */}
                      <div className="mb-3">
                        <div className="fw-semibold mb-2">Crew</div>

                        <div className="row g-2">
                          <div className="col-md-3">
                            <div className="border rounded p-2">
                              <strong>Driver:</strong>{" "}
                              {getEmployeeName(unit.crew.driver)}
                            </div>
                          </div>

                          {isMedicalSlotVisible(unit.unitType) && (
                            <div className="col-md-3">
                              <div className="border rounded p-2">
                                <strong>
                                  {getMedicalSlotLabel(unit.unitType)}:
                                </strong>{" "}
                                {getEmployeeName(unit.crew.medical)}
                              </div>
                            </div>
                          )}

                          <div className="col-md-3">
                            <div className="border rounded p-2">
                              <strong>Assist 1:</strong>{" "}
                              {getEmployeeName(unit.crew.assist1)}
                            </div>
                          </div>

                          <div className="col-md-3">
                            <div className="border rounded p-2">
                              <strong>Assist 2:</strong>{" "}
                              {getEmployeeName(unit.crew.assist2)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Saved patient order summary. */}
                      <div>
                        <div className="fw-semibold mb-2">Patient Order</div>

                        <ol className="mb-0">
                          <li>{unit.firstPatient}</li>

                          {unit.nextPatients.map((patient, index) => (
                            <li key={`saved-patient-${unit.id}-${index}`}>
                              {patient}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CrewPlannerPage;
