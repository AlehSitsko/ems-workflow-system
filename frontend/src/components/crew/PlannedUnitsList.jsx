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
  getEmployeeById,
  isMedicalSlotVisible,
  getMedicalSlotLabel,
}) {
  const dayUnits = units.filter((u) => (u.shiftType || "day") === "day");
  const nightUnits = units.filter((u) => u.shiftType === "night");

  const renderTimeRange = (unit) => {
    const start = unit.startTime || "—";
    if (!unit.endTime) return start;
    const endLabel = unit.endDate && unit.endDate !== unit.shiftDate
      ? `${unit.endTime} (${unit.endDate})`
      : unit.endTime;
    return `${start} – ${endLabel}`;
  };

  const renderCrewSlot = (label, employeeId) => {
    const employee = getEmployeeById(employeeId);
    return (
      <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <div className="compact-call-label">{label}</div>
        {employee ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              background: "var(--ems-bg-surface-2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800, color: "var(--ems-text-secondary)",
            }}>
              {(employee.firstName?.[0] || "?").toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ems-text-primary)", lineHeight: 1.2 }}>
                {employee.firstName} {employee.lastName}
              </div>
              <span className={`employee-role-badge ${getEmployeeRoleClass(employee.role)}`} style={{ fontSize: 10 }}>
                {getEmployeeRoleLabel(employee.role)}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--ems-text-muted)", fontStyle: "italic" }}>Not assigned</div>
        )}
      </div>
    );
  };

  const renderPatientOrder = (unit) => {
    const all = [unit.firstPatient, ...(unit.nextPatients || [])].filter(Boolean);
    if (all.length === 0) return (
      <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 6,
        background: "#6c757d14", color: "#6c757d", border: "1px solid #6c757d30" }}>
        No patient
      </span>
    );
    return (
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {all.map((p, i) => (
          <span key={i} style={{
            fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 6,
            background: "var(--ems-bg-surface-2)", color: "var(--ems-text-secondary)",
            border: "1px solid var(--ems-border-light)",
          }}>
            {i + 1}. {p}
          </span>
        ))}
      </div>
    );
  };

  const renderUnit = (unit, isNight) => {
    const medicalLabel = isMedicalSlotVisible(unit.unitType) ? getMedicalSlotLabel(unit.unitType) : null;

    return (
      <div
        key={unit.id}
        className="planned-unit-row"
        style={isNight ? { borderLeft: "3px solid #6ea8fe" } : undefined}
      >
        {/* Col 1: time + truck + badges */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "var(--ems-text-primary)" }}>
            {renderTimeRange(unit)} — Truck {unit.truckNumber || "—"}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            <span className={`badge ${unit.unitType === "ALS" ? "text-bg-primary" : "text-bg-success"}`} style={{ fontSize: 10 }}>
              {unit.unitType}
            </span>
            {isNight && (
              <span className="badge" style={{ background: "#1a2a4a", color: "#6ea8fe", fontSize: 10 }}>
                <FaMoon style={{ marginRight: 3, fontSize: 9 }} />Night
              </span>
            )}
          </div>
        </div>

        {/* Col 2: crew slots */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          {renderCrewSlot("Driver", unit.crew.driver)}
          {medicalLabel && renderCrewSlot(medicalLabel, unit.crew.medical)}
          {renderCrewSlot("Assist 1", unit.crew.assist1)}
          {renderCrewSlot("Assist 2", unit.crew.assist2)}
        </div>

        {/* Col 3: patient order */}
        <div style={{ minWidth: 0 }}>
          <div className="compact-call-label">Patient Order</div>
          <div style={{ marginTop: 3 }}>{renderPatientOrder(unit)}</div>
        </div>

        {/* Col 4: actions */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0, justifyContent: "flex-end", alignItems: "center" }}>
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
    );
  };

  const isEmpty = units.length === 0;

  const sectionHeader = (icon, label, count, color) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 0", marginBottom: 8,
      borderBottom: `1px solid ${color}33`,
    }}>
      {icon}
      <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span className="badge" style={{ fontSize: 10, background: `${color}22`, color }}>{count}</span>
    </div>
  );

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
          <div style={{ marginBottom: 20 }}>
            {sectionHeader(<FaSun style={{ color: "#ffc107", fontSize: 13 }} />, "Day Crew", dayUnits.length, "#b45309")}
            {dayUnits.length === 0
              ? <p className="text-muted small" style={{ paddingLeft: 4 }}>No day units for this date.</p>
              : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {dayUnits.map((u) => renderUnit(u, false))}
                </div>
            }
          </div>

          {/* Night section */}
          <div>
            {sectionHeader(<FaMoon style={{ color: "#6ea8fe", fontSize: 13 }} />, "Night Crew", nightUnits.length, "#6ea8fe")}
            {nightUnits.length === 0
              ? <p className="text-muted small" style={{ paddingLeft: 4 }}>No night units. Use <FaMoon style={{ fontSize: 11 }} /> on a day unit to create one, or add a new Night unit.</p>
              : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {nightUnits.map((u) => renderUnit(u, true))}
                </div>
            }
          </div>
        </>
      )}
    </section>
  );
}

export default PlannedUnitsList;
