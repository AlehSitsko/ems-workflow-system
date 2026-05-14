import React, { useEffect, useState } from "react";

import {
  createEmployee,
  deleteEmployee,
  getEmployees,
  updateEmployee,
} from "../api/employeesApi";

/*
  Separate storage key for Crew Planner units.
  This allows us to clear saved crews when loading test employees.
*/
const UNITS_STORAGE_KEY = "planned_units";

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
    firstName: "John",
    lastName: "Carter",
    phone: "215-555-0101",
    email: "john.carter@example.com",
    employeeNumber: "EMP-101",
    hireDate: "2024-01-15",
    role: "EMT",
    status: "active",
    isActive: true,
    notes: "Test BLS driver / EMT",
    cpr: createLicense(true, "CPR", "2027-12-31"),
    evoc: createLicense(true, "EVOC", "2027-11-30"),
    emt: createLicense(true, "EMT", "2027-10-31"),
    paramedic: createLicense(false, "", ""),
  },
  {
    firstName: "Mike",
    lastName: "Dalton",
    phone: "215-555-0102",
    email: "mike.dalton@example.com",
    employeeNumber: "EMP-102",
    hireDate: "2024-03-01",
    role: "EMT",
    status: "active",
    isActive: true,
    notes: "Test BLS EMT",
    cpr: createLicense(true, "CPR", "2027-12-31"),
    evoc: createLicense(false, "", ""),
    emt: createLicense(true, "EMT", "2027-08-31"),
    paramedic: createLicense(false, "", ""),
  },
  {
    firstName: "Sarah",
    lastName: "Collins",
    phone: "215-555-0103",
    email: "sarah.collins@example.com",
    employeeNumber: "EMP-201",
    hireDate: "2023-09-10",
    role: "Paramedic",
    status: "active",
    isActive: true,
    notes: "Test ALS medic",
    cpr: createLicense(true, "CPR", "2027-12-31"),
    evoc: createLicense(false, "", ""),
    emt: createLicense(false, "", ""),
    paramedic: createLicense(true, "Paramedic", "2027-07-31"),
  },
  {
    firstName: "Victor",
    lastName: "Hayes",
    phone: "215-555-0104",
    email: "victor.hayes@example.com",
    employeeNumber: "EMP-202",
    hireDate: "2023-11-20",
    role: "Paramedic",
    status: "active",
    isActive: true,
    notes: "Test ALS driver / medic",
    cpr: createLicense(true, "CPR", "2027-12-31"),
    evoc: createLicense(true, "EVOC", "2027-06-30"),
    emt: createLicense(false, "", ""),
    paramedic: createLicense(true, "Paramedic", "2027-05-31"),
  },
  {
    firstName: "Nina",
    lastName: "Brooks",
    phone: "215-555-0105",
    email: "nina.brooks@example.com",
    employeeNumber: "EMP-301",
    hireDate: "2025-02-05",
    role: "Driver",
    status: "active",
    isActive: true,
    notes: "Test assist crew",
    cpr: createLicense(true, "CPR", "2027-12-31"),
    evoc: createLicense(false, "", ""),
    emt: createLicense(false, "", ""),
    paramedic: createLicense(false, "", ""),
  },
  {
    firstName: "Ethan",
    lastName: "Reed",
    phone: "215-555-0106",
    email: "ethan.reed@example.com",
    employeeNumber: "EMP-302",
    hireDate: "2025-04-12",
    role: "Driver",
    status: "active",
    isActive: true,
    notes: "Test assist crew",
    cpr: createLicense(true, "CPR", "2027-12-31"),
    evoc: createLicense(false, "", ""),
    emt: createLicense(false, "", ""),
    paramedic: createLicense(false, "", ""),
  },
];

/*
  Default empty license object.
*/
const emptyLicense = {
  hasLicense: false,
  licenseName: "",
  expirationDate: "",
};

/*
  Initial form state for a new employee.
*/
const initialFormData = {
  firstName: "",
  lastName: "",

  phone: "",
  email: "",

  employeeNumber: "",
  hireDate: "",

  role: "EMT",
  status: "active",

  isActive: true,
  notes: "",

  cpr: { ...emptyLicense },
  evoc: { ...emptyLicense },
  emt: { ...emptyLicense },
  paramedic: { ...emptyLicense },
};

