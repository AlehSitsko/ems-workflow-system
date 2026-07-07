import React from "react";
import StatusPill from "./StatusPill";
import UnitTypeBadge from "./UnitTypeBadge";
import { FaMoon, FaEdit, FaTrash } from "react-icons/fa";
import { formatTimeForDisplay } from "../../utils/timeUtils";
import {
  STATUS_NEXT,
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_BG,
  SHIFT_SEVERITY_STYLE,
  isEmergencyCall,
  hasReturnRide,
  minCrewForType,
  getShiftAlertSeverity,
} from "../../utils/dispatchBoardUtils";

// Dispatch Board unit table — extracted from DispatchBoardPage.jsx (Phase 2d
// of its hook/component split, see docs/ROADMAP.md Priority 1). Holds every
// drag-and-drop drop-target handler, double-click status-advance, and the
// patient-queue sub-row. All handler *logic* stays in the page — this
// component only wires the JSX to the callbacks passed in as props.

export default function UnitTable({
  units, selectedUnit, dragOverUnitId, timeFormat,
  isUnitStuck, getUnitStuckMinutes, isCallOverdue, sortCallsByPriority,
  onUnitClick, onUnitDoubleClick, onDragOver, onDragLeave, onDrop,
  onMakeNight, onEditUnit, onDeleteUnit, loading,
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--ems-board-bg)" }}>
      <table className="table table-hover mb-0 dispatch-board-table" style={{ fontSize: 13 }}>
        <thead style={{ position: "sticky", top: 0, background: "var(--ems-board-bg-header)", zIndex: 1 }}>
          <tr>
            <th style={{ width: 80, color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Unit</th>
            <th style={{ width: 110, color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Type</th>
            <th style={{ width: 200, color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Status</th>
            <th style={{ width: 200, color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Crew</th>
            <th style={{ width: 140, color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Shift</th>
            <th style={{ color: "var(--ems-board-text)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Assigned Calls</th>
            <th style={{ width: 110 }}></th>
          </tr>
        </thead>
        <tbody style={{ background: "var(--ems-board-bg)" }}>
          {units.map((unit) => {
            const isSelected = selectedUnit?.id === unit.id;
            const isDragOver = dragOverUnitId === unit.id;
            const shiftSeverity = getShiftAlertSeverity(unit);
            const shiftStyle = shiftSeverity ? SHIFT_SEVERITY_STYLE[shiftSeverity] : null;
            return (
              <React.Fragment key={unit.id}>
              <tr
                key={`unit-${unit.id}`}
                onClick={() => onUnitClick(unit)}
                onDoubleClick={() => onUnitDoubleClick(unit)}
                onDragOver={(e) => onDragOver(e, unit.id)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, unit)}
                title="Click to select · Double-click to advance status"
                style={{
                  cursor: "pointer",
                  background: isDragOver
                    ? "rgba(255,193,7,0.10)"
                    : isSelected
                    ? "rgba(13,110,253,0.10)"
                    : shiftStyle
                    ? shiftStyle.bg
                    : "var(--ems-board-bg)",
                  borderLeft: isSelected
                    ? "3px solid #6ea8fe"
                    : shiftStyle
                    ? `3px solid ${shiftStyle.border}`
                    : "3px solid transparent",
                  outline: isDragOver ? "1px dashed #ffc107" : undefined,
                }}
              >
                <td className="fw-bold align-middle" style={{ color: "var(--ems-board-text)", fontSize: 15 }}>{unit.truckNumber}</td>
                <td className="align-middle"><UnitTypeBadge unitType={unit.unitType} /></td>
                <td className="align-middle">
                  <span className={isUnitStuck(unit) ? "ems-overdue-card" : ""} style={{ display: "inline-flex", borderRadius: 20 }}>
                    <StatusPill status={unit.dispatchStatus} />
                  </span>
                  {isUnitStuck(unit) && (
                    <span className="ems-overdue-text" style={{ fontSize: 9, marginLeft: 4, display: "inline-block" }}>
                      {Math.round(getUnitStuckMinutes(unit))}m
                    </span>
                  )}
                </td>
                <td className="align-middle">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className={`badge ${(unit.crewCount || 0) < minCrewForType(unit.unitType) ? "bg-danger" : "bg-secondary"}`} style={{ fontSize: 10 }}>
                      {unit.crewCount || 0}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {unit.crewNames?.driver && (
                        <span style={{ fontSize: 11, color: "var(--ems-board-text)", lineHeight: 1.3 }}>
                          <span style={{ fontSize: 10, color: "var(--ems-text-muted)", marginRight: 3 }}>DRV</span>
                          {unit.crewNames.driver}
                        </span>
                      )}
                      {unit.crewNames?.medical && (
                        <span style={{ fontSize: 11, color: "var(--ems-board-text)", lineHeight: 1.3 }}>
                          <span style={{ fontSize: 10, color: "var(--ems-text-muted)", marginRight: 3 }}>MED</span>
                          {unit.crewNames.medical}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="align-middle">
                  {unit.startTime ? (
                    <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ems-board-text)" }}>
                      <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                        {formatTimeForDisplay(unit.startTime, timeFormat)}
                        {unit.plannedEndTime && (
                          <span style={{ color: "var(--ems-text-muted)", fontWeight: 400 }}> → {formatTimeForDisplay(unit.plannedEndTime, timeFormat)}</span>
                        )}
                        {shiftSeverity && (
                          <span style={{
                            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                            background: shiftStyle.border,
                            boxShadow: `0 0 4px ${shiftStyle.border}`,
                          }} title={`Shift ${shiftSeverity}`} />
                        )}
                      </div>
                      {unit.shiftDurationHours && (
                        <span
                          className="badge"
                          style={{
                            fontSize: 10,
                            background: shiftStyle ? shiftStyle.border : "var(--bs-secondary)",
                            color: "#fff",
                          }}
                        >
                          {unit.shiftDurationHours}h
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: "var(--ems-text-muted)", fontSize: 11 }}>—</span>
                  )}
                </td>
                <td className="align-middle">
                  <div className="d-flex flex-wrap gap-1 align-items-center">
                    {(unit.assignedCalls || []).map((c) => (
                      <span
                        key={c.id}
                        className="badge"
                        style={{
                          background: isEmergencyCall(c) ? "rgba(220,53,69,0.15)" : "var(--ems-board-bg-badge)",
                          color: isEmergencyCall(c) ? "#dc2626" : "var(--ems-board-text)",
                          fontSize: 11,
                          fontWeight: 600,
                          border: `1px solid ${isEmergencyCall(c) ? "#dc354588" : "var(--ems-board-border)"}`,
                        }}
                      >
                        {c.patient_name || `#${c.id}`}
                        {hasReturnRide(c) && (
                          <span style={{ color: "#6ea8fe", marginLeft: 4 }}>+R</span>
                        )}
                      </span>
                    ))}
                    {(unit.completedCalls || []).map((c) => (
                      <span key={`done-${c.id}`} className="badge" style={{ background: "var(--ems-board-bg-input)", color: "var(--ems-board-text-muted)", fontSize: 11, textDecoration: "line-through" }}>
                        {c.patient_name || `#${c.id}`}
                      </span>
                    ))}
                    {!(unit.assignedCalls?.length) && !(unit.completedCalls?.length) && (
                      <span className="text-muted" style={{ fontSize: 11 }}>
                        {isDragOver ? "Drop here" : "—"}
                      </span>
                    )}
                  </div>
                </td>
                <td className="align-middle" onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "nowrap" }}>
                    {unit.dispatchStatus !== "out_of_service" && (
                      <button
                        className="btn btn-sm"
                        style={{
                          fontSize: 11, padding: "3px 8px",
                          background: STATUS_BG[STATUS_NEXT[unit.dispatchStatus]] || "transparent",
                          border: `1px solid ${STATUS_COLORS[STATUS_NEXT[unit.dispatchStatus]] || "#49505788"}`,
                          color: STATUS_COLORS[STATUS_NEXT[unit.dispatchStatus]] || "var(--ems-board-text-muted)",
                          fontWeight: 600, whiteSpace: "nowrap",
                        }}
                        onClick={() => onUnitDoubleClick(unit)}
                        title="Advance to next status"
                      >
                        {unit.dispatchStatus === "at_destination" ? "✓ Complete" : `→ ${STATUS_LABELS[STATUS_NEXT[unit.dispatchStatus]] || ""}`}
                      </button>
                    )}
                    {unit.shiftType !== "night" && (
                      <button
                        className="btn btn-sm"
                        style={{ fontSize: 11, padding: "3px 7px", background: "transparent", border: "1px solid #2a3347", color: "var(--ems-board-text-muted)" }}
                        onClick={() => onMakeNight(unit)}
                        title="Make night crew"
                      >
                        <FaMoon style={{ fontSize: 10 }} />
                      </button>
                    )}
                    <button
                      className="btn btn-sm"
                      style={{ fontSize: 11, padding: "3px 7px", background: "transparent", border: "1px solid #2a3347", color: "var(--ems-board-text-muted)" }}
                      onClick={() => onEditUnit(unit)}
                      title="Edit unit"
                    >
                      <FaEdit style={{ fontSize: 10 }} />
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{ fontSize: 11, padding: "3px 7px", background: "transparent", border: "1px solid #dc354533", color: "#ea868f" }}
                      onClick={() => onDeleteUnit(unit.id)}
                      title="Delete unit"
                    >
                      <FaTrash style={{ fontSize: 10 }} />
                    </button>
                  </div>
                </td>
              </tr>
              {/* Patient queue sub-row — sorted by priority, with overdue pulse */}
              {(() => {
                const allCalls = sortCallsByPriority(unit.assignedCalls || [], unit.callPriority || []);
                if (allCalls.length === 0) return null;
                return (
                  <tr style={{ background: isSelected ? "rgba(13,110,253,0.06)" : "var(--ems-board-bg)", borderLeft: isSelected ? "3px solid #6ea8fe" : "3px solid transparent" }}>
                    <td colSpan={6} style={{ paddingTop: 0, paddingBottom: 6, paddingLeft: 16 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ems-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 2 }}>Patients:</span>
                        {allCalls.map((c, idx) => {
                          const overdue = isCallOverdue(c, unit.dispatchStatus);
                          return (
                            <span key={c.id} className={overdue ? "ems-overdue-card" : ""} style={{
                              fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 6,
                              background: overdue ? "rgba(220,53,69,0.1)" : "var(--ems-board-bg-badge)",
                              color: overdue ? "#dc3545" : "var(--ems-board-text)",
                              border: `1px solid ${overdue ? "#dc354555" : "var(--ems-board-border)"}`,
                              display: "flex", alignItems: "center", gap: 4,
                            }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: overdue ? "#dc3545" : "var(--ems-text-muted)" }}>{idx + 1}.</span>
                              {c.patient_name || `Call #${c.id}`}
                              {c.pickup_time && <span className={overdue ? "ems-overdue-text" : ""} style={{ fontSize: 10, color: overdue ? "#dc3545" : "var(--ems-text-muted)", marginLeft: 2 }}>{formatTimeForDisplay(c.pickup_time, timeFormat)}</span>}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })()}
              </React.Fragment>
            );
          })}
          {units.length === 0 && !loading && (
            <tr style={{ background: "var(--ems-board-bg)" }}>
              <td colSpan={5} className="text-center text-muted py-5" style={{ background: "var(--ems-board-bg)" }}>
                No units planned for this date. Add units in Crew Planner.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
