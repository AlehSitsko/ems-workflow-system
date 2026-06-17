import React, { useEffect, useState } from "react";
import {
  FaBriefcaseMedical,
  FaClock,
  FaEdit,
  FaFileAlt,
  FaIdBadge,
  FaPlus,
  FaRedo,
  FaTimes,
  FaTrash,
  FaUserCheck,
  FaUsers,
  FaVial,
} from "react-icons/fa";

import {
  createEmployee,
  deleteEmployee,
  getEmployees,
  updateEmployee,
} from "../api/employeesApi";

import { getCurrentUser } from "../api/authApi";
import TimePayTab from "../components/TimePayTab";
import DocumentsTab from "../components/DocumentsTab";

import {
  getEmployeeRoleClass,
  getEmployeeRoleLabel,
} from "../utils/employeeRoleUtils";

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
  kioskPin: "",

  cpr: { ...emptyLicense },
  evoc: { ...emptyLicense },
  emt: { ...emptyLicense },
  paramedic: { ...emptyLicense },
};

function EmployeesPage() {
  const currentUser = getCurrentUser();
  const [employees, setEmployees] = useState([]);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [drawerTab, setDrawerTab] = useState("profile"); // "profile" | "timepay" | "documents"

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
    Resets the form back to the initial state, exits edit mode, and closes the drawer.
  */
  const resetForm = () => {
    setFormData(initialFormData);
    setEditingEmployeeId(null);
    setShowEmployeeForm(false);
    setDrawerTab("profile");
  };

  /*
    Opens the drawer in add mode.
  */
  const handleShowAddForm = () => {
    setFormData(initialFormData);
    setEditingEmployeeId(null);
    setMessage("");
    setError("");
    setShowEmployeeForm(true);
  };

  /*
    Loads selected employee data into the drawer for editing.
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
      kioskPin: employee.kioskPin || "",

      cpr: normalizeLicense(employee.cpr),
      evoc: normalizeLicense(employee.evoc),
      emt: normalizeLicense(employee.emt),
      paramedic: normalizeLicense(employee.paramedic),
    });

    setEditingEmployeeId(employee.id);
    setShowEmployeeForm(true);
    setMessage("");
    setError("");
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
    Maps certification status values to Bootstrap badge classes.
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
    Renders an employee role badge using centralized role colors.
  */
  const renderEmployeeRoleBadge = (role) => (
    <span className={`employee-role-badge ${getEmployeeRoleClass(role)}`}>
      {getEmployeeRoleLabel(role)}
    </span>
  );

  /*
    Renders allowed positions as role-style badges.
  */
  const renderAllowedPositions = (employee) => {
    const positions = getAllowedPositions(employee);

    return (
      <div className="employee-card-badges">
        {positions.map((position) => (
          <span
            key={position}
            className={`employee-role-badge ${getEmployeeRoleClass(position)}`}
          >
            {getEmployeeRoleLabel(position)}
          </span>
        ))}
      </div>
    );
  };

  /*
    Renders a compact license badge in employee cards.
  */
  const renderLicenseBadge = (licenseType, license) => {
    const normalizedLicense = normalizeLicense(license);
    const status = getLicenseStatus(normalizedLicense);

    return (
      <div className="employee-license-pill">
        <div className="employee-license-name">{licenseType.toUpperCase()}</div>

        <span className={`badge ${getStatusBadgeClass(status)}`}>{status}</span>

        {normalizedLicense.hasLicense && (
          <div className="employee-license-details">
            {normalizedLicense.expirationDate
              ? `Exp: ${normalizedLicense.expirationDate}`
              : "No expiration"}
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
      return <span className="badge text-bg-success">CPR OK</span>;
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

  const activeEmployees = employees.filter((employee) => employee.isActive).length;

  const employeesWithCprWarnings = employees.filter((employee) =>
    getCprWarning(employee)
  ).length;

  return (
    <div className="page-stack">
      <div className="page-summary-grid">
        <div className="page-summary-card">
          <div className="page-summary-icon">
            <FaUsers />
          </div>

          <div>
            <div className="page-summary-value">{employees.length}</div>
            <div className="page-summary-label">Total Employees</div>
          </div>
        </div>

        <div className="page-summary-card">
          <div className="page-summary-icon">
            <FaUserCheck />
          </div>

          <div>
            <div className="page-summary-value">{activeEmployees}</div>
            <div className="page-summary-label">Active Employees</div>
          </div>
        </div>

        <div className="page-summary-card">
          <div className="page-summary-icon warning">
            <FaBriefcaseMedical />
          </div>

          <div>
            <div className="page-summary-value">{employeesWithCprWarnings}</div>
            <div className="page-summary-label">CPR Warnings</div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-0">{error}</div>}

      {message && <div className="alert alert-success mb-0">{message}</div>}

      <section className="content-panel">
        <div className="content-panel-header">
          <div>
            <h4>Employee List</h4>
            <p>Operational staff, certifications, and crew eligibility.</p>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="badge text-bg-secondary">{employees.length}</span>

            <button
              type="button"
              className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1"
              onClick={handleShowAddForm}
              disabled={loading}
            >
              <FaPlus />
              Add Employee
            </button>

            <button
              type="button"
              className="btn btn-sm btn-outline-info d-inline-flex align-items-center gap-1"
              onClick={loadEmployees}
              disabled={loading}
            >
              <FaRedo />
              Refresh
            </button>

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

        {loading && employees.length === 0 ? (
          <div className="empty-state">
            <FaUsers />

            <h5>Loading employees</h5>

            <p>Please wait while employee records are loaded.</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="empty-state">
            <FaUsers />

            <h5>No employees added yet</h5>

            <p>Add an employee manually or load test crew records.</p>
          </div>
        ) : (
          <div className="employee-card-list">
            {employees.map((employee) => (
              <div className="employee-card" key={employee.id} onClick={() => handleEdit(employee)} style={{ cursor: "pointer" }}>
                <div className="employee-card-main">
                  <div className="employee-avatar">
                    {(employee.firstName?.[0] || "E").toUpperCase()}
                  </div>

                  <div>
                    <div className="employee-name">
                      {employee.firstName} {employee.lastName}
                    </div>

                    <div className="employee-muted">
                      #{employee.employeeNumber || "—"} · Hired:{" "}
                      {employee.hireDate || "—"}
                    </div>

                    <div className="employee-card-badges mt-2">
                      {renderEmployeeRoleBadge(employee.role)}

                      <span
                        className={`badge ${getEmployeeStatusBadgeClass(
                          employee.status || "active"
                        )}`}
                      >
                        {employee.status || "active"}
                      </span>

                      <span
                        className={`badge ${
                          employee.isActive
                            ? "text-bg-success"
                            : "text-bg-secondary"
                        }`}
                      >
                        {employee.isActive ? "Active" : "Inactive"}
                      </span>

                      {renderCprWarning(employee)}
                    </div>
                  </div>
                </div>

                <div className="employee-contact">
                  <div>
                    <strong>Phone:</strong> {employee.phone || "—"}
                  </div>

                  <div>
                    <strong>Email:</strong> {employee.email || "—"}
                  </div>

                  <div>
                    <strong>Notes:</strong> {employee.notes || "—"}
                  </div>
                </div>

                <div className="employee-positions">
                  <div className="employee-section-label">Allowed Positions</div>

                  {renderAllowedPositions(employee)}
                </div>

                <div className="employee-license-summary">
                  {renderLicenseBadge("cpr", employee.cpr)}
                  {renderLicenseBadge("evoc", employee.evoc)}
                  {renderLicenseBadge("emt", employee.emt)}
                  {renderLicenseBadge("paramedic", employee.paramedic)}
                </div>

                <div className="employee-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
                    onClick={() => handleEdit(employee)}
                    disabled={loading}
                  >
                    <FaEdit />
                    Edit
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                    onClick={() => handleDelete(employee.id)}
                    disabled={loading}
                  >
                    <FaTrash />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showEmployeeForm && (
        <div className="employee-drawer-overlay">
          <aside
            className="employee-drawer"
            onClick={(event) => event.stopPropagation()}
            style={drawerTab !== "profile" ? { background: "#0d1117" } : undefined}
          >
            <div className="employee-drawer-header" style={drawerTab !== "profile" ? { background: "#0d1117", borderBottom: "1px solid #2a3347", color: "#e9ecef" } : undefined}>
              <div style={{ flex: 1 }}>
                <h4 style={drawerTab !== "profile" ? { color: "#e9ecef" } : undefined}>{editingEmployeeId ? "Edit Employee" : "Add Employee"}</h4>
                {editingEmployeeId && (
                  <div className="d-flex gap-1 mt-2">
                    <button
                      type="button"
                      className={`btn btn-sm ${drawerTab === "profile" ? "btn-primary" : "btn-outline-secondary"}`}
                      style={{ fontSize: 12 }}
                      onClick={() => setDrawerTab("profile")}
                    >
                      <FaIdBadge style={{ marginRight: 4 }} />Profile
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${drawerTab === "timepay" ? "btn-primary" : "btn-outline-secondary"}`}
                      style={{ fontSize: 12 }}
                      onClick={() => setDrawerTab("timepay")}
                    >
                      <FaClock style={{ marginRight: 4 }} />Time & Pay
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${drawerTab === "documents" ? "btn-primary" : "btn-outline-secondary"}`}
                      style={{ fontSize: 12 }}
                      onClick={() => setDrawerTab("documents")}
                    >
                      <FaFileAlt style={{ marginRight: 4 }} />Documents
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={resetForm}
                disabled={loading}
              >
                <FaTimes />
              </button>
            </div>

            {drawerTab === "timepay" && editingEmployeeId ? (
              <div style={{ flex: 1, overflowY: "auto", background: "#0d1117", display: "flex", flexDirection: "column" }}>
                <TimePayTab employeeId={editingEmployeeId} currentUser={currentUser} />
              </div>
            ) : drawerTab === "documents" && editingEmployeeId ? (
              <div style={{ flex: 1, overflowY: "auto", background: "#0d1117", display: "flex", flexDirection: "column" }}>
                <DocumentsTab employeeId={editingEmployeeId} currentUser={currentUser} />
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="employee-drawer-form">
              <div className="employee-drawer-body">
                <div className="employee-form-section">
                  <div className="employee-form-section-header">
                    <span className="employee-form-section-icon">
                      <FaIdBadge />
                    </span>

                    <h5>Basic Information</h5>
                  </div>

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

                    <div className="col-md-4">
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

                    <div className="col-md-4">
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

                    <div className="col-md-4">
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
                        <option value="Assist">Assist</option>
                        <option value="Dispatcher">Dispatcher</option>
                        <option value="Driver">Driver</option>
                        <option value="Supervisor">Supervisor</option>
                        <option value="Manager">Manager</option>
                      </select>
                    </div>

                    <div className="col-md-4">
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

                    <div className="col-md-8 d-flex align-items-end">
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

                    <div className="col-md-6">
                      <label htmlFor="kioskPin" className="form-label">
                        Kiosk PIN
                      </label>
                      <input
                        id="kioskPin"
                        name="kioskPin"
                        type="text"
                        maxLength={6}
                        className="form-control"
                        value={formData.kioskPin}
                        onChange={handleChange}
                        placeholder="4–6 digits"
                        disabled={loading}
                      />
                      <div className="form-text">Used for Kiosk clock in/out</div>
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
                  </div>
                </div>

                <div className="employee-form-section">
                  <div className="employee-form-section-header">
                    <span className="employee-form-section-icon">
                      <FaVial />
                    </span>

                    <h5>Licenses / Certifications</h5>
                  </div>

                  <div className="employee-license-form-grid">
                    {["cpr", "evoc", "emt", "paramedic"].map((licenseType) => {
                      const hasLicense = formData[licenseType].hasLicense;

                      return (
                        <div
                          className="employee-license-form-card"
                          key={licenseType}
                        >
                          <div className="employee-license-form-header">
                            <h6>{licenseType.toUpperCase()}</h6>

                            {licenseType === "cpr" && (
                              <span className="badge text-bg-warning">
                                Required
                              </span>
                            )}
                          </div>

                          <div className="form-check mb-0">
                            <input
                              id={`${licenseType}HasLicense`}
                              name="hasLicense"
                              type="checkbox"
                              className="form-check-input"
                              checked={hasLicense}
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

                          {hasLicense && (
                            <div className="employee-license-extra-fields">
                              <div className="mt-3">
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
                                  disabled={loading}
                                />
                              </div>

                              <div className="mt-3">
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
                                  disabled={loading}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="employee-drawer-footer">
                <button
                  type="submit"
                  className="btn btn-primary d-inline-flex align-items-center gap-2"
                  disabled={loading}
                >
                  <FaPlus />
                  {loading
                    ? "Saving..."
                    : editingEmployeeId
                    ? "Update Employee"
                    : "Add Employee"}
                </button>

                <button
                  type="button"
                  className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
                  onClick={resetForm}
                  disabled={loading}
                >
                  <FaTimes />
                  Cancel
                </button>
              </div>
            </form>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

export default EmployeesPage;