function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [formData, setFormData] = useState(initialFormData);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  /*
    Load employees from backend.
  */
  const loadEmployees = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (err) {
      console.error("Failed to load employees:", err);
      setError(err.message || "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  };

  /*
    Load employees when the page opens.
  */
  useEffect(() => {
    loadEmployees();
  }, []);

  /*
    Handles simple top-level form fields like firstName, lastName, phone, etc.
  */
  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  /*
    Handles nested license fields such as cpr, evoc, emt, paramedic.
  */
  const handleLicenseChange = (event, licenseType) => {
    const { name, value, type, checked } = event.target;

    setFormData((prev) => ({
      ...prev,
      [licenseType]: {
        ...prev[licenseType],
        [name]: type === "checkbox" ? checked : value,
      },
    }));
  };

  /*
    Resets the form back to the initial state and exits edit mode.
  */
  const resetForm = () => {
    setFormData(initialFormData);
    setEditingEmployeeId(null);
  };

  /*
    Ensures that older employee records still work.
  */
  const normalizeLicense = (license) => {
    if (!license) {
      return { ...emptyLicense };
    }

    return {
      hasLicense: Boolean(license.hasLicense),
      licenseName: license.licenseName || "",
      expirationDate: license.expirationDate || "",
    };
  };

  /*
    Loads selected employee data into the form for editing.
  */
  const handleEdit = (employee) => {
    setFormData({
      firstName: employee.firstName || "",
      lastName: employee.lastName || "",

      phone: employee.phone || "",
      email: employee.email || "",

      employeeNumber: employee.employeeNumber || "",
      hireDate: employee.hireDate || "",

      role: employee.role || "EMT",
      status: employee.status || "active",

      isActive: Boolean(employee.isActive),
      notes: employee.notes || "",

      cpr: normalizeLicense(employee.cpr),
      evoc: normalizeLicense(employee.evoc),
      emt: normalizeLicense(employee.emt),
      paramedic: normalizeLicense(employee.paramedic),
    });

    setEditingEmployeeId(employee.id);
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /*
    Calculates human-readable status for a certification.
  */
  const getLicenseStatus = (license) => {
    if (!license || !license.hasLicense) {
      return "No License";
    }

    if (!license.expirationDate) {
      return "Active";
    }

    const today = new Date();
    const expirationDate = new Date(`${license.expirationDate}T23:59:59`);
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
    Maps status values to Bootstrap badge classes.
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
    Maps operational employee status values to Bootstrap badge classes.
  */
  const getEmployeeStatusBadgeClass = (status) => {
    switch (status) {
      case "active":
        return "text-bg-success";
      case "vacation":
        return "text-bg-info";
      case "sick":
        return "text-bg-warning";
      case "suspended":
        return "text-bg-danger";
      case "terminated":
        return "text-bg-dark";
      default:
        return "text-bg-secondary";
    }
  };

  /*
    CPR is required by business rules for all employees.
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
    Determines which positions the employee is allowed to work.
  */
  const getAllowedPositions = (employee) => {
    const positions = ["Assist"];

    if (employee.evoc?.hasLicense) {
      positions.push("Driver");
    }

    if (employee.emt?.hasLicense) {
      positions.push("EMT");
    }

    if (employee.paramedic?.hasLicense) {
      positions.push("Paramedic");
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
    Renders a license summary block.
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
            <div>{normalizedLicense.licenseName.trim() || "Unnamed License"}</div>
            <div>
              {normalizedLicense.expirationDate
                ? `Exp: ${normalizedLicense.expirationDate}`
                : "No expiration date"}
            </div>
          </div>
        )}
      </div>
    );
  };

  /*
    Renders CPR warning badge.
  */
  const renderCprWarning = (employee) => {
    const warning = getCprWarning(employee);

    if (!warning) {
      return <span className="badge text-bg-success">OK</span>;
    }

    if (warning === "CPR Expiring Soon") {
      return <span className="badge text-bg-warning">{warning}</span>;
    }

    return <span className="badge text-bg-danger">{warning}</span>;
  };

  /*
    Handles form submission for both add and edit modes.
  */
  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError("First Name and Last Name are required.");
      return;
    }

    const employeePayload = {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),

      phone: formData.phone.trim(),
      email: formData.email.trim(),

      employeeNumber: formData.employeeNumber.trim(),
      hireDate: formData.hireDate,

      role: formData.role,
      status: formData.status,

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

    setLoading(true);

    try {
      if (editingEmployeeId) {
        await updateEmployee(editingEmployeeId, employeePayload);
        setMessage("Employee updated successfully.");
      } else {
        await createEmployee(employeePayload);
        setMessage("Employee created successfully.");
      }

      resetForm();
      await loadEmployees();
    } catch (err) {
      console.error("Failed to save employee:", err);
      setError(err.message || "Failed to save employee.");
    } finally {
      setLoading(false);
    }
  };

  /*
    Deletes one employee by id.
  */
  const handleDelete = async (employeeId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this employee?"
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      await deleteEmployee(employeeId);

      if (editingEmployeeId === employeeId) {
        resetForm();
      }

      setMessage("Employee deleted successfully.");
      await loadEmployees();
    } catch (err) {
      console.error("Failed to delete employee:", err);
      setError(err.message || "Failed to delete employee.");
    } finally {
      setLoading(false);
    }
  };

  /*
    Loads predefined test employees into the backend.
  */
  const handleLoadTestEmployees = async () => {
    const confirmed = window.confirm(
      employees.length > 0
        ? "This will add test employees and clear all planned units. Continue?"
        : "Load test employees and clear all planned units?"
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      for (const employee of TEST_EMPLOYEES) {
        await createEmployee(employee);
      }

      localStorage.removeItem(UNITS_STORAGE_KEY);
      resetForm();
      setMessage("Test employees loaded successfully.");
      await loadEmployees();
    } catch (err) {
      console.error("Failed to load test employees:", err);
      setError(err.message || "Failed to load test employees.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="mb-4">
        <h1 className="mb-2">Employees</h1>
        <p className="text-muted mb-0">
          Add and manage employee records for future scheduling and crew planning.
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {message && <div className="alert alert-success">{message}</div>}

      <div className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">
            {editingEmployeeId ? "Edit Employee" : "Add Employee"}
          </h5>

          {editingEmployeeId && (
            <span className="badge text-bg-info">Editing Mode</span>
          )}
        </div>

        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
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
                  disabled={loading}
                />
              </div>

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
                  disabled={loading}
                />
              </div>

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
                  disabled={loading}
                />
              </div>

              <div className="col-md-6">
                <label htmlFor="email" className="form-label">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="form-control"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="e.g. john@example.com"
                  disabled={loading}
                />
              </div>

              <div className="col-md-6">
                <label htmlFor="employeeNumber" className="form-label">
                  Employee Number
                </label>
                <input
                  id="employeeNumber"
                  name="employeeNumber"
                  type="text"
                  className="form-control"
                  value={formData.employeeNumber}
                  onChange={handleChange}
                  placeholder="e.g. EMT-102"
                  disabled={loading}
                />
              </div>

              <div className="col-md-6">
                <label htmlFor="hireDate" className="form-label">
                  Hire Date
                </label>
                <input
                  id="hireDate"
                  name="hireDate"
                  type="date"
                  className="form-control"
                  value={formData.hireDate}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="col-md-3">
                <label htmlFor="role" className="form-label">
                  Role
                </label>
                <select
                  id="role"
                  name="role"
                  className="form-select"
                  value={formData.role}
                  onChange={handleChange}
                  disabled={loading}
                >
                  <option value="EMT">EMT</option>
                  <option value="Paramedic">Paramedic</option>
                  <option value="Dispatcher">Dispatcher</option>
                  <option value="Driver">Driver</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Manager">Manager</option>
                </select>
              </div>

              <div className="col-md-3">
                <label htmlFor="status" className="form-label">
                  Employee Status
                </label>
                <select
                  id="status"
                  name="status"
                  className="form-select"
                  value={formData.status}
                  onChange={handleChange}
                  disabled={loading}
                >
                  <option value="active">Active</option>
                  <option value="vacation">Vacation</option>
                  <option value="sick">Sick</option>
                  <option value="suspended">Suspended</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>

              <div className="col-md-6 d-flex align-items-end">
                <div className="form-check mb-2">
                  <input
                    id="isActive"
                    name="isActive"
                    type="checkbox"
                    className="form-check-input"
                    checked={formData.isActive}
                    onChange={handleChange}
                    disabled={loading}
                  />
                  <label htmlFor="isActive" className="form-check-label">
                    Active Employee
                  </label>
                </div>
              </div>

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
                  disabled={loading}
                />
              </div>

              <div className="col-12">
                <hr />
                <h5 className="mb-3">Licenses / Certifications</h5>
              </div>

              {["cpr", "evoc", "emt", "paramedic"].map((licenseType) => (
                <div className="col-12" key={licenseType}>
                  <div className="card border-light-subtle">
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="mb-0 text-uppercase">{licenseType}</h6>

                        {licenseType === "cpr" && (
                          <span className="badge text-bg-warning">
                            Required for all employees
                          </span>
                        )}
                      </div>

                      <div className="row g-3">
                        <div className="col-md-3">
                          <div className="form-check mt-2">
                            <input
                              id={`${licenseType}HasLicense`}
                              name="hasLicense"
                              type="checkbox"
                              className="form-check-input"
                              checked={formData[licenseType].hasLicense}
                              onChange={(event) =>
                                handleLicenseChange(event, licenseType)
                              }
                              disabled={loading}
                            />
                            <label
                              htmlFor={`${licenseType}HasLicense`}
                              className="form-check-label"
                            >
                              Has {licenseType.toUpperCase()}
                            </label>
                          </div>
                        </div>

                        <div className="col-md-5">
                          <label
                            htmlFor={`${licenseType}LicenseName`}
                            className="form-label"
                          >
                            Certification Name
                          </label>
                          <input
                            id={`${licenseType}LicenseName`}
                            name="licenseName"
                            type="text"
                            className="form-control"
                            value={formData[licenseType].licenseName}
                            onChange={(event) =>
                              handleLicenseChange(event, licenseType)
                            }
                            placeholder={`e.g. ${licenseType.toUpperCase()} Certification`}
                            disabled={!formData[licenseType].hasLicense || loading}
                          />
                        </div>

                        <div className="col-md-4">
                          <label
                            htmlFor={`${licenseType}ExpirationDate`}
                            className="form-label"
                          >
                            Expiration Date
                          </label>
                          <input
                            id={`${licenseType}ExpirationDate`}
                            name="expirationDate"
                            type="date"
                            className="form-control"
                            value={formData[licenseType].expirationDate}
                            onChange={(event) =>
                              handleLicenseChange(event, licenseType)
                            }
                            disabled={!formData[licenseType].hasLicense || loading}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="col-12 d-flex gap-2">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {editingEmployeeId ? "Update Employee" : "Add Employee"}
                </button>

                {editingEmployeeId && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={resetForm}
                    disabled={loading}
                  >
                    Cancel Edit
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-outline-info"
                  onClick={loadEmployees}
                  disabled={loading}
                >
                  Refresh
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Employee List</h5>

          <div className="d-flex align-items-center gap-2">
            <span className="badge text-bg-secondary">{employees.length}</span>

            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={handleLoadTestEmployees}
              disabled={loading}
            >
              Load Test Crew
            </button>
          </div>
        </div>

        <div className="card-body">
          {loading && employees.length === 0 ? (
            <p className="text-muted mb-0">Loading employees...</p>
          ) : employees.length === 0 ? (
            <p className="text-muted mb-0">No employees added yet.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped table-bordered align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Employee #</th>
                    <th>Hire Date</th>
                    <th>Role</th>
                    <th>Employee Status</th>
                    <th>Active</th>
                    <th>Allowed Positions</th>
                    <th>CPR Warning</th>
                    <th>CPR</th>
                    <th>EVOC</th>
                    <th>EMT</th>
                    <th>Paramedic</th>
                    <th>Notes</th>
                    <th style={{ width: "170px" }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        {employee.firstName} {employee.lastName}
                      </td>

                      <td>{employee.phone || "—"}</td>

                      <td>{employee.email || "—"}</td>

                      <td>{employee.employeeNumber || "—"}</td>

                      <td>{employee.hireDate || "—"}</td>

                      <td>{employee.role || "—"}</td>

                      <td>
                        <span
                          className={`badge ${getEmployeeStatusBadgeClass(
                            employee.status || "active"
                          )}`}
                        >
                          {employee.status || "active"}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`badge ${
                            employee.isActive
                              ? "text-bg-success"
                              : "text-bg-secondary"
                          }`}
                        >
                          {employee.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td>{renderAllowedPositions(employee)}</td>

                      <td>{renderCprWarning(employee)}</td>

                      <td>{renderLicenseSummary(employee.cpr)}</td>

                      <td>{renderLicenseSummary(employee.evoc)}</td>

                      <td>{renderLicenseSummary(employee.emt)}</td>

                      <td>{renderLicenseSummary(employee.paramedic)}</td>

                      <td>{employee.notes || "—"}</td>

                      <td>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleEdit(employee)}
                            disabled={loading}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDelete(employee.id)}
                            disabled={loading}
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