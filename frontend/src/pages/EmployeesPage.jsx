import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaEdit, FaPlus, FaRedo, FaTrash } from "react-icons/fa";

import { useConfirm } from "../components/ui/useConfirm";
import { getEmployees, deleteEmployee } from "../api/employeesApi";
import { getCprWarning, getLicenseStatus } from "../utils/licenseUtils";
import { getEmployeeRoleClass, getEmployeeRoleLabel } from "../utils/employeeRoleUtils";
import { PageHeader, PageSection } from "../components/ui/Page";
import { EmptyState, ErrorState } from "../components/ui/States";
import StatusBadge from "../components/ui/StatusBadge";

const EMPLOYEE_STATUS_TONE = {
  active: "success", vacation: "info", sick: "warning", suspended: "danger", terminated: "neutral",
};

// Positions an employee may work, from held certifications.
function allowedPositions(employee) {
  const positions = ["Assist"];
  if (employee.evoc?.hasLicense) positions.push("Driver");
  if (employee.emt?.hasLicense) positions.push("EMT");
  if (employee.paramedic?.hasLicense) positions.push("Paramedic");
  return positions;
}

function CprWarningBadge({ employee }) {
  const warning = getCprWarning(employee);
  if (!warning) return <StatusBadge tone="success" label="CPR OK" />;
  if (warning === "CPR Expiring Soon") return <StatusBadge tone="warning" label={warning} />;
  return <StatusBadge tone="danger" label={warning} />;
}

/**
 * Employees list. Creating and editing happen on the dedicated form page
 * (/employees/new, /employees/:id/edit); a row opens the employee's workspace.
 */
function EmployeesPage() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadEmployees = async () => {
    setLoading(true);
    setError("");
    try {
      setEmployees(await getEmployees());
    } catch (err) {
      setError(err.message || "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEmployees(); }, []);

  const handleDelete = async (employeeId) => {
    const confirmed = await confirm({
      title: "Delete employee?",
      message: "This action cannot be undone.",
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await deleteEmployee(employeeId);
      setMessage("Employee deleted successfully.");
      await loadEmployees();
    } catch (err) {
      setError(err.message || "Failed to delete employee.");
    } finally {
      setLoading(false);
    }
  };

  const activeEmployees = employees.filter((e) => e.isActive).length;
  const cprWarnings = employees.filter((e) => getCprWarning(e)).length;

  return (
    <div className="page-stack">
      <PageHeader
        title="Employees"
        description="Manage employee records, certifications, time & pay."
        actions={(
          <>
            <StatusBadge tone="info" label={`${employees.length} total`} />
            <StatusBadge tone="success" label={`${activeEmployees} active`} />
            <StatusBadge
              tone={cprWarnings > 0 ? "warning" : "neutral"}
              label={`${cprWarnings} CPR ${cprWarnings === 1 ? "warning" : "warnings"}`}
            />
            <button type="button" className="btn btn-primary" onClick={() => navigate("/employees/new")} disabled={loading}>
              <FaPlus aria-hidden="true" /> Add Employee
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={loadEmployees} disabled={loading}>
              <FaRedo aria-hidden="true" /> Refresh
            </button>
          </>
        )}
      />

      {error && <div className="mb-3"><ErrorState message={error} onRetry={loadEmployees} /></div>}
      {message && <div className="alert alert-success">{message}</div>}

      <PageSection title="Employee list">
        {loading && employees.length === 0 ? (
          <p className="text-muted mb-0">Loading employees…</p>
        ) : employees.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No employees yet"
            description="Add an employee to start building your roster."
          />
        ) : (
          <div className="employee-row-list">
            {employees.map((employee) => (
              <div
                className="employee-row-card"
                key={employee.id}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") navigate(`/employees/${employee.id}`); }}
                onClick={() => navigate(`/employees/${employee.id}`)}
                style={{ cursor: "pointer" }}
              >
                <div className="employee-row-main">
                  <div className="employee-avatar">
                    {(employee.firstName?.[0] || "E").toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="employee-name">
                      {employee.firstName} {employee.lastName}
                    </div>
                    <div className="employee-muted">
                      {employee.employeeNumber ? `#${employee.employeeNumber}` : "—"}
                      {employee.hireDate ? ` · Hired: ${employee.hireDate}` : ""}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="compact-call-label">Phone</div>
                  <div className="patient-list-value">{employee.phone || "—"}</div>
                  <div className="patient-list-muted">{employee.email || "—"}</div>
                </div>

                <div>
                  <div className="compact-call-label">Role / Status</div>
                  <div className="employee-badge-row">
                    <span className={`employee-role-badge ${getEmployeeRoleClass(employee.role)}`}>
                      {getEmployeeRoleLabel(employee.role)}
                    </span>
                    <StatusBadge
                      tone={EMPLOYEE_STATUS_TONE[employee.status || "active"] || "neutral"}
                      label={employee.status || "active"}
                    />
                    {!employee.isActive && <StatusBadge tone="neutral" label="Inactive" />}
                  </div>
                </div>

                <div>
                  <div className="compact-call-label">Certifications</div>
                  <div className="employee-badge-row">
                    {[
                      { key: "cpr", label: "CPR", val: employee.cpr },
                      { key: "evoc", label: "EVOC", val: employee.evoc },
                      { key: "emt", label: "EMT", val: employee.emt },
                      { key: "paramedic", label: "Para", val: employee.paramedic },
                    ].map(({ key, label, val }) => {
                      const status = getLicenseStatus(val);
                      const tone = status === "Active" ? "success"
                        : status === "Expiring Soon" ? "warning"
                        : status === "Expired" ? "danger" : "neutral";
                      return <StatusBadge key={key} tone={tone} label={label} dot={false} />;
                    })}
                    <CprWarningBadge employee={employee} />
                  </div>
                </div>

                <div>
                  <div className="compact-call-label">Positions</div>
                  <div className="employee-badge-row">
                    {allowedPositions(employee).map((position) => (
                      <span key={position} className={`employee-role-badge ${getEmployeeRoleClass(position)}`}>
                        {getEmployeeRoleLabel(position)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="employee-row-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                          onClick={() => navigate(`/employees/${employee.id}/edit`)} disabled={loading}>
                    <FaEdit /> Edit
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                          onClick={() => handleDelete(employee.id)} disabled={loading}>
                    <FaTrash /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}

export default EmployeesPage;
