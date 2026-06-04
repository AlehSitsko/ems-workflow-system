/*
  Displays planned crew units for the selected shift date.

  This component is presentation-focused.
  Crew unit loading, editing, deleting, and employee lookup logic
  remain in CrewPlannerPage.
*/

import {
  getEmployeeRoleClass,
  getEmployeeRoleLabel,
} from "../../utils/employeeRoleUtils";

function PlannedUnitsList({
  selectedDate,
  units,
  unitsLoading,
  onEditUnit,
  onDeleteUnit,
  getEmployeeName,
  getEmployeeById,
  isMedicalSlotVisible,
  getMedicalSlotLabel,
}) {
  const renderCrewMember = (label, employeeId) => {
    const employee = getEmployeeById(employeeId);

    if (!employee) {
      return (
        <div className="crew-member-card empty">
          <div className="crew-member-label">{label}</div>
          <div className="crew-member-name">Not assigned</div>
        </div>
      );
    }

    return (
      <div className="crew-member-card">
        <div className="crew-member-label">{label}</div>

        <div className="crew-member-name">
          {getEmployeeName(employeeId)}
        </div>

        <span
          className={`employee-role-badge ${getEmployeeRoleClass(
            employee.role
          )}`}
        >
          {getEmployeeRoleLabel(employee.role)}
        </span>
      </div>
    );
  };

  return (
    <section className="content-panel">
      <div className="content-panel-header">
        <div>
          <h4>Planned Units</h4>

          <p>Saved crew units for {selectedDate}.</p>
        </div>

        <span className="badge text-bg-secondary">{units.length}</span>
      </div>

      {unitsLoading && units.length === 0 ? (
        <div className="empty-state">
          <h5>Loading planned units</h5>
          <p>Please wait while units are loaded.</p>
        </div>
      ) : units.length === 0 ? (
        <div className="empty-state">
          <h5>No units created</h5>
          <p>No crew units have been created for this date.</p>
        </div>
      ) : (
        <div className="planned-unit-list">
          {units.map((unit) => (
            <div key={unit.id} className="planned-unit-card">
              <div className="planned-unit-header">
                <div>
                  <div className="planned-unit-title">
                    {unit.startTime || "No time"} — Truck{" "}
                    {unit.truckNumber || "—"}
                  </div>

                  <div className="planned-unit-badges">
                    <span className="badge text-bg-primary">
                      {unit.unitType}
                    </span>

                    <span className="badge text-bg-secondary">
                      Date: {unit.shiftDate}
                    </span>

                    <span className="badge text-bg-dark">
                      First: {unit.firstPatient || "—"}
                    </span>
                  </div>
                </div>

                <div className="planned-unit-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => onEditUnit(unit)}
                    disabled={unitsLoading}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => onDeleteUnit(unit.id)}
                    disabled={unitsLoading}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="planned-unit-section">
                <div className="employee-section-label">Crew</div>

                <div className="crew-member-grid">
                  {renderCrewMember("Driver", unit.crew.driver)}

                  {isMedicalSlotVisible(unit.unitType) &&
                    renderCrewMember(
                      getMedicalSlotLabel(unit.unitType),
                      unit.crew.medical
                    )}

                  {renderCrewMember("Assist 1", unit.crew.assist1)}
                  {renderCrewMember("Assist 2", unit.crew.assist2)}
                </div>
              </div>

              <div className="planned-unit-section">
                <div className="employee-section-label">Patient Order</div>

                <ol className="planned-patient-list">
                  <li>{unit.firstPatient || "—"}</li>

                  {(unit.nextPatients || []).map((patient, index) => (
                    <li key={`saved-patient-${unit.id}-${index}`}>
                      {patient}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default PlannedUnitsList;