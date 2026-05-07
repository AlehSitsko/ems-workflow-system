import React, { useEffect, useMemo, useState } from "react";

import { getEmployees } from "../api/employeesApi";

/*
  localStorage key for saved units.
  Units are still stored locally during MVP stage.
*/
const UNITS_STORAGE_KEY = "planned_units";

/*
  Supported unit types.
*/
const UNIT_TYPES = ["BLS", "ALS", "ASSIST"];

/*
  Empty crew structure for a new unit form.
*/
const initialCrew = {
  driver: "",
  medical: "",
  assist1: "",
  assist2: "",
};

/*
  Empty unit form state.
*/
const initialUnitForm = {
  unitType: "BLS",
  truckNumber: "",
  startTime: "",
  crew: { ...initialCrew },
  firstPatient: "",
  nextPatients: [""],
};

function CrewPlannerPage() {
  /*
    Employee list is now loaded from backend API.
  */
  const [employees, setEmployees] = useState([]);

  /*
    Loading state for backend employee fetch.
  */
  const [employeesLoading, setEmployeesLoading] = useState(false);

  /*
    Error state for backend employee fetch.
  */
  const [employeesError, setEmployeesError] = useState("");

  /*
    Saved units remain local during MVP stage.
  */
  const [units, setUnits] = useState(() => {
    try {
      const savedUnits = localStorage.getItem(UNITS_STORAGE_KEY);

      if (!savedUnits) {
        return [];
      }

      const parsedUnits = JSON.parse(savedUnits);

      return Array.isArray(parsedUnits) ? parsedUnits : [];
    } catch (error) {
      console.error("Failed to load units from localStorage:", error);
      return [];
    }
  });

  /*
    Form state for creating or editing a unit.
  */
  const [unitForm, setUnitForm] = useState(initialUnitForm);

  /*
    Tracks edit mode.
  */
  const [editingUnitId, setEditingUnitId] = useState(null);

  /*
    Load employees from backend API.
  */
  useEffect(() => {
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

    loadEmployees();
  }, []);

  /*
    Save units every time the unit list changes.
  */
  useEffect(() => {
    try {
      localStorage.setItem(UNITS_STORAGE_KEY, JSON.stringify(units));
    } catch (error) {
      console.error("Failed to save units to localStorage:", error);
    }
  }, [units]);

  /*
    Normalizes a license object to avoid crashes.
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
    Returns human-readable status for certifications.
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

    const diffInDays = Math.ceil(
      diffInMs / (1000 * 60 * 60 * 24)
    );

    if (diffInDays < 0) {
      return "Expired";
    }

    if (diffInDays <= 30) {
      return "Expiring Soon";
    }

    return "Active";
  };

  /*
    Maps status names to Bootstrap badge classes.
  */
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "Active":
        return "text-bg-success";

      case "Expiring Soon":
        return "text-bg-warning";

      case "Expired":
        return "text-bg-danger";

      default:
        return "text-bg-secondary";
    }
  };

  /*
    CPR warning helper.
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
    Returns label for medical slot.
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
    Returns whether medical slot should be shown.
  */
  const isMedicalSlotVisible = (unitType) => {
    return unitType === "ALS" || unitType === "BLS";
  };

  /*
    Returns whether role is required.
  */
  const isRoleRequired = (unitType, role) => {
    switch (unitType) {
      case "ALS":
        return role === "driver" || role === "medical";

      case "BLS":
        return role === "driver" || role === "medical";

      case "ASSIST":
        return role === "driver";

      default:
        return false;
    }
  };

  /*
    Find employee by id.
  */
  const getEmployeeById = (employeeId) => {
    return employees.find(
      (employee) => String(employee.id) === String(employeeId)
    );
  };

  /*
    Eligibility validation for crew roles.
  */
  const isEmployeeEligibleForRole = (
    employee,
    role,
    unitType
  ) => {
    if (!employee.isActive) {
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
    Prevent duplicate assignment inside same unit.
  */
  const getSelectedEmployeeIds = (currentRole) => {
    return Object.entries(unitForm.crew)
      .filter(
        ([role, employeeId]) =>
          role !== currentRole && employeeId
      )
      .map(([, employeeId]) => String(employeeId));
  };

  /*
    Returns assignments in other units.
  */
  const getEmployeeAssignmentsInOtherUnits = (
    employeeId
  ) => {
    const normalizedEmployeeId = String(employeeId);

    const assignments = [];

    units.forEach((unit) => {
      if (
        editingUnitId &&
        String(unit.id) === String(editingUnitId)
      ) {
        return;
      }

      Object.entries(unit.crew || {}).forEach(
        ([role, assignedEmployeeId]) => {
          if (
            String(assignedEmployeeId) ===
            normalizedEmployeeId
          ) {
            assignments.push({
              unitId: unit.id,
              truckNumber: unit.truckNumber,
              unitType: unit.unitType,
              startTime: unit.startTime,
              role,
            });
          }
        }
      );
    });

    return assignments;
  };

  /*
    Returns available employees for role.
  */
  const getAvailableEmployeesForRole = (role) => {
    const selectedElsewhereInCurrentUnit =
      getSelectedEmployeeIds(role);

    return employees.filter((employee) => {
      const employeeId = String(employee.id);

      if (
        selectedElsewhereInCurrentUnit.includes(employeeId)
      ) {
        return false;
      }

      return isEmployeeEligibleForRole(
        employee,
        role,
        unitForm.unitType
      );
    });
  };

  /*
    Generic unit field update.
  */
  const handleUnitFieldChange = (event) => {
    const { name, value } = event.target;

    setUnitForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /*
    Crew slot update.
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
    First patient update.
  */
  const handleFirstPatientChange = (event) => {
    const { value } = event.target;

    setUnitForm((prev) => ({
      ...prev,
      firstPatient: value,
    }));
  };

  /*
    Next patient update.
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
    Add optional patient field.
  */
  const handleAddNextPatientField = () => {
    setUnitForm((prev) => ({
      ...prev,
      nextPatients: [...prev.nextPatients, ""],
    }));
  };

  /*
    Remove optional patient field.
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
    Reset form.
  */
  const resetUnitForm = () => {
    setUnitForm(initialUnitForm);
    setEditingUnitId(null);
  };

  /*
    Load existing unit into edit mode.
  */
  const handleEditUnit = (unit) => {
    setEditingUnitId(unit.id);

    setUnitForm({
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
        unit.nextPatients &&
        unit.nextPatients.length > 0
          ? [...unit.nextPatients]
          : [""],
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  /*
    Clear medical slot when hidden.
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
    Validation errors.
  */
  const unitValidationErrors = useMemo(() => {
    const errors = [];

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

    if (
      unitForm.unitType === "BLS" &&
      !unitForm.crew.medical
    ) {
      errors.push("BLS unit requires an EMT.");
    }

    if (
      unitForm.unitType === "ALS" &&
      !unitForm.crew.medical
    ) {
      errors.push("ALS unit requires a Paramedic.");
    }

    return errors;
  }, [unitForm]);

  /*
    Warning messages.
  */
  const unitWarningMessages = useMemo(() => {
    const warnings = [];

    const selectedCrewMembers = Object.values(
      unitForm.crew
    )
      .filter(Boolean)
      .map((employeeId) =>
        getEmployeeById(employeeId)
      )
      .filter(Boolean);

    selectedCrewMembers.forEach((employee) => {
      const cprWarning = getCprWarning(employee);

      if (cprWarning) {
        warnings.push(
          `${employee.firstName} ${employee.lastName}: ${cprWarning}.`
        );
      }

      const existingAssignments =
        getEmployeeAssignmentsInOtherUnits(
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
    Assigned employee ids.
  */
  const assignedEmployeeIds = useMemo(() => {
    const ids = [];

    units.forEach((unit) => {
      if (
        editingUnitId &&
        String(unit.id) === String(editingUnitId)
      ) {
        return;
      }

      Object.values(unit.crew || {}).forEach(
        (employeeId) => {
          if (employeeId) {
            ids.push(String(employeeId));
          }
        }
      );
    });

    return ids;
  }, [units, editingUnitId]);

  /*
    Unassigned active employees.
  */
  const unassignedEmployees = useMemo(() => {
    return employees.filter((employee) => {
      if (!employee.isActive) {
        return false;
      }

      return !assignedEmployeeIds.includes(
        String(employee.id)
      );
    });
  }, [employees, assignedEmployeeIds]);

  /*
    Save unit.
  */
  const handleSaveUnit = (event) => {
    event.preventDefault();

    if (unitValidationErrors.length > 0) {
      return;
    }

    const cleanedNextPatients =
      unitForm.nextPatients
        .map((patient) => patient.trim())
        .filter(Boolean);

    const unitPayload = {
      id: editingUnitId || Date.now(),
      unitType: unitForm.unitType,
      truckNumber: unitForm.truckNumber.trim(),
      startTime: unitForm.startTime,
      crew: { ...unitForm.crew },
      firstPatient: unitForm.firstPatient.trim(),
      nextPatients: cleanedNextPatients,

      createdAt: editingUnitId
        ? units.find(
            (unit) =>
              String(unit.id) ===
              String(editingUnitId)
          )?.createdAt ||
          new Date().toISOString()
        : new Date().toISOString(),

      updatedAt: new Date().toISOString(),
    };

    if (editingUnitId) {
      setUnits((prev) =>
        prev.map((unit) =>
          String(unit.id) ===
          String(editingUnitId)
            ? unitPayload
            : unit
        )
      );
    } else {
      setUnits((prev) => [...prev, unitPayload]);
    }

    resetUnitForm();
  };

  /*
    Delete one unit.
  */
  const handleDeleteUnit = (unitId) => {
    const isCurrentlyEditing =
      String(editingUnitId) === String(unitId);

    setUnits((prev) =>
      prev.filter(
        (unit) =>
          String(unit.id) !== String(unitId)
      )
    );

    if (isCurrentlyEditing) {
      resetUnitForm();
    }
  };

  /*
    Clear all units.
  */
  const handleClearAllUnits = () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete all planned units?"
    );

    if (!confirmed) {
      return;
    }

    setUnits([]);

    localStorage.removeItem(UNITS_STORAGE_KEY);

    resetUnitForm();
  };

  /*
    Employee display name.
  */
  const getEmployeeName = (employeeId) => {
    const employee = getEmployeeById(employeeId);

    if (!employee) {
      return "Not assigned";
    }

    return `${employee.firstName} ${employee.lastName}`;
  };

  /*
    Crew selector.
  */
  const renderCrewSelect = (role, label) => {
    const availableEmployees =
      getAvailableEmployeesForRole(role);

    const selectedEmployeeId =
      unitForm.crew[role];

    return (
      <div className="col-md-6 col-xl-3">
        <label className="form-label fw-semibold">
          {label}

          {isRoleRequired(
            unitForm.unitType,
            role
          ) && (
            <span className="badge text-bg-danger ms-2">
              Required
            </span>
          )}
        </label>

        <select
          className="form-select"
          value={selectedEmployeeId}
          onChange={(event) =>
            handleCrewChange(
              role,
              event.target.value
            )
          }
        >
          <option value="">
            Select employee...
          </option>

          {availableEmployees.map((employee) => {
            const existingAssignments =
              getEmployeeAssignmentsInOtherUnits(
                employee.id
              );

            const isAlreadyAssigned =
              existingAssignments.length > 0;

            return (
              <option
                key={employee.id}
                value={employee.id}
              >
                {employee.firstName}{" "}
                {employee.lastName}
                {isAlreadyAssigned
                  ? " [ALREADY ASSIGNED]"
                  : ""}
              </option>
            );
          })}
        </select>
      </div>
    );
  };

  return (
    <div className="container mt-4">
      <div className="mb-4">
        <h1 className="mb-2">
          Unit Planner
        </h1>

        <p className="text-muted mb-0">
          Create and manage EMS units
          with crew assignment and
          patient order.
        </p>
      </div>

      {employeesError && (
        <div className="alert alert-danger">
          {employeesError}
        </div>
      )}

      <div className="alert alert-info">
        <h5 className="mb-2">
          Current Stage
        </h5>

        <p className="mb-0">
          Crew Planner now loads
          employees from the backend API.
        </p>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            Unassigned Employees
          </h5>

          <span className="badge text-bg-secondary">
            {unassignedEmployees.length}
          </span>
        </div>

        <div className="card-body py-3">
          {employeesLoading ? (
            <p className="text-muted mb-0">
              Loading employees...
            </p>
          ) : unassignedEmployees.length ===
            0 ? (
            <p className="text-muted mb-0">
              No unassigned active
              employees.
            </p>
          ) : (
            <div className="d-flex flex-wrap gap-2">
              {unassignedEmployees.map(
                (employee) => {
                  const cprWarning =
                    getCprWarning(employee);

                  return (
                    <span
                      key={employee.id}
                      className={`badge ${
                        cprWarning
                          ? cprWarning ===
                            "CPR Expiring Soon"
                            ? "text-bg-warning"
                            : "text-bg-danger"
                          : "text-bg-light border text-dark"
                      }`}
                    >
                      {employee.firstName}{" "}
                      {employee.lastName}
                    </span>
                  );
                }
              )}
            </div>
          )}
        </div>
      </div>

      {unitValidationErrors.length >
        0 && (
        <div className="alert alert-danger">
          <h5 className="mb-2">
            Unit Validation Errors
          </h5>

          <ul className="mb-0">
            {unitValidationErrors.map(
              (message, index) => (
                <li
                  key={`unit-error-${index}`}
                >
                  {message}
                </li>
              )
            )}
          </ul>
        </div>
      )}

      {unitWarningMessages.length >
        0 && (
        <div className="alert alert-warning">
          <h5 className="mb-2">
            Unit Warnings
          </h5>

          <ul className="mb-0">
            {unitWarningMessages.map(
              (message, index) => (
                <li
                  key={`unit-warning-${index}`}
                >
                  {message}
                </li>
              )
            )}
          </ul>
        </div>
      )}

      <div className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            {editingUnitId
              ? "Edit Unit"
              : "Create New Unit"}
          </h5>

          {editingUnitId && (
            <span className="badge text-bg-info">
              Editing Mode
            </span>
          )}
        </div>

        <div className="card-body">
          {employeesLoading ? (
            <p className="text-muted mb-0">
              Loading employees...
            </p>
          ) : employees.length === 0 ? (
            <p className="text-muted mb-0">
              No employees found.
              Add employees on the
              Employees page first.
            </p>
          ) : (
            <form onSubmit={handleSaveUnit}>
              <div className="row g-3">
                <div className="col-md-4">
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
                    onChange={
                      handleUnitFieldChange
                    }
                  >
                    {UNIT_TYPES.map((type) => (
                      <option
                        key={type}
                        value={type}
                      >
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-4">
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
                    onChange={
                      handleUnitFieldChange
                    }
                  />
                </div>

                <div className="col-md-4">
                  <label
                    htmlFor="startTime"
                    className="form-label fw-semibold"
                  >
                    Start Time
                  </label>

                  <input
                    id="startTime"
                    name="startTime"
                    type="time"
                    className="form-control"
                    value={unitForm.startTime}
                    onChange={
                      handleUnitFieldChange
                    }
                  />
                </div>

                <div className="col-12">
                  <hr />

                  <h5 className="mb-0">
                    Crew Assignment
                  </h5>
                </div>

                {renderCrewSelect(
                  "driver",
                  "Driver"
                )}

                {isMedicalSlotVisible(
                  unitForm.unitType
                ) &&
                  renderCrewSelect(
                    "medical",
                    getMedicalSlotLabel(
                      unitForm.unitType
                    )
                  )}

                {renderCrewSelect(
                  "assist1",
                  "Assist 1"
                )}

                {renderCrewSelect(
                  "assist2",
                  "Assist 2"
                )}

                <div className="col-12">
                  <hr />

                  <h5 className="mb-0">
                    Patient Order
                  </h5>
                </div>

                <div className="col-12">
                  <label
                    htmlFor="firstPatient"
                    className="form-label fw-semibold"
                  >
                    First Patient

                    <span className="badge text-bg-danger ms-2">
                      Required
                    </span>
                  </label>

                  <input
                    id="firstPatient"
                    type="text"
                    className="form-control"
                    value={
                      unitForm.firstPatient
                    }
                    onChange={
                      handleFirstPatientChange
                    }
                  />
                </div>

                <div className="col-12">
                  <label className="form-label fw-semibold">
                    Next Patients
                  </label>

                  <div className="d-flex flex-column gap-2">
                    {unitForm.nextPatients.map(
                      (patient, index) => (
                        <div
                          key={`next-patient-${index}`}
                          className="d-flex gap-2"
                        >
                          <input
                            type="text"
                            className="form-control"
                            value={patient}
                            onChange={(
                              event
                            ) =>
                              handleNextPatientChange(
                                index,
                                event.target
                                  .value
                              )
                            }
                          />

                          <button
                            type="button"
                            className="btn btn-outline-danger"
                            onClick={() =>
                              handleRemoveNextPatientField(
                                index
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary mt-3"
                    onClick={
                      handleAddNextPatientField
                    }
                  >
                    Add Next Patient
                  </button>
                </div>

                <div className="col-12 d-flex gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary"
                  >
                    {editingUnitId
                      ? "Update Unit"
                      : "Create Unit"}
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={
                      resetUnitForm
                    }
                  >
                    {editingUnitId
                      ? "Cancel Edit"
                      : "Clear Form"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            Planned Units
          </h5>

          <div className="d-flex align-items-center gap-2">
            <span className="badge text-bg-secondary">
              {units.length}
            </span>

            {units.length > 0 && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={
                  handleClearAllUnits
                }
              >
                Clear All Units
              </button>
            )}
          </div>
        </div>

        <div className="card-body">
          {units.length === 0 ? (
            <p className="text-muted mb-0">
              No units created yet.
            </p>
          ) : (
            <div className="row g-3">
              {units.map((unit) => (
                <div
                  key={unit.id}
                  className="col-12"
                >
                  <div className="card border-light-subtle">
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-start mb-3">
                        <div>
                          <h5 className="mb-1">
                            {unit.startTime} —
                            Truck{" "}
                            {
                              unit.truckNumber
                            }
                          </h5>

                          <div className="d-flex flex-wrap gap-2">
                            <span className="badge text-bg-primary">
                              {
                                unit.unitType
                              }
                            </span>

                            <span className="badge text-bg-dark">
                              First:{" "}
                              {
                                unit.firstPatient
                              }
                            </span>
                          </div>
                        </div>

                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() =>
                              handleEditUnit(
                                unit
                              )
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() =>
                              handleDeleteUnit(
                                unit.id
                              )
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="fw-semibold mb-2">
                          Crew
                        </div>

                        <div className="row g-2">
                          <div className="col-md-3">
                            <div className="border rounded p-2">
                              <strong>
                                Driver:
                              </strong>{" "}
                              {getEmployeeName(
                                unit.crew
                                  .driver
                              )}
                            </div>
                          </div>

                          {isMedicalSlotVisible(
                            unit.unitType
                          ) && (
                            <div className="col-md-3">
                              <div className="border rounded p-2">
                                <strong>
                                  {getMedicalSlotLabel(
                                    unit.unitType
                                  )}
                                  :
                                </strong>{" "}
                                {getEmployeeName(
                                  unit.crew
                                    .medical
                                )}
                              </div>
                            </div>
                          )}

                          <div className="col-md-3">
                            <div className="border rounded p-2">
                              <strong>
                                Assist 1:
                              </strong>{" "}
                              {getEmployeeName(
                                unit.crew
                                  .assist1
                              )}
                            </div>
                          </div>

                          <div className="col-md-3">
                            <div className="border rounded p-2">
                              <strong>
                                Assist 2:
                              </strong>{" "}
                              {getEmployeeName(
                                unit.crew
                                  .assist2
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="fw-semibold mb-2">
                          Patient Order
                        </div>

                        <ol className="mb-0">
                          <li>
                            {
                              unit.firstPatient
                            }
                          </li>

                          {unit.nextPatients.map(
                            (
                              patient,
                              index
                            ) => (
                              <li
                                key={`saved-patient-${unit.id}-${index}`}
                              >
                                {patient}
                              </li>
                            )
                          )}
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