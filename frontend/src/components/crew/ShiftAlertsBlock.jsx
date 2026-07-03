import { FaExclamationTriangle, FaClock } from "react-icons/fa";
import { useUserSettings } from "../../context/useUserSettings";
import { formatTimeForDisplay } from "../../utils/timeUtils";

const SEVERITY_CONFIG = {
  critical: { bg: "danger",   text: "Critical" },
  serious:  { bg: "warning",  text: "Serious"  },
  warning:  { bg: "warning",  text: "Warning"  },
  minor:    { bg: "secondary", text: "Minor"   },
};

function AlertBadge({ severity }) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.minor;
  return (
    <span className={`badge text-bg-${cfg.bg} me-2`}>{cfg.text}</span>
  );
}

function ShiftAlertsBlock({ alerts }) {
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="mb-3">
      {alerts.map((alert) => {
        const isDelayed = alert.alertType === "delayed";
        const borderColor = alert.severity === "critical" || alert.severity === "serious"
          ? "danger"
          : "warning";

        return (
          <div
            key={`${alert.unitId}-${alert.alertType}`}
            className={`alert alert-${borderColor === "danger" ? "danger" : "warning"} d-flex align-items-center gap-2 py-2 mb-2`}
            style={{ fontSize: 14 }}
          >
            {isDelayed
              ? <FaExclamationTriangle className="flex-shrink-0" />
              : <FaClock className="flex-shrink-0" />
            }
            <div className="flex-grow-1">
              <AlertBadge severity={alert.severity} />
              <strong>Unit {alert.truckNumber}</strong>
              {" "}
              {isDelayed
                ? `overdue by ${alert.delayMinutes} min (planned end ${formatTimeForDisplay(alert.plannedEndTime, timeFormat)})`
                : `ends in ${alert.minutesLeft} min (at ${formatTimeForDisplay(alert.plannedEndTime, timeFormat)})`
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ShiftAlertsBlock;
