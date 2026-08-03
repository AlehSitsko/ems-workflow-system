import { useState } from "react";
import { FaExclamationTriangle } from "react-icons/fa";
import { useUserSettings } from "../../context/useUserSettings";
import { formatTimeForDisplay } from "../../utils/timeUtils";
import TimeInput from "../ui/TimeInput";
import StatusPill from "./StatusPill";
import { isEmergencyCall, isAlsCall, isWillCall, parseReturnInfo, ALERT_SEVERITY_STYLE } from "../../utils/dispatchBoardUtils";

export default function AssignedCallCard({ call, unitStatus, isCurrent, onUnassign, onComplete, onCardClick, onSetPickupTime,
  isFirst, isLast, isOverdue, onSetHighPriority, onMoveUp, onMoveDown, hasPriorityControls }) {
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";
  const emergency = isEmergencyCall(call);
  const als = isAlsCall(call);
  const isReturnCall = (call.call_type || "").toLowerCase() === "return";
  const willCall = isWillCall(call);
  // Only show embedded return section for old-style records with return info in notes
  const ret = parseReturnInfo(call.notes);

  const [wcTime, setWcTime] = useState(call.pickup_time || "");

  const borderColor = isOverdue ? "var(--color-danger)" : emergency ? "var(--color-danger)" : willCall ? "var(--color-warning)" : isReturnCall ? "var(--color-primary)" : "var(--color-text-muted)";

  return (
    <div className={`mb-2${isOverdue ? " ems-overdue-card" : ""}`} style={{ cursor: "pointer", borderRadius: 6 }} onClick={() => onCardClick && onCardClick(call, false)}>
      {/* Primary leg */}
      <div style={{
        background: isOverdue ? "rgba(var(--color-danger-rgb),0.07)" : "var(--ems-board-bg)",
        borderRadius: 6,
        borderLeft: `3px solid ${borderColor}`,
        padding: "8px 10px",
        marginBottom: ret ? 2 : 0,
      }}>
        <div className="d-flex align-items-start gap-2">
          {/* Priority controls — left side */}
          {hasPriorityControls && (
            <div className="d-flex flex-column gap-1 flex-shrink-0" onClick={e => e.stopPropagation()} style={{ marginTop: 2 }}>
              <button
                title="Set High Priority"
                className="btn btn-sm"
                style={{ fontSize: 9, padding: "1px 5px", lineHeight: 1.2, background: isFirst ? "rgba(var(--color-warning-rgb),0.2)" : "transparent", color: isFirst ? "var(--color-warning)" : "var(--ems-board-text-muted)", border: `1px solid ${isFirst ? "rgba(var(--color-warning-rgb), 0.27)" : "var(--color-border)"}` }}
                onClick={() => onSetHighPriority && onSetHighPriority(call.id)}
              >⚡</button>
              <button
                title="Move Up"
                disabled={isFirst}
                className="btn btn-sm"
                style={{ fontSize: 9, padding: "1px 5px", lineHeight: 1.2, background: "transparent", color: isFirst ? "var(--color-border)" : "var(--ems-board-text-muted)", border: "1px solid var(--color-border)" }}
                onClick={() => onMoveUp && onMoveUp(call.id)}
              >▲</button>
              <button
                title="Move Down"
                disabled={isLast}
                className="btn btn-sm"
                style={{ fontSize: 9, padding: "1px 5px", lineHeight: 1.2, background: "transparent", color: isLast ? "var(--color-border)" : "var(--ems-board-text-muted)", border: "1px solid var(--color-border)" }}
                onClick={() => onMoveDown && onMoveDown(call.id)}
              >▼</button>
            </div>
          )}
          <div className="flex-grow-1 min-width-0">
            <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
              <span className={`fw-bold${isOverdue ? " ems-overdue-text" : ""}`} style={{ color: isOverdue ? "var(--color-danger)" : "var(--ems-board-text)", fontSize: 13 }}>
                {call.patient_name || `Call #${call.id}`}
              </span>
              {willCall ? (
                <span style={{ fontSize: 10, color: "var(--color-warning)", background: "rgba(var(--color-warning-rgb),0.15)", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                  WILL CALL
                </span>
              ) : (
                <span style={{ fontSize: 10, color: isReturnCall ? "var(--color-primary)" : "var(--color-text-muted)", background: isReturnCall ? "rgba(var(--color-primary-rgb),0.15)" : "var(--ems-board-border)", padding: "1px 6px", borderRadius: 4 }}>
                  {isReturnCall ? "RETURN" : "OUTBOUND"}
                </span>
              )}
              {als && <span className="badge badge-als" style={{ fontSize: 10 }}>ALS</span>}
              {emergency && <span className="badge bg-danger" style={{ fontSize: 10 }}>EMRG</span>}
              {call.mismatch && (
                <span
                  title={call.mismatch}
                  className="badge"
                  style={{ fontSize: 10, color: "var(--color-warning)", background: "rgba(var(--color-warning-rgb),0.18)", border: "1px solid rgba(var(--color-warning-rgb),0.4)" }}
                >
                  <FaExclamationTriangle style={{ fontSize: 9 }} /> unit
                </span>
              )}
              {call.patient_alert_severity && (
                <span
                  title={`${call.patient_alert_count} active patient alert(s)`}
                  className="badge"
                  style={{ fontSize: 10, color: ALERT_SEVERITY_STYLE[call.patient_alert_severity]?.fg, background: ALERT_SEVERITY_STYLE[call.patient_alert_severity]?.bg, border: `1px solid ${ALERT_SEVERITY_STYLE[call.patient_alert_severity]?.border}` }}
                >
                  <FaExclamationTriangle style={{ fontSize: 9 }} />
                </span>
              )}
              {call.patient_dispatch_comment && (
                <span
                  title="Patient has a dispatch note"
                  className="badge"
                  style={{ fontSize: 10, color: "var(--color-primary)", background: "rgba(var(--color-primary-rgb),0.15)", border: "1px solid rgba(var(--color-primary-rgb),0.35)" }}
                >
                  note
                </span>
              )}
              {isCurrent && unitStatus && <StatusPill status={unitStatus} size="sm" />}
              {!isCurrent && (
                <span style={{ fontSize: 10, color: "var(--ems-board-text-muted)", background: "var(--ems-board-bg-input)", padding: "1px 6px", borderRadius: 4 }}>
                  QUEUED
                </span>
              )}
            </div>
            {/* Will Call: show time setter or current time */}
            {willCall ? (
              <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--color-warning)" }}>📞 Set pickup time:</span>
                <TimeInput value={wcTime} onChange={setWcTime} />
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 10, padding: "1px 8px", background: "rgba(var(--color-warning-rgb),0.15)", color: "var(--color-warning)", border: "1px solid rgba(var(--color-warning-rgb), 0.27)" }}
                  onClick={(e) => { e.stopPropagation(); onSetPickupTime && onSetPickupTime(call.id, wcTime); }}
                >
                  Set
                </button>
              </div>
            ) : call.pickup_time ? (
              <div style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>
                🕐 {formatTimeForDisplay(call.pickup_time, timeFormat)}
                {call.appointment_time ? ` · appt ${formatTimeForDisplay(call.appointment_time, timeFormat)}` : ""}
              </div>
            ) : null}
            {call.pickup_address && (
              <div className="text-truncate" style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>
                {call.pickup_address} → {call.dropoff_address}
              </div>
            )}
          </div>
          <div className="d-flex flex-column gap-1 flex-shrink-0">
            <button
              className="btn btn-sm btn-outline-success"
              style={{ fontSize: 10, padding: "2px 8px" }}
              onClick={(e) => { e.stopPropagation(); onComplete(call.assignment_id); }}
              title="Mark as completed"
            >
              ✓ Done
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ fontSize: 10, padding: "2px 8px" }}
              onClick={(e) => { e.stopPropagation(); onUnassign(call.assignment_id); }}
            >
              Unassign
            </button>
          </div>
        </div>
      </div>

      {/* Return leg (same assignment, shown separately) */}
      {ret && (
        <div style={{
          background: "var(--ems-board-bg)",
          borderRadius: 6,
          borderLeft: "3px solid var(--color-primary)",
          padding: "8px 10px",
          opacity: 0.85,
        }}>
          <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
            <span className="fw-semibold" style={{ color: "var(--ems-board-text)", fontSize: 13 }}>
              {call.patient_name || `Call #${call.id}`}
            </span>
            <span style={{ fontSize: 10, color: "var(--color-primary)", background: "rgba(var(--color-primary-rgb),0.15)", padding: "1px 6px", borderRadius: 4 }}>
              RETURN
            </span>
            <span className="text-muted" style={{ fontSize: 10 }}>unassigned to unit</span>
          </div>
          {ret.returnTime && (
            <div style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>🕐 {formatTimeForDisplay(ret.returnTime, timeFormat)}</div>
          )}
          <div className="text-truncate" style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>
            {ret.returnPickup} → {ret.returnDestination}
          </div>
        </div>
      )}
    </div>
  );
}
