import React, { useEffect, useMemo, useState } from 'react';

/*
  localStorage key for employee records.
  This data is created and maintained on the Employees page.
*/
const EMPLOYEES_STORAGE_KEY = 'employees';

/*
  localStorage key for saved units.
  Each created unit will be stored here.
*/
const UNITS_STORAGE_KEY = 'planned_units';

/*
  Supported unit types.
*/
const UNIT_TYPES = ['BLS', 'ALS', 'ASSIST'];

/*
  Empty crew structure for a new unit form.
  We use one medical slot because its meaning depends on unit type:
  - BLS -> EMT
  - ALS -> Paramedic
  - ASSIST -> optional / hidden
*/
const initialCrew = {
  driver: '',
  medical: '',
  assist1: '',
  assist2: '',
};

/*
  Empty unit form state.
  First patient is required.
  Additional patients are optional and stored in nextPatients.
*/
const initialUnitForm = {
  unitType: 'BLS',
  truckNumber: '',
  startTime: '',
  crew: { ...initialCrew },
  firstPatient: '',
  nextPatients: [''],
};

function UnitPlannerPage() {
  /*
    Employee list shared from the Employees page.
  */
  const [employees, setEmployees] = useState([]);

  /*
    Saved units for the current browser session.
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
      console.error('Failed to load units from localStorage:', error);
      return [];
    }
  });

  /*
    Form state for creating or editing a unit.
  */
  const [unitForm, setUnitForm] = useState(initialUnitForm);

  /*
    Tracks whether the form is in edit mode.
    If null, the form creates a new unit.
    If it has an id, the form updates an existing unit.
  */
  const [editingUnitId, setEditingUnitId] = useState(null);

  /*
    Load employees from localStorage on first render.
  */
  useEffect(() => {
    try {
      const savedEmployees = localStorage.getItem(EMPLOYEES_STORAGE_KEY);

      if (!savedEmployees) {
        setEmployees([]);
        return;
      }

      const parsedEmployees = JSON.parse(savedEmployees);
      setEmployees(Array.isArray(parsedEmployees) ? parsedEmployees : []);
    } catch (error) {
      console.error('Failed to load employees from localStorage:', error);
      setEmployees([]);
    }
  }, []);

  /*
    Save units every time the unit list changes.
  */
  useEffect(() => {
    try {
      localStorage.setItem(UNITS_STORAGE_KEY, JSON.stringify(units));
    } catch (error) {
      console.error('Failed to save units to localStorage:', error);
    }
  }, [units]);

  /*
    Normalizes a license object to avoid crashes with older employee records.
  */
  const normalizeLicense = (license) => {
    if (!license) {
      return {
        hasLicense: false,
        licenseName: '',
        expirationDate: '',
      };
    }

    return {
      hasLicense: Boolean(license.hasLicense),
      licenseName: license.licenseName || '',
      expirationDate: license.expirationDate || '',
    };
  };

  /*
    Returns human-readable status for any certification.
  */
  const getLicenseStatus = (license) => {
    const normalizedLicense = normalizeLicense(license);

    if (!normalizedLicense.hasLicense) {
      return 'No License';
    }

    if (!normalizedLicense.expirationDate) {
      return 'Active';
    }

    const today = new Date();
    const expirationDate = new Date(`${normalizedLicense.expirationDate}T23:59:59`);
    const diffInMs = expirationDate - today;
    const diffInDays = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays < 0) {
      return 'Expired';
    }

    if (diffInDays <= 30) {
      return 'Expiring Soon';
    }

    return 'Active';
  };

  /*
    Maps status names to Bootstrap badge classes.
  */
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Active':
        return 'text-bg-success';
      case 'Expiring Soon':
        return 'text-bg-warning';
      case 'Expired':
        return 'text-bg-danger';
      default:
        return 'text-bg-secondary';
    }
  };

  /*
    CPR is required for all employees by business rule,
    but it only creates a warning and does not block assignment.
  */
  const getCprWarning = (employee) => {
    const cpr = normalizeLicense(employee.cpr);
    const cprStatus = getLicenseStatus(cpr);

    if (!cpr.hasLicense) {
      return 'Missing CPR';
    }

    if (cprStatus === 'Expired') {
      return 'CPR Expired';
    }

    if (cprStatus === 'Expiring Soon') {
      return 'CPR Expiring Soon';
    }

    return '';
  };

  /*
    Returns a display label for the medical slot based on unit type.
  */
  const getMedicalSlotLabel = (unitType) => {
    switch (unitType) {
      case 'ALS':
        return 'Paramedic';
      case 'BLS':
        return 'EMT';
      case 'ASSIST':
      default:
        return 'Medical Slot';
    }
  };

  /*
    Returns whether the medical slot should be visible.
  */
  const isMedicalSlotVisible = (unitType) => {
    return unitType === 'ALS' || unitType === 'BLS';
  };

  /*
    Returns whether a role is required for the current unit type.
  */
  const isRoleRequired = (unitType, role) => {
    switch (unitType) {
      case 'ALS':
        return role === 'driver' || role === 'medical';

      case 'BLS':
        return role === 'driver' || role === 'medical';

      case 'ASSIST':
        return role === 'driver';

      default:
        return false;
    }
  };

  /*
    Finds an employee object by id.
  */
  const getEmployeeById = (employeeId) => {
    return employees.find((employee) => String(employee.id) === String(employeeId));
  };

  /*
    Returns whether an employee can be assigned to the requested role
    for the selected unit type.
  */
  const isEmployeeEligibleForRole = (employee, role, unitType) => {
    if (!employee.isActive) {
      return false;
    }

    if (role === 'driver') {
      return Boolean(employee.evoc?.hasLicense);
    }

    if (role === 'medical') {
      if (unitType === 'BLS') {
        return Boolean(employee.emt?.hasLicense);
      }

      if (unitType === 'ALS') {
        return Boolean(employee.paramedic?.hasLicense);
      }

      return false;
    }

    if (role === 'assist1' || role === 'assist2') {
      return true;
    }

    return false;
  };

  /*
    Returns a list of selected employee ids in all other crew slots
    of the current unit form.
    This prevents duplicate assignment inside one single unit.
  */
  const getSelectedEmployeeIds = (currentRole) => {
    return Object.entries(unitForm.crew)
      .filter(([role, employeeId]) => role !== currentRole && employeeId)
      .map(([, employeeId]) => String(employeeId));
  };

  /*
    Searches through already created units and finds whether
    the employee is already assigned somewhere else.

    When editing a unit, the current unit is ignored.
  */
  const getEmployeeAssignmentsInOtherUnits = (employeeId) => {
    const normalizedEmployeeId = String(employeeId);
    const assignments = [];

    units.forEach((unit) => {
      /*
        Ignore the currently edited unit so its own crew
        does not generate false "already assigned" warnings.
      */
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
    Returns employees available for a specific role in the current unit form.

    Important:
    - duplicate assignment inside the same unit is blocked
    - assignment to other existing units is NOT blocked
    - existing cross-unit assignment is shown as warning
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
    Updates a top-level unit form field.
  */
  const handleUnitFieldChange = (event) => {
    const { name, value } = event.target;

    setUnitForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /*
    Updates a crew slot in the unit form.
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
    Updates the first patient field.
  */
  const handleFirstPatientChange = (event) => {
    const { value } = event.target;

    setUnitForm((prev) => ({
      ...prev,
      firstPatient: value,
    }));
  };

  /*
    Updates one optional next patient field by index.
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
    Adds another optional patient field.
  */
  const handleAddNextPatientField = () => {
    setUnitForm((prev) => ({
      ...prev,
      nextPatients: [...prev.nextPatients, ''],
    }));
  };

  /*
    Removes one optional patient field by index.
    At least one optional input remains for convenience.
  */
  const handleRemoveNextPatientField = (index) => {
    setUnitForm((prev) => {
      if (prev.nextPatients.length === 1) {
        return {
          ...prev,
          nextPatients: [''],
        };
      }

      return {
        ...prev,
        nextPatients: prev.nextPatients.filter((_, patientIndex) => patientIndex !== index),
      };
    });
  };

  /*
    Resets the unit form and exits edit mode.
  */
  const resetUnitForm = () => {
    setUnitForm(initialUnitForm);
    setEditingUnitId(null);
  };

  /*
    Loads an existing unit into the form for editing.
  */
  const handleEditUnit = (unit) => {
    setEditingUnitId(unit.id);

    setUnitForm({
      unitType: unit.unitType || 'BLS',
      truckNumber: unit.truckNumber || '',
      startTime: unit.startTime || '',
      crew: {
        driver: unit.crew?.driver || '',
        medical: unit.crew?.medical || '',
        assist1: unit.crew?.assist1 || '',
        assist2: unit.crew?.assist2 || '',
      },
      firstPatient: unit.firstPatient || '',
      nextPatients:
        unit.nextPatients && unit.nextPatients.length > 0 ? [...unit.nextPatients] : [''],
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /*
    When unit type changes, clear the medical slot if it becomes hidden.
    This prevents stale data from staying in the form.
  */
  useEffect(() => {
    if (!isMedicalSlotVisible(unitForm.unitType)) {
      setUnitForm((prev) => ({
        ...prev,
        crew: {
          ...prev.crew,
          medical: '',
        },
      }));
    }
  }, [unitForm.unitType]);

  /*
    Returns validation errors for the unit form.
    These errors block saving.
  */
  const unitValidationErrors = useMemo(() => {
    const errors = [];

    if (!unitForm.truckNumber.trim()) {
      errors.push('Truck Number is required.');
    }

    if (!unitForm.startTime.trim()) {
      errors.push('Start Time is required.');
    }

    if (!unitForm.firstPatient.trim()) {
      errors.push('First Patient is required.');
    }

    if (!unitForm.crew.driver) {
      errors.push('Driver is required.');
    }

    if (unitForm.unitType === 'BLS' && !unitForm.crew.medical) {
      errors.push('BLS unit requires an EMT.');
    }

    if (unitForm.unitType === 'ALS' && !unitForm.crew.medical) {
      errors.push('ALS unit requires a Paramedic.');
    }

    if (unitForm.crew.driver) {
      const driver = getEmployeeById(unitForm.crew.driver);

      if (!driver) {
        errors.push('Selected Driver was not found.');
      } else if (!driver.isActive) {
        errors.push('Selected Driver is inactive.');
      } else if (!driver.evoc?.hasLicense) {
        errors.push('Selected Driver does not have EVOC.');
      }
    }

    if (unitForm.crew.medical) {
      const medical = getEmployeeById(unitForm.crew.medical);

      if (!medical) {
        errors.push('Selected medical crew member was not found.');
      } else if (!medical.isActive) {
        errors.push('Selected medical crew member is inactive.');
      } else if (unitForm.unitType === 'BLS' && !medical.emt?.hasLicense) {
        errors.push('Selected medical crew member does not have EMT certification.');
      } else if (unitForm.unitType === 'ALS' && !medical.paramedic?.hasLicense) {
        errors.push('Selected medical crew member does not have Paramedic certification.');
      }
    }

    if (unitForm.crew.assist1) {
      const assist1 = getEmployeeById(unitForm.crew.assist1);

      if (!assist1) {
        errors.push('Selected Assist 1 employee was not found.');
      } else if (!assist1.isActive) {
        errors.push('Selected Assist 1 employee is inactive.');
      }
    }

    if (unitForm.crew.assist2) {
      const assist2 = getEmployeeById(unitForm.crew.assist2);

      if (!assist2) {
        errors.push('Selected Assist 2 employee was not found.');
      } else if (!assist2.isActive) {
        errors.push('Selected Assist 2 employee is inactive.');
      }
    }

    return errors;
  }, [unitForm, employees]);

  /*
    Returns warning messages for the unit form.
    These warnings do not block saving.

    Included here:
    - CPR warnings
    - expired or expiring certifications
    - employee already assigned to another saved unit
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
        warnings.push(`${employee.firstName} ${employee.lastName}: ${cprWarning}.`);
      }

      const existingAssignments = getEmployeeAssignmentsInOtherUnits(employee.id);

      existingAssignments.forEach((assignment) => {
        warnings.push(
          `${employee.firstName} ${employee.lastName} is already assigned to Truck ${assignment.truckNumber} (${assignment.unitType}, ${assignment.startTime}) as ${assignment.role}.`
        );
      });

      if (String(unitForm.crew.driver) === String(employee.id)) {
        const driverStatus = getLicenseStatus(employee.evoc);

        if (driverStatus === 'Expired') {
          warnings.push(`${employee.firstName} ${employee.lastName}: Driver EVOC is expired.`);
        }

        if (driverStatus === 'Expiring Soon') {
          warnings.push(
            `${employee.firstName} ${employee.lastName}: Driver EVOC is expiring soon.`
          );
        }
      }

      if (String(unitForm.crew.medical) === String(employee.id)) {
        if (unitForm.unitType === 'BLS') {
          const emtStatus = getLicenseStatus(employee.emt);

          if (emtStatus === 'Expired') {
            warnings.push(`${employee.firstName} ${employee.lastName}: EMT certification is expired.`);
          }

          if (emtStatus === 'Expiring Soon') {
            warnings.push(
              `${employee.firstName} ${employee.lastName}: EMT certification is expiring soon.`
            );
          }
        }

        if (unitForm.unitType === 'ALS') {
          const medicStatus = getLicenseStatus(employee.paramedic);

          if (medicStatus === 'Expired') {
            warnings.push(
              `${employee.firstName} ${employee.lastName}: Paramedic certification is expired.`
            );
          }

          if (medicStatus === 'Expiring Soon') {
            warnings.push(
              `${employee.firstName} ${employee.lastName}: Paramedic certification is expiring soon.`
            );
          }
        }
      }
    });

    return warnings;
  }, [unitForm, employees, units, editingUnitId]);

  /*
    Returns a flat list of all employee ids assigned in saved units.
    When editing, the current unit is excluded.
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
    Returns active employees who are not assigned to any saved unit.
    This list is shown above the unit form in a compact layout.
  */
  const unassignedEmployees = useMemo(() => {
    return employees.filter((employee) => {
      if (!employee.isActive) {
        return false;
      }

      return !assignedEmployeeIds.includes(String(employee.id));
    });
  }, [employees, assignedEmployeeIds]);

  /*
    Creates a new unit or updates an existing one.
  */
  const handleSaveUnit = (event) => {
    event.preventDefault();

    if (unitValidationErrors.length > 0) {
      return;
    }

    const cleanedNextPatients = unitForm.nextPatients
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
        ? units.find((unit) => String(unit.id) === String(editingUnitId))?.createdAt ||
          new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (editingUnitId) {
      setUnits((prev) =>
        prev.map((unit) => (String(unit.id) === String(editingUnitId) ? unitPayload : unit))
      );
    } else {
      setUnits((prev) => [...prev, unitPayload]);
    }

    resetUnitForm();
  };

  /*
    Deletes one saved unit.
  */
  const handleDeleteUnit = (unitId) => {
    const isCurrentlyEditing = String(editingUnitId) === String(unitId);

    setUnits((prev) => prev.filter((unit) => String(unit.id) !== String(unitId)));

    if (isCurrentlyEditing) {
      resetUnitForm();
    }
  };

  /*
    Clears all saved units.
  */
  const handleClearAllUnits = () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete all planned units?'
    );

    if (!confirmed) {
      return;
    }

    setUnits([]);
    localStorage.removeItem(UNITS_STORAGE_KEY);
    resetUnitForm();
  };

  /*
    Returns a formatted employee name for rendering.
  */
  const getEmployeeName = (employeeId) => {
    const employee = getEmployeeById(employeeId);

    if (!employee) {
      return 'Not assigned';
    }

    return `${employee.firstName} ${employee.lastName}`;
  };

  /*
    Renders a small CPR badge for a selected employee.
  */
  const renderCprBadgeForEmployee = (employeeId) => {
    if (!employeeId) {
      return null;
    }

    const employee = getEmployeeById(employeeId);

    if (!employee) {
      return null;
    }

    const warning = getCprWarning(employee);

    if (!warning) {
      return <span className="badge text-bg-success ms-2">CPR OK</span>;
    }

    if (warning === 'CPR Expiring Soon') {
      return <span className="badge text-bg-warning ms-2">{warning}</span>;
    }

    return <span className="badge text-bg-danger ms-2">{warning}</span>;
  };

  /*
    Renders a warning badge when selected employee is already
    assigned to another saved unit.
  */
  const renderExistingAssignmentBadge = (employeeId) => {
    if (!employeeId) {
      return null;
    }

    const assignments = getEmployeeAssignmentsInOtherUnits(employeeId);

    if (assignments.length === 0) {
      return null;
    }

    return <span className="badge text-bg-warning ms-2">Already Assigned</span>;
  };

  /*
    Renders a detailed warning block under a crew slot if the selected
    employee is already assigned in another saved unit.
  */
  const renderExistingAssignmentWarning = (employeeId) => {
    if (!employeeId) {
      return null;
    }

    const assignments = getEmployeeAssignmentsInOtherUnits(employeeId);

    if (assignments.length === 0) {
      return null;
    }

    return (
      <div className="alert alert-warning py-2 px-3 mt-2 mb-0">
        <div className="fw-semibold mb-1">
          Warning: employee is already assigned to another unit.
        </div>

        <ul className="mb-0">
          {assignments.map((assignment, index) => (
            <li key={`${assignment.unitId}-${assignment.role}-${index}`}>
              Truck {assignment.truckNumber} ({assignment.unitType}, {assignment.startTime}) — {assignment.role}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  /*
    Renders one employee selector for a crew role.
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
        >
          <option value="">Select employee...</option>

          {availableEmployees.map((employee) => {
            const existingAssignments = getEmployeeAssignmentsInOtherUnits(employee.id);
            const isAlreadyAssigned = existingAssignments.length > 0;

            return (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} {employee.lastName}
                {isAlreadyAssigned ? ' [ALREADY ASSIGNED]' : ''}
              </option>
            );
          })}
        </select>

        {selectedEmployeeId && (
          <div className="small mt-2">
            <div>
              <strong>Selected:</strong> {getEmployeeName(selectedEmployeeId)}
              {renderCprBadgeForEmployee(selectedEmployeeId)}
              {renderExistingAssignmentBadge(selectedEmployeeId)}
            </div>
          </div>
        )}

        {renderExistingAssignmentWarning(selectedEmployeeId)}
      </div>
    );
  };

  return (
    <div className="container mt-4">
      {/* Page header */}
      <div className="mb-4">
        <h1 className="mb-2">Unit Planner</h1>
        <p className="text-muted mb-0">
          Create and manage ambulance units with truck number, start time, crew assignment,
          and patient sequence for the day.
        </p>
      </div>

      {/* Current stage information */}
      <div className="alert alert-info">
        <h5 className="mb-2">Current Stage</h5>
        <p className="mb-0">
          This page creates actual units instead of abstract crews. Each unit includes
          a unit type, truck number, start time, assigned staff, a required first patient,
          and optional next patients.
        </p>
      </div>

      {/* Compact panel of active employees who are not assigned anywhere */}
      <div className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Unassigned Employees</h5>
          <span className="badge text-bg-secondary">{unassignedEmployees.length}</span>
        </div>

        <div className="card-body py-3">
          {unassignedEmployees.length === 0 ? (
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
                        ? cprWarning === 'CPR Expiring Soon'
                          ? 'text-bg-warning'
                          : 'text-bg-danger'
                        : 'text-bg-light border text-dark'
                    }`}
                    title={`${employee.firstName} ${employee.lastName}${
                      cprWarning ? ` — ${cprWarning}` : ''
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

      {/* Validation errors */}
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

      {/* Warning messages */}
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

      {/* New / edit unit form */}
      <div className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            {editingUnitId ? 'Edit Unit' : 'Create New Unit'}
          </h5>

          {editingUnitId && <span className="badge text-bg-info">Editing Mode</span>}
        </div>

        <div className="card-body">
          {employees.length === 0 ? (
            <p className="text-muted mb-0">
              No employees found. Add employees on the Employees page first.
            </p>
          ) : (
            <form onSubmit={handleSaveUnit}>
              <div className="row g-3">
                {/* Unit type */}
                <div className="col-md-4">
                  <label htmlFor="unitType" className="form-label fw-semibold">
                    Unit Type
                  </label>

                  <select
                    id="unitType"
                    name="unitType"
                    className="form-select"
                    value={unitForm.unitType}
                    onChange={handleUnitFieldChange}
                  >
                    {UNIT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Truck number */}
                <div className="col-md-4">
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
                    placeholder="e.g. 3, 11, 14, 19"
                  />
                </div>

                {/* Start time */}
                <div className="col-md-4">
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
                  />
                </div>

                {/* Crew section header */}
                <div className="col-12">
                  <hr />
                  <h5 className="mb-0">Crew Assignment</h5>
                </div>

                {/* Driver slot */}
                {renderCrewSelect('driver', 'Driver')}

                {/* Medical slot */}
                {isMedicalSlotVisible(unitForm.unitType) &&
                  renderCrewSelect('medical', getMedicalSlotLabel(unitForm.unitType))}

                {/* Assist slots */}
                {renderCrewSelect('assist1', 'Assist 1')}
                {renderCrewSelect('assist2', 'Assist 2')}

                {/* Patient section header */}
                <div className="col-12">
                  <hr />
                  <h5 className="mb-0">Patient Order</h5>
                </div>

                {/* First patient required */}
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
                    placeholder="e.g. Hashim"
                  />
                </div>

                {/* Optional next patients */}
                <div className="col-12">
                  <label className="form-label fw-semibold">Next Patients</label>

                  <div className="d-flex flex-column gap-2">
                    {unitForm.nextPatients.map((patient, index) => (
                      <div key={`next-patient-${index}`} className="d-flex gap-2">
                        <input
                          type="text"
                          className="form-control"
                          value={patient}
                          onChange={(event) =>
                            handleNextPatientChange(index, event.target.value)
                          }
                          placeholder={`Optional patient ${index + 2}`}
                        />

                        <button
                          type="button"
                          className="btn btn-outline-danger"
                          onClick={() => handleRemoveNextPatientField(index)}
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
                  >
                    Add Next Patient
                  </button>
                </div>

                {/* Action buttons */}
                <div className="col-12 d-flex gap-2">
                  <button type="submit" className="btn btn-primary">
                    {editingUnitId ? 'Update Unit' : 'Create Unit'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={resetUnitForm}
                  >
                    {editingUnitId ? 'Cancel Edit' : 'Clear Form'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Saved units list */}
      <div className="card shadow-sm">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Planned Units</h5>

          <div className="d-flex align-items-center gap-2">
            <span className="badge text-bg-secondary">{units.length}</span>

            {units.length > 0 && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={handleClearAllUnits}
              >
                Clear All Units
              </button>
            )}
          </div>
        </div>

        <div className="card-body">
          {units.length === 0 ? (
            <p className="text-muted mb-0">No units created yet.</p>
          ) : (
            <div className="row g-3">
              {units.map((unit) => (
                <div key={unit.id} className="col-12">
                  <div className="card border-light-subtle">
                    <div className="card-body">
                      {/* Unit header */}
                      <div className="d-flex justify-content-between align-items-start mb-3">
                        <div>
                          <h5 className="mb-1">
                            {unit.startTime} — Truck {unit.truckNumber}
                          </h5>

                          <div className="d-flex flex-wrap gap-2">
                            <span className="badge text-bg-primary">{unit.unitType}</span>
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
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDeleteUnit(unit.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Crew summary */}
                      <div className="mb-3">
                        <div className="fw-semibold mb-2">Crew</div>

                        <div className="row g-2">
                          <div className="col-md-3">
                            <div className="border rounded p-2">
                              <strong>Driver:</strong> {getEmployeeName(unit.crew.driver)}
                            </div>
                          </div>

                          {isMedicalSlotVisible(unit.unitType) && (
                            <div className="col-md-3">
                              <div className="border rounded p-2">
                                <strong>{getMedicalSlotLabel(unit.unitType)}:</strong>{' '}
                                {getEmployeeName(unit.crew.medical)}
                              </div>
                            </div>
                          )}

                          <div className="col-md-3">
                            <div className="border rounded p-2">
                              <strong>Assist 1:</strong> {getEmployeeName(unit.crew.assist1)}
                            </div>
                          </div>

                          <div className="col-md-3">
                            <div className="border rounded p-2">
                              <strong>Assist 2:</strong> {getEmployeeName(unit.crew.assist2)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Patient order */}
                      <div>
                        <div className="fw-semibold mb-2">Patient Order</div>

                        <ol className="mb-0">
                          <li>{unit.firstPatient}</li>

                          {unit.nextPatients.map((patient, index) => (
                            <li key={`saved-patient-${unit.id}-${index}`}>{patient}</li>
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

export default UnitPlannerPage;