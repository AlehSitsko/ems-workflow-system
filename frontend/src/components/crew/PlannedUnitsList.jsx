import { FaMoon, FaSun } from "react-icons/fa";
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
  onMakeNight,
  getEmployeeName,
  getEmployeeById,
  isMedicalSlotVisible,
  getMedicalSlotLabel,
}) {
  const dayUnits = units.filter((u) => (u.shiftType || "day") === "day");
  const nightUnits = units.filter((u) => u.shiftType === "night");

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
        <div className="crew-member-name">{getEmployeeName(employeeId)}</div>
        <span className={`employee-role-badge ${getEmployeeRoleClass(employee.role)}`}>
          {getEmployeeRoleLabel(employee.role)}
        </span>
      </div>
    );
  };

  const renderTimeRange = (unit) => {
    const start = unit.startTime || "—";
    if (!unit.endTime) return start;
    const endLabel = unit.endDate && unit.endDate !== unit.shiftDate
      ? `${unit.endTime} (${unit.endDate})`
      : unit.endTime;
    return `${start} – ${endLabel}`;
  };

  const renderUnit = (unit, isNight) => (
    <div
      key={unit.id}
      className="planned-unit-card"
      style={isNight ? { borderLeft: "3px solid #6ea8fe" } : undefined}
    >
      <div className="planned-unit-header">
        <div>
          <div className="planned-unit-title">
            {renderTimeRange(unit)} — Truck {unit.truckNumber || "—"}
          </div>
          <div className="planned-unit-badges">
            <span className="badge text-bg-primary">{unit.unitType}</span>
            {isNight && (
              <span className="badge" style={{ background: "#1a2a4a", color: "#6ea8fe" }}>
                <FaMoon style={{ marginRight: 4 }} />Night
              </span>
            )}
            <span className="badge text-bg-secondary">Date: {unit.shiftDate}</span>
            <span className="badge text-bg-dark">First: {unit.firstPatient || "—"}</span>
          </div>
        </div>

        <div className="planned-unit-actions">
          {!isNight && onMakeNight && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              title="Convert to Night Crew"
              onClick={() => onMakeNight(unit)}
              disabled={unitsLoading}
            >
              <FaMoon />
            </button>
          )}
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
            renderCrewMember(getMedicalSlotLabel(unit.unitType), unit.crew.medical)}
          {renderCrewMember("Assist 1", unit.crew.assist1)}
          {renderCrewMember("Assist 2", unit.crew.assist2)}
        </div>
      </div>

      <div className="planned-unit-section">
        <div className="employee-section-label">Patient Order</div>
        <ol className="planned-patient-list">
          <li>{unit.firstPatient || "—"}</li>
          {(unit.nextPatients || []).map((patient, index) => (
            <li key={`saved-patient-${unit.id}-${index}`}>{patient}</li>
          ))}
        </ol>
      </div>
    </div>
  );

  const isEmpty = units.length === 0;

  return (
    <section className="content-panel">
      <div className="content-panel-header">
        <div>
          <h4>Planned Units</h4>
          <p>Saved crew units for {selectedDate}.</p>
        </div>
        <span className="badge text-bg-secondary">{units.length}</span>
      </div>

      {unitsLoading && isEmpty ? (
        <div className="empty-state">
          <h5>Loading planned units</h5>
          <p>Please wait while units are loaded.</p>
        </div>
      ) : isEmpty ? (
        <div className="empty-state">
          <h5>No units created</h5>
          <p>No crew units have been created for this date.</p>
        </div>
      ) : (
        <>
          {/* Day section */}
          <div style={{ marginBottom: dayUnits.length > 0 ? 8 : 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 0", marginBottom: 8,
              borderBottom: "1px solid #e4e8f0",
            }}>
              <FaSun style={{ color: "#ffc107", fontSize: 13 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6c757d", textTransform: "uppercase", letterSpacing: 1 }}>
                Day Crew
              </span>
              <span className="badge text-bg-secondary" style={{ fontSize: 10 }}>{dayUnits.length}</span>
            </div>
            {dayUnits.length === 0 ? (
              <p className="text-muted small" style={{ paddingLeft: 4 }}>No day units for this date.</p>
            ) : (
              <div className="planned-unit-list">
                {dayUnits.map((u) => renderUnit(u, false))}
              </div>
            )}
          </div>

          {/* Night section */}
          <div style={{ marginTop: 16 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 0", marginBottom: 8,
              borderBottom: "1px solid #1a2a4a",
            }}>
              <FaMoon style={{ color: "#6ea8fe", fontSize: 13 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6ea8fe", textTransform: "uppercase", letterSpacing: 1 }}>
                Night Crew
              </span>
              <span className="badge" style={{ fontSize: 10, background: "#1a2a4a", color: "#6ea8fe" }}>{nightUnits.length}</span>
            </div>
            {nightUnits.length === 0 ? (
              <p className="text-muted small" style={{ paddingLeft: 4 }}>No night units. Use <FaMoon style={{ fontSize: 11 }} /> on a day unit to create one, or add a new Night unit.</p>
            ) : (
              <div className="planned-unit-list">
                {nightUnits.map((u) => renderUnit(u, true))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default PlannedUnitsList;
