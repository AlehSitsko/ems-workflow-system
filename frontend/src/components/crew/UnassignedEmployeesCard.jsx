/*
  Displays active employees who are not assigned to any planned unit
  for the selected shift date.

  This component is presentation-focused.
  Employee filtering and CPR warning logic remain in CrewPlannerPage.
*/

import {
  getEmployeeRoleClass,
  getEmployeeRoleLabel,
} from "../../utils/employeeRoleUtils";

function UnassignedEmployeesCard({
  unassignedEmployees,
  employeesLoading,
  getCprWarning,
  embedded = false,
}) {
  const body = employeesLoading ? (
        <div className="empty-state">
          <h5>Loading employees</h5>
          <p>Please wait while employee records are loaded.</p>
        </div>
      ) : unassignedEmployees.length === 0 ? (
        <div className="empty-state">
          <h5>No unassigned employees</h5>
          <p>All active employees are already assigned or unavailable.</p>
        </div>
      ) : (
        <div className="crew-employee-chip-list">
          {unassignedEmployees.map((employee) => {
            const cprWarning = getCprWarning(employee);

            return (
              <div
                key={employee.id}
                className={`crew-employee-chip ${
                  cprWarning ? "has-warning" : ""
                }`}
              >
                <div className="crew-employee-chip-main">
                  <div className="crew-employee-name">
                    {employee.firstName} {employee.lastName}
                  </div>

                  <span
                    className={`employee-role-badge ${getEmployeeRoleClass(
                      employee.role
                    )}`}
                  >
                    {getEmployeeRoleLabel(employee.role)}
                  </span>
                </div>

                {cprWarning && (
                  <span
                    className={`badge ${
                      cprWarning === "CPR Expiring Soon"
                        ? "text-bg-warning"
                        : "text-bg-danger"
                    }`}
                  >
                    {cprWarning}
                  </span>
                )}
              </div>
            );
          })}
        </div>
  );

  if (embedded) return body;

  return (
    <section className="content-panel">
      <div className="content-panel-header">
        <div>
          <h4>Unassigned Employees</h4>
          <p>Active employees who are not assigned to a planned unit for the selected date.</p>
        </div>
        <span className="badge text-bg-secondary">{unassignedEmployees.length}</span>
      </div>
      {body}
    </section>
  );
}

export default UnassignedEmployeesCard;