/*
  Displays active employees who are not assigned to any planned unit
  for the selected shift date.

  This component is presentation-focused.
  Employee filtering and CPR warning logic remain in CrewPlannerPage.
*/

function UnassignedEmployeesCard({
  unassignedEmployees,
  employeesLoading,
  getCprWarning,
}) {
  return (
    <div className="card shadow-sm mb-4">
      {/* Card header with current unassigned employee count. */}
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
  );
}

export default UnassignedEmployeesCard;