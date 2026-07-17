import { useUserSettings } from "../../context/useUserSettings";
import { formatTimeForDisplay } from "../../utils/timeUtils";
import { parseReturnInfo } from "../../utils/dispatchBoardUtils";

export default function CompletedCallCard({ call, onCardClick }) {
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";
  const ret = parseReturnInfo(call.notes);
  return (
    <div className="mb-2" style={{ opacity: 0.45, cursor: "pointer" }} onClick={() => onCardClick && onCardClick(call, true)}>
      <div style={{
        background: "var(--ems-board-bg)",
        borderRadius: 6,
        borderLeft: "3px solid var(--color-text-muted)",
        padding: "8px 10px",
        marginBottom: ret ? 2 : 0,
      }}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="text-muted fw-semibold" style={{ fontSize: 13, textDecoration: "line-through" }}>
            {call.patient_name || `Call #${call.id}`}
          </span>
          <span style={{ fontSize: 10, color: "var(--ems-board-text-muted)", background: "var(--ems-board-border)", padding: "1px 6px", borderRadius: 4 }}>
            COMPLETED
          </span>
          {call.pickup_time && (
            <span className="text-muted" style={{ fontSize: 11 }}>🕐 {formatTimeForDisplay(call.pickup_time, timeFormat)}</span>
          )}
        </div>
        {call.pickup_address && (
          <div className="text-truncate" style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>
            {call.pickup_address} → {call.dropoff_address}
          </div>
        )}
      </div>
      {ret && (
        <div style={{
          background: "var(--ems-board-bg)",
          borderRadius: 6,
          borderLeft: "3px solid var(--color-text-muted)",
          padding: "6px 10px",
        }}>
          <span className="text-muted" style={{ fontSize: 11, fontStyle: "italic" }}>
            Return: {ret.returnPickup} → {ret.returnDestination}
          </span>
        </div>
      )}
    </div>
  );
}
