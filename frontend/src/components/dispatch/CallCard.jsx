import { FaExclamationTriangle } from "react-icons/fa";
import { useUserSettings } from "../../context/useUserSettings";
import { formatTimeForDisplay } from "../../utils/timeUtils";
import { isEmergencyCall, isWillCall, ALERT_SEVERITY_COLOR } from "../../utils/dispatchBoardUtils";
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

  const accentColor = isCancelled ? "#6b7280"
    : isCompleted   ? "#22c55e"
    : emergency     ? "#dc3545"
    : willCall      ? "#ffc107"
    : isReturn      ? "#6ea8fe"
    : "var(--ems-board-tab-inactive)";

  return (
    <div
      draggable={!isCancelled && !isCompleted}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(call); }}
      onClick={() => onCardClick && onCardClick(call, isCompleted)}
      style={{
        borderLeft: `3px solid ${accentColor}`,
        background: isCancelled ? "rgba(107,114,128,0.08)" : isCompleted ? "rgba(34,197,94,0.06)" : "var(--ems-board-bg-card)",
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
          <div style={{ fontSize: 12, fontWeight: 700, color: isCancelled ? "var(--ems-board-text-muted)" : isCompleted ? "#22c55e" : "var(--ems-board-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {call.patient_name || `Call #${call.id}`}
          </div>
          {(isReturn || willCall) && (
            <div style={{ marginTop: 2 }}>
              {isReturn && <span style={{ fontSize: 9, color: "#6ea8fe", background: "rgba(96,165,250,0.12)", padding: "1px 5px", borderRadius: 3, fontWeight: 700, marginRight: 3 }}>RETURN</span>}
              {willCall && <span style={{ fontSize: 9, color: "#ffc107", background: "rgba(255,193,7,0.12)", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>WILL CALL</span>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {isCancelled && <span style={{ fontSize: 9, color: "#6b7280", background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.25)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>CNCL</span>}
          {isCompleted && <span style={{ fontSize: 9, color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>DONE</span>}
          {emergency && !isCancelled && <span style={{ fontSize: 9, color: "#f87171", background: "rgba(220,53,69,0.15)", border: "1px solid rgba(220,53,69,0.25)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>EMRG</span>}
          {call.patient_alert_severity && (
            <span
              title={`${call.patient_alert_count} active patient alert(s)`}
              style={{ fontSize: 9, color: ALERT_SEVERITY_COLOR[call.patient_alert_severity], background: `${ALERT_SEVERITY_COLOR[call.patient_alert_severity]}20`, border: `1px solid ${ALERT_SEVERITY_COLOR[call.patient_alert_severity]}55`, borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}
            >
              <FaExclamationTriangle style={{ fontSize: 8 }} />
            </span>
          )}
          {call.patient_dispatch_comment && (
            <span
              title="Patient has a dispatch note"
              style={{ fontSize: 9, color: "#6ea8fe", background: "rgba(110,168,254,0.15)", border: "1px solid rgba(110,168,254,0.35)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}
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
      {willCall && <div style={{ fontSize: 11, color: "#ca8a04" }}>📞 Will call when ready</div>}

      {/* Route */}
      {call.pickup_address && (
        <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {call.pickup_address}{call.dropoff_address ? <> → {call.dropoff_address}</> : ""}
        </div>
      )}

      {/* Cancel reason for cancelled cards */}
      {isCancelled && call.cancel_reason && (
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3, fontStyle: "italic" }}>
          ✕ {call.cancel_reason}
        </div>
      )}
    </div>
  );
}
