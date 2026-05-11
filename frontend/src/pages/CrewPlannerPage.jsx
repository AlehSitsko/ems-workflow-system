import React, { useEffect, useMemo, useState } from "react";

import { getEmployees } from "../api/employeesApi";

import {
  createCrewUnit,
  deleteCrewUnit,
  getCrewUnits,
  updateCrewUnit,
} from "../api/crewApi";

const UNIT_TYPES = ["BLS", "ALS", "ASSIST"];

const getTodayDate = () => new Date().toISOString().split("T")[0];

const initialCrew = {
  driver: "",
  medical: "",
  assist1: "",
  assist2: "",
};

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
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState("");

  const [selectedDate, setSelectedDate] = useState(getTodayDate());

  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState("");
  const [unitsMessage, setUnitsMessage] = useState("");

  const [unitForm, setUnitForm] = useState({
    ...initialUnitForm,
    shiftDate: selectedDate,
  });

  const [editingUnitId, setEditingUnitId] = useState(null);

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

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadUnits();

    setUnitForm((prev) => ({
      ...prev,
      shiftDate: selectedDate,
    }));

    setEditingUnitId(null);
  }, [selectedDate]);

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

  const isMedicalSlotVisible = (unitType) => {
    return unitType === "ALS" || unitType === "BLS";
  };

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

  const getEmployeeById = (employeeId) => {
    return employees.find(
      (employee) => String(employee.id) === String(employeeId)
    );
  };

  const isEmployeeEligibleForRole = (employee, role, unitType) => {
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

  const getSelectedEmployeeIds = (currentRole) => {
    return Object.entries(unitForm.crew)
      .filter(([role, employeeId]) => role !== currentRole && employeeId)
      .map(([, employeeId]) => String(employeeId));
  };

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

  const handleSelectedDateChange = (event) => {
    setSelectedDate(event.target.value);
    setUnitsMessage("");
    setUnitsError("");
  };

  const handleUnitFieldChange = (event) => {
    const { name, value } = event.target;

    setUnitForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCrewChange = (role, employeeId) => {
    setUnitForm((prev) => ({
      ...prev,
      crew: {
        ...prev.crew,
        [role]: employeeId,
      },
    }));
  };

  const handleFirstPatientChange = (event) => {
    setUnitForm((prev) => ({
      ...prev,
      firstPatient: event.target.value,
    }));
  };

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

  const handleAddNextPatientField = () => {
    setUnitForm((prev) => ({
      ...prev,
      nextPatients: [...prev.nextPatients, ""],
    }));
  };

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

  const resetUnitForm = () => {
    setUnitForm({
      ...initialUnitForm,
      shiftDate: selectedDate,
    });

    setEditingUnitId(null);
  };

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

    setUnitsMessage("");
    setUnitsError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

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

  const unassignedEmployees = useMemo(() => {
    return employees.filter((employee) => {
      if (!employee.isActive) {
        return false;
      }

      return !assignedEmployeeIds.includes(String(employee.id));
    });
  }, [employees, assignedEmployeeIds]);

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

  const getEmployeeName = (employeeId) => {
    const employee = getEmployeeById(employeeId);

    if (!employee) {
      return "Not assigned";
    }

    return `${employee.firstName} ${employee.lastName}`;
  };

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
      <div className="mb-4">
        <h1 className="mb-2">Unit Planner</h1>

        <p className="text-muted mb-0">
          Create and manage EMS units by shift date with crew assignment and
          patient order.
        </p>
      </div>

      {employeesError && <div className="alert alert-danger">{employeesError}</div>}

      {unitsError && <div className="alert alert-danger">{unitsError}</div>}

      {unitsMessage && (
        <div className="alert alert-success">{unitsMessage}</div>
      )}

      <div className="alert alert-info">
        <h5 className="mb-2">Current Stage</h5>

        <p className="mb-0">
          Crew Planner now loads employees and planned units from the backend
          API. Planned units are stored by shift date.
        </p>
      </div>

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

      <div className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            {editingUnitId ? "Edit Unit" : "Create New Unit"}
          </h5>

          {editingUnitId && <span className="badge text-bg-info">Editing Mode</span>}
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
                  <label htmlFor="truckNumber" className="form-label fw-semibold">
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

                <div className="col-12">
                  <hr />
                  <h5 className="mb-0">Crew Assignment</h5>
                </div>

                {renderCrewSelect("driver", "Driver")}

                {isMedicalSlotVisible(unitForm.unitType) &&
                  renderCrewSelect(
                    "medical",
                    getMedicalSlotLabel(unitForm.unitType)
                  )}

                {renderCrewSelect("assist1", "Assist 1")}

                {renderCrewSelect("assist2", "Assist 2")}

                <div className="col-12">
                  <hr />
                  <h5 className="mb-0">Patient Order</h5>
                </div>

                <div className="col-12">
                  <label htmlFor="firstPatient" className="form-label fw-semibold">
                    First Patient
                    <span className="badge text-bg-danger ms-2">Required</span>
                  </label>

                  <input
                    id="firstPatient"
                    type="text"
                    className="form-control"
                    value={unitForm.firstPatient}
                    onChange={handleFirstPatientChange}
                    disabled={unitsLoading}
                  />
                </div>

                <div className="col-12">
                  <label className="form-label fw-semibold">Next Patients</label>

                  <div className="d-flex flex-column gap-2">
                    {unitForm.nextPatients.map((patient, index) => (
                      <div
                        key={`next-patient-${index}`}
                        className="d-flex gap-2"
                      >
                        <input
                          type="text"
                          className="form-control"
                          value={patient}
                          onChange={(event) =>
                            handleNextPatientChange(index, event.target.value)
                          }
                          disabled={unitsLoading}
                        />

                        <button
                          type="button"
                          className="btn btn-outline-danger"
                          onClick={() => handleRemoveNextPatientField(index)}
                          disabled={unitsLoading}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary mt-3"
                    onClick={handleAddNextPatientField}
                    disabled={unitsLoading}
                  >
                    Add Next Patient
                  </button>
                </div>

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