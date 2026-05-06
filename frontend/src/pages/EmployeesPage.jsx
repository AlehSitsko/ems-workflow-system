import React, { useEffect, useState } from 'react';

/*
  localStorage key for saving employee records.
*/
const STORAGE_KEY = 'employees';

/*
  Separate storage key for Crew Planner units.
  This allows us to clear saved crews when loading test employees.
*/
const UNITS_STORAGE_KEY = 'planned_units';

/*
  Helper to create license objects for test employees.
*/
const createLicense = (hasLicense, licenseName, expirationDate) => ({
  hasLicense,
  licenseName,
  expirationDate,
});

/*
  Predefined test employees for quick Crew Planner testing.
*/
const TEST_EMPLOYEES = [
  {
    id: 1001,
    firstName: 'John',
    lastName: 'Carter',
    phone: '215-555-0101',
    isActive: true,
    notes: 'Test BLS driver / EMT',
    cpr: createLicense(true, 'CPR', '2027-12-31'),
    evoc: createLicense(true, 'EVOC', '2027-11-30'),
    emt: createLicense(true, 'EMT', '2027-10-31'),
    paramedic: createLicense(false, '', ''),
  },
  {
    id: 1002,
    firstName: 'Mike',
    lastName: 'Dalton',
    phone: '215-555-0102',
    isActive: true,
    notes: 'Test BLS EMT',
    cpr: createLicense(true, 'CPR', '2027-12-31'),
    evoc: createLicense(false, '', ''),
    emt: createLicense(true, 'EMT', '2027-08-31'),
    paramedic: createLicense(false, '', ''),
  },
  {
    id: 1003,
    firstName: 'Sarah',
    lastName: 'Collins',
    phone: '215-555-0103',
    isActive: true,
    notes: 'Test ALS medic',
    cpr: createLicense(true, 'CPR', '2027-12-31'),
    evoc: createLicense(false, '', ''),
    emt: createLicense(false, '', ''),
    paramedic: createLicense(true, 'Paramedic', '2027-07-31'),
  },
  {
    id: 1004,
    firstName: 'Victor',
    lastName: 'Hayes',
    phone: '215-555-0104',
    isActive: true,
    notes: 'Test ALS driver / medic',
    cpr: createLicense(true, 'CPR', '2027-12-31'),
    evoc: createLicense(true, 'EVOC', '2027-06-30'),
    emt: createLicense(false, '', ''),
    paramedic: createLicense(true, 'Paramedic', '2027-05-31'),
  },
  {
    id: 1005,
    firstName: 'Nina',
    lastName: 'Brooks',
    phone: '215-555-0105',
    isActive: true,
    notes: 'Test assist crew',
    cpr: createLicense(true, 'CPR', '2027-12-31'),
    evoc: createLicense(false, '', ''),
    emt: createLicense(false, '', ''),
    paramedic: createLicense(false, '', ''),
  },
  {
    id: 1006,
    firstName: 'Ethan',
    lastName: 'Reed',
    phone: '215-555-0106',
    isActive: true,
    notes: 'Test assist crew',
    cpr: createLicense(true, 'CPR', '2027-12-31'),
    evoc: createLicense(false, '', ''),
    emt: createLicense(false, '', ''),
    paramedic: createLicense(false, '', ''),
  },
];

/*
  Default empty license object.
  This helps avoid repeating the same structure for every certification block.
*/
const emptyLicense = {
  hasLicense: false,
  licenseName: '',
  expirationDate: '',
};

/*
  Initial form state for a new employee.
  CPR is added as a required-by-business certification,
  but the app will only warn if it is missing or expired.
*/
const initialFormData = {
  firstName: '',
  lastName: '',
  phone: '',
  isActive: true,
  notes: '',

  cpr: { ...emptyLicense },
  evoc: { ...emptyLicense },
  emt: { ...emptyLicense },
  paramedic: { ...emptyLicense },
};

