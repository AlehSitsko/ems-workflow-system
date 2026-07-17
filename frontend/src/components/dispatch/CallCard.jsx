import { FaExclamationTriangle } from "react-icons/fa";
import { useUserSettings } from "../../context/useUserSettings";
import { formatTimeForDisplay } from "../../utils/timeUtils";
import { isEmergencyCall, isWillCall, ALERT_SEVERITY_STYLE } from "../../utils/dispatchBoardUtils";
import { ServiceLevelBadge } from "../taxonomy/TaxonomyBadges";

export default function CallCard({ call, onDragStart, onCardClick, statusOverride }) {
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";
  const emergency = isEmergencyCall(call);
  const isReturn = call._slot === "return";
  const willCall = isWillCall(call);
  const status = statusOverride || call.status || "new";
  const isCancelled = status === "cancelled";
  const isCompleted = status === "completed";

  const accentColor = isCancelled ? "var(--color-text-muted)"
    : isCompleted   ? "var(--color-success)"
    : emergency     ? "var(--color-danger)"
    : willCall      ? "var(--color-warning)"
    : isReturn      ? "var(--color-primary)"
    : "var(--ems-board-tab-inactive)";

  return (
    <div
      draggable={!isCancelled && !isCompleted}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(call); }}
      onClick={() => onCardClick && onCardClick(call, isCompleted)}
      style={{
        borderLeft: `3px solid ${accentColor}`,
        background: isCancelled ? "rgba(var(--ems-tax-unknown-rgb),0.08)" : isCompleted ? "rgba(var(--color-success-rgb),0.06)" : "var(--ems-board-bg-card)",
        borderRadius: 7,
        cursor: isCancelled || isCompleted ? "pointer" : "grab",
        userSelect: "none",
        padding: "9px 10px 8px",
        marginBottom: 5,
        opacity: isCancelled ? 0.65 : 1,
      }}
    >
      {/* Top row: name + badges */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4, marginBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: isCancelled ? "var(--ems-board-text-muted)" : isCompleted ? "var(--color-success)" : "var(--ems-board-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {call.patient_name || `Call #${call.id}`}
          </div>
          {(isReturn || willCall) && (
            <div style={{ marginTop: 2 }}>
              {isReturn && <span style={{ fontSize: 9, color: "var(--color-primary)", background: "rgba(var(--color-primary-rgb),0.12)", padding: "1px 5px", borderRadius: 3, fontWeight: 700, marginRight: 3 }}>RETURN</span>}
              {willCall && <span style={{ fontSize: 9, color: "var(--color-warning)", background: "rgba(var(--color-warning-rgb),0.12)", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>WILL CALL</span>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {isCancelled && <span style={{ fontSize: 9, color: "var(--color-text-muted)", background: "rgba(var(--ems-tax-unknown-rgb),0.15)", border: "1px solid rgba(var(--ems-tax-unknown-rgb),0.25)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>CNCL</span>}
          {isCompleted && <span style={{ fontSize: 9, color: "var(--color-success)", background: "rgba(var(--color-success-rgb),0.12)", border: "1px solid rgba(var(--color-success-rgb),0.25)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>DONE</span>}
          {emergency && !isCancelled && <span style={{ fontSize: 9, color: "var(--color-danger)", background: "rgba(var(--color-danger-rgb),0.15)", border: "1px solid rgba(var(--color-danger-rgb),0.25)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>EMRG</span>}
          {call.patient_alert_severity && (
            <span
              title={`${call.patient_alert_count} active patient alert(s)`}
              style={{ fontSize: 9, color: ALERT_SEVERITY_STYLE[call.patient_alert_severity]?.fg, background: ALERT_SEVERITY_STYLE[call.patient_alert_severity]?.bg, border: `1px solid ${ALERT_SEVERITY_STYLE[call.patient_alert_severity]?.border}`, borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}
            >
              <FaExclamationTriangle style={{ fontSize: 8 }} />
            </span>
          )}
          {call.patient_dispatch_comment && (
            <span
              title="Patient has a dispatch note"
              style={{ fontSize: 9, color: "var(--color-primary)", background: "rgba(var(--color-primary-rgb),0.15)", border: "1px solid rgba(var(--color-primary-rgb),0.35)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}
            >
              note
            </span>
          )}
          {/* The call's ACTUAL service level. This used to render `als ? "ALS" :
              "BLS"`, which mislabelled every Stretcher/Wheelchair/CCT call as
              "BLS". The badge shows the real level from the canonical taxonomy. */}
          <ServiceLevelBadge value={call.service_level} />
        </div>
      </div>

      {/* Time */}
      {!willCall && call.pickup_time && (
        <div style={{ fontSize: 11, color: "var(--ems-board-text-muted)", marginBottom: 3 }}>
          🕐 {formatTimeForDisplay(call.pickup_time, timeFormat)}
          {call.appointment_time && !isReturn && <span style={{ color: "var(--ems-board-tab-inactive)", marginLeft: 6 }}>appt {formatTimeForDisplay(call.appointment_time, timeFormat)}</span>}
        </div>
      )}
      {willCall && <div style={{ fontSize: 11, color: "var(--color-warning)" }}>📞 Will call when ready</div>}

      {/* Route */}
      {call.pickup_address && (
        <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {call.pickup_address}{call.dropoff_address ? <> → {call.dropoff_address}</> : ""}
        </div>
      )}

      {/* Cancel reason for cancelled cards */}
      {isCancelled && call.cancel_reason && (
        <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 3, fontStyle: "italic" }}>
          ✕ {call.cancel_reason}
        </div>
      )}
    </div>
  );
}