function EmployeesPage() {
  /*
    Employee list state.
    Data is loaded from localStorage on first render.
  */
  const [employees, setEmployees] = useState(() => {
    try {
      const savedEmployees = localStorage.getItem(STORAGE_KEY);

      if (!savedEmployees) {
        return [];
      }

      const parsedEmployees = JSON.parse(savedEmployees);
      return Array.isArray(parsedEmployees) ? parsedEmployees : [];
    } catch (error) {
      console.error('Failed to load employees from localStorage:', error);
      return [];
    }
  });

  /*
    Tracks which employee is currently being edited.
    If null, the form works in "add new employee" mode.
  */
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);

  /*
    Current form state for add/edit employee form.
  */
  const [formData, setFormData] = useState(initialFormData);

  /*
    Save employee list to localStorage every time it changes.
  */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(employees));
    } catch (error) {
      console.error('Failed to save employees to localStorage:', error);
    }
  }, [employees]);

  /*
    Handles simple top-level form fields like firstName, lastName, phone, etc.
  */
  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  /*
    Handles nested license fields such as cpr, evoc, emt, paramedic.
    Example: hasLicense, licenseName, expirationDate.
  */
  const handleLicenseChange = (event, licenseType) => {
    const { name, value, type, checked } = event.target;

    setFormData((prev) => ({
      ...prev,
      [licenseType]: {
        ...prev[licenseType],
        [name]: type === 'checkbox' ? checked : value,
      },
    }));
  };

  /*
    Resets the form back to the initial state
    and exits edit mode.
  */
  const resetForm = () => {
    setFormData(initialFormData);
    setEditingEmployeeId(null);
  };

  /*
    Ensures that older employee records still work
    even if they were created before CPR was added.
  */
  const normalizeLicense = (license) => {
    if (!license) {
      return { ...emptyLicense };
    }

    return {
      hasLicense: Boolean(license.hasLicense),
      licenseName: license.licenseName || '',
      expirationDate: license.expirationDate || '',
    };
  };

  /*
    Loads selected employee data into the form for editing.
  */
  const handleEdit = (employee) => {
    setFormData({
      firstName: employee.firstName || '',
      lastName: employee.lastName || '',
      phone: employee.phone || '',
      isActive: Boolean(employee.isActive),
      notes: employee.notes || '',

      cpr: normalizeLicense(employee.cpr),
      evoc: normalizeLicense(employee.evoc),
      emt: normalizeLicense(employee.emt),
      paramedic: normalizeLicense(employee.paramedic),
    });

    setEditingEmployeeId(employee.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /*
    Calculates human-readable status for a certification.
    Used for CPR, EVOC, EMT, and Paramedic.
  */
  const getLicenseStatus = (license) => {
    if (!license || !license.hasLicense) {
      return 'No License';
    }

    if (!license.expirationDate) {
      return 'Active';
    }

    const today = new Date();
    const expirationDate = new Date(`${license.expirationDate}T23:59:59`);
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
    Maps status values to Bootstrap badge classes.
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
    CPR is required by business rules for all employees.
    This helper returns the warning message only.
    It does NOT block any role and does NOT remove allowed positions.
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
    Determines which positions the employee is allowed to work.
    CPR does NOT control positions here.
    It is tracked separately as a compliance warning only.
  */
  const getAllowedPositions = (employee) => {
    const positions = ['Assist'];

    if (employee.evoc?.hasLicense) {
      positions.push('Driver');
    }

    if (employee.emt?.hasLicense) {
      positions.push('EMT');
    }

    if (employee.paramedic?.hasLicense) {
      positions.push('Paramedic');
    }

    return positions;
  };

  /*
    Renders allowed positions as Bootstrap badges.
  */
  const renderAllowedPositions = (employee) => {
    const positions = getAllowedPositions(employee);

    return (
      <div className="d-flex flex-wrap gap-1">
        {positions.map((position) => (
          <span key={position} className="badge text-bg-primary">
            {position}
          </span>
        ))}
      </div>
    );
  };

  /*
    Renders a license summary block:
    status badge, license name, and expiration date.
  */
  const renderLicenseSummary = (license) => {
    const normalizedLicense = normalizeLicense(license);
    const status = getLicenseStatus(normalizedLicense);

    return (
      <div>
        <span className={`badge ${getStatusBadgeClass(status)} me-2`}>
          {status}
        </span>

        {normalizedLicense.hasLicense && (
          <div className="small mt-1">
            <div>{normalizedLicense.licenseName.trim() || 'Unnamed License'}</div>
            <div>
              {normalizedLicense.expirationDate
                ? `Exp: ${normalizedLicense.expirationDate}`
                : 'No expiration date'}
            </div>
          </div>
        )}
      </div>
    );
  };

  /*
    Renders CPR warning badge.
    Empty string means no warning.
  */
  const renderCprWarning = (employee) => {
    const warning = getCprWarning(employee);

    if (!warning) {
      return <span className="badge text-bg-success">OK</span>;
    }

    if (warning === 'CPR Expiring Soon') {
      return <span className="badge text-bg-warning">{warning}</span>;
    }

    return <span className="badge text-bg-danger">{warning}</span>;
  };

  /*
    Handles form submission for both add and edit modes.
    CPR is not a blocking validation here.
    But user gets a warning if CPR is missing or expired.
  */
  const handleSubmit = (event) => {
    event.preventDefault();

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      alert('First Name and Last Name are required.');
      return;
    }

    const employeePayload = {
      id: editingEmployeeId || Date.now(),
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      phone: formData.phone.trim(),
      isActive: formData.isActive,
      notes: formData.notes.trim(),

      cpr: normalizeLicense(formData.cpr),
      evoc: normalizeLicense(formData.evoc),
      emt: normalizeLicense(formData.emt),
      paramedic: normalizeLicense(formData.paramedic),
    };

    const cprWarning = getCprWarning(employeePayload);

    if (cprWarning) {
      const confirmed = window.confirm(
        `Warning: ${cprWarning}. CPR is expected for all employees. Do you want to save this record anyway?`
      );

      if (!confirmed) {
        return;
      }
    }

    if (editingEmployeeId) {
      setEmployees((prev) =>
        prev.map((employee) =>
          employee.id === editingEmployeeId ? employeePayload : employee
        )
      );
    } else {
      setEmployees((prev) => [...prev, employeePayload]);
    }

    resetForm();
  };

  /*
    Deletes one employee by id.
    If the deleted employee is currently being edited,
    the form is reset.
  */
  const handleDelete = (employeeId) => {
    const isEditingCurrentEmployee = editingEmployeeId === employeeId;

    setEmployees((prev) => prev.filter((employee) => employee.id !== employeeId));

    if (isEditingCurrentEmployee) {
      resetForm();
    }
  };

  /*
    Deletes all employees from state and localStorage.
  */
  const handleClearAllEmployees = () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete all employees from local storage?'
    );

    if (!confirmed) {
      return;
    }

    setEmployees([]);
    resetForm();
    localStorage.removeItem(STORAGE_KEY);
  };

  /*
    Loads predefined test employees.
    Also clears saved Crew Planner units to avoid broken employee references.
  */
  const handleLoadTestEmployees = () => {
    const confirmed = window.confirm(
      employees.length > 0
        ? 'This will replace current employees and clear all planned units. Continue?'
        : 'Load test employees and clear all planned units?'
    );

    if (!confirmed) {
      return;
    }

    setEmployees(TEST_EMPLOYEES);
    resetForm();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(TEST_EMPLOYEES));
    localStorage.removeItem(UNITS_STORAGE_KEY);
  };

  return (
    <div className="container mt-4">
      {/* Page title and short description */}
      <div className="mb-4">
        <h1 className="mb-2">Employees</h1>
        <p className="text-muted mb-0">
          Add and manage employee records for future scheduling and crew planning.
        </p>
      </div>

      {/* Employee form card */}
      <div className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            {editingEmployeeId ? 'Edit Employee' : 'Add Employee'}
          </h5>

          {editingEmployeeId && (
            <span className="badge text-bg-info">Editing Mode</span>
          )}
        </div>

        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              {/* First name field */}
              <div className="col-md-6">
                <label htmlFor="firstName" className="form-label">
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  className="form-control"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="e.g. John"
                />
              </div>

              {/* Last name field */}
              <div className="col-md-6">
                <label htmlFor="lastName" className="form-label">
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  className="form-control"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="e.g. Smith"
                />
              </div>

              {/* Phone number field */}
              <div className="col-md-6">
                <label htmlFor="phone" className="form-label">
                  Phone Number
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="text"
                  className="form-control"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="e.g. 555-123-4567"
                />
              </div>

              {/* Active employee checkbox */}
              <div className="col-md-6 d-flex align-items-end">
                <div className="form-check mb-2">
                  <input
                    id="isActive"
                    name="isActive"
                    type="checkbox"
                    className="form-check-input"
                    checked={formData.isActive}
                    onChange={handleChange}
                  />
                  <label htmlFor="isActive" className="form-check-label">
                    Active Employee
                  </label>
                </div>
              </div>

              {/* Notes field */}
              <div className="col-12">
                <label htmlFor="notes" className="form-label">
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  className="form-control"
                  rows="3"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Optional notes about this employee"
                />
              </div>

              {/* License section header */}
              <div className="col-12">
                <hr />
                <h5 className="mb-3">Licenses / Certifications</h5>
              </div>

              {/* CPR certification block */}
              <div className="col-12">
                <div className="card border-light-subtle">
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h6 className="mb-0">CPR</h6>
                      <span className="badge text-bg-warning">
                        Required for all employees
                      </span>
                    </div>

                    <div className="row g-3">
                      <div className="col-md-3">
                        <div className="form-check mt-2">
                          <input
                            id="cprHasLicense"
                            name="hasLicense"
                            type="checkbox"
                            className="form-check-input"
                            checked={formData.cpr.hasLicense}
                            onChange={(event) => handleLicenseChange(event, 'cpr')}
                          />
                          <label htmlFor="cprHasLicense" className="form-check-label">
                            Has CPR
                          </label>
                        </div>
                      </div>

                      <div className="col-md-5">
                        <label htmlFor="cprLicenseName" className="form-label">
                          Certification Name
                        </label>
                        <input
                          id="cprLicenseName"
                          name="licenseName"
                          type="text"
                          className="form-control"
                          value={formData.cpr.licenseName}
                          onChange={(event) => handleLicenseChange(event, 'cpr')}
                          placeholder="e.g. BLS / CPR Certification"
                          disabled={!formData.cpr.hasLicense}
                        />
                      </div>

                      <div className="col-md-4">
                        <label htmlFor="cprExpirationDate" className="form-label">
                          Expiration Date
                        </label>
                        <input
                          id="cprExpirationDate"
                          name="expirationDate"
                          type="date"
                          className="form-control"
                          value={formData.cpr.expirationDate}
                          onChange={(event) => handleLicenseChange(event, 'cpr')}
                          disabled={!formData.cpr.hasLicense}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* EVOC certification block */}
              <div className="col-12">
                <div className="card border-light-subtle">
                  <div className="card-body">
                    <h6 className="mb-3">EVOC</h6>

                    <div className="row g-3">
                      <div className="col-md-3">
                        <div className="form-check mt-2">
                          <input
                            id="evocHasLicense"
                            name="hasLicense"
                            type="checkbox"
                            className="form-check-input"
                            checked={formData.evoc.hasLicense}
                            onChange={(event) => handleLicenseChange(event, 'evoc')}
                          />
                          <label htmlFor="evocHasLicense" className="form-check-label">
                            Has EVOC
                          </label>
                        </div>
                      </div>

                      <div className="col-md-5">
                        <label htmlFor="evocLicenseName" className="form-label">
                          Certification Name
                        </label>
                        <input
                          id="evocLicenseName"
                          name="licenseName"
                          type="text"
                          className="form-control"
                          value={formData.evoc.licenseName}
                          onChange={(event) => handleLicenseChange(event, 'evoc')}
                          placeholder="e.g. EVOC Certification"
                          disabled={!formData.evoc.hasLicense}
                        />
                      </div>

                      <div className="col-md-4">
                        <label htmlFor="evocExpirationDate" className="form-label">
                          Expiration Date
                        </label>
                        <input
                          id="evocExpirationDate"
                          name="expirationDate"
                          type="date"
                          className="form-control"
                          value={formData.evoc.expirationDate}
                          onChange={(event) => handleLicenseChange(event, 'evoc')}
                          disabled={!formData.evoc.hasLicense}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* EMT certification block */}
              <div className="col-12">
                <div className="card border-light-subtle">
                  <div className="card-body">
                    <h6 className="mb-3">EMT</h6>

                    <div className="row g-3">
                      <div className="col-md-3">
                        <div className="form-check mt-2">
                          <input
                            id="emtHasLicense"
                            name="hasLicense"
                            type="checkbox"
                            className="form-check-input"
                            checked={formData.emt.hasLicense}
                            onChange={(event) => handleLicenseChange(event, 'emt')}
                          />
                          <label htmlFor="emtHasLicense" className="form-check-label">
                            Has EMT
                          </label>
                        </div>
                      </div>

                      <div className="col-md-5">
                        <label htmlFor="emtLicenseName" className="form-label">
                          Certification Name
                        </label>
                        <input
                          id="emtLicenseName"
                          name="licenseName"
                          type="text"
                          className="form-control"
                          value={formData.emt.licenseName}
                          onChange={(event) => handleLicenseChange(event, 'emt')}
                          placeholder="e.g. State EMT License"
                          disabled={!formData.emt.hasLicense}
                        />
                      </div>

                      <div className="col-md-4">
                        <label htmlFor="emtExpirationDate" className="form-label">
                          Expiration Date
                        </label>
                        <input
                          id="emtExpirationDate"
                          name="expirationDate"
                          type="date"
                          className="form-control"
                          value={formData.emt.expirationDate}
                          onChange={(event) => handleLicenseChange(event, 'emt')}
                          disabled={!formData.emt.hasLicense}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Paramedic certification block */}
              <div className="col-12">
                <div className="card border-light-subtle">
                  <div className="card-body">
                    <h6 className="mb-3">Paramedic</h6>

                    <div className="row g-3">
                      <div className="col-md-3">
                        <div className="form-check mt-2">
                          <input
                            id="paramedicHasLicense"
                            name="hasLicense"
                            type="checkbox"
                            className="form-check-input"
                            checked={formData.paramedic.hasLicense}
                            onChange={(event) =>
                              handleLicenseChange(event, 'paramedic')
                            }
                          />
                          <label
                            htmlFor="paramedicHasLicense"
                            className="form-check-label"
                          >
                            Has Paramedic
                          </label>
                        </div>
                      </div>

                      <div className="col-md-5">
                        <label htmlFor="paramedicLicenseName" className="form-label">
                          Certification Name
                        </label>
                        <input
                          id="paramedicLicenseName"
                          name="licenseName"
                          type="text"
                          className="form-control"
                          value={formData.paramedic.licenseName}
                          onChange={(event) =>
                            handleLicenseChange(event, 'paramedic')
                          }
                          placeholder="e.g. State Paramedic License"
                          disabled={!formData.paramedic.hasLicense}
                        />
                      </div>

                      <div className="col-md-4">
                        <label
                          htmlFor="paramedicExpirationDate"
                          className="form-label"
                        >
                          Expiration Date
                        </label>
                        <input
                          id="paramedicExpirationDate"
                          name="expirationDate"
                          type="date"
                          className="form-control"
                          value={formData.paramedic.expirationDate}
                          onChange={(event) =>
                            handleLicenseChange(event, 'paramedic')
                          }
                          disabled={!formData.paramedic.hasLicense}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form action buttons */}
              <div className="col-12 d-flex gap-2">
                <button type="submit" className="btn btn-primary">
                  {editingEmployeeId ? 'Update Employee' : 'Add Employee'}
                </button>

                {editingEmployeeId && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={resetForm}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Employee list card */}
      <div className="card shadow-sm">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Employee List</h5>

          <div className="d-flex align-items-center gap-2">
            <span className="badge text-bg-secondary">{employees.length}</span>

            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={handleLoadTestEmployees}
            >
              Load Test Crew
            </button>

            {employees.length > 0 && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={handleClearAllEmployees}
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        <div className="card-body">
          {employees.length === 0 ? (
            <p className="text-muted mb-0">No employees added yet.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped table-bordered align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Allowed Positions</th>
                    <th>CPR Warning</th>
                    <th>CPR</th>
                    <th>EVOC</th>
                    <th>EMT</th>
                    <th>Paramedic</th>
                    <th>Notes</th>
                    <th style={{ width: '170px' }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      {/* Employee full name */}
                      <td>
                        {employee.firstName} {employee.lastName}
                      </td>

                      {/* Phone number */}
                      <td>{employee.phone || '—'}</td>

                      {/* Employee active/inactive status */}
                      <td>
                        <span
                          className={`badge ${
                            employee.isActive ? 'text-bg-success' : 'text-bg-secondary'
                          }`}
                        >
                          {employee.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Role summary */}
                      <td>{renderAllowedPositions(employee)}</td>

                      {/* CPR compliance warning */}
                      <td>{renderCprWarning(employee)}</td>

                      {/* CPR details */}
                      <td>{renderLicenseSummary(employee.cpr)}</td>

                      {/* EVOC details */}
                      <td>{renderLicenseSummary(employee.evoc)}</td>

                      {/* EMT details */}
                      <td>{renderLicenseSummary(employee.emt)}</td>

                      {/* Paramedic details */}
                      <td>{renderLicenseSummary(employee.paramedic)}</td>

                      {/* Notes */}
                      <td>{employee.notes || '—'}</td>

                      {/* Action buttons */}
                      <td>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleEdit(employee)}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDelete(employee.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmployeesPage;