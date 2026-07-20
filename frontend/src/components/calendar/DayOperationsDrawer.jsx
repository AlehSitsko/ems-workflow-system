import { FaAmbulance, FaPhoneAlt, FaExclamationTriangle, FaArrowRight, FaRegCalendarCheck } from "react-icons/fa";

import EntityDrawer from "../ui/EntityDrawer";
import { formatTimeForDisplay } from "../../utils/timeUtils";

// Overlay (non-operational) event types shown in the "Other events" section.
const OVERLAY_TYPES = {
  patient_birthday: { emoji: "🎂", label: "Birthday" },
  employee_birthday: { emoji: "🎂", label: "Birthday" },
  certification: { emoji: "🎓", label: "Certification" },
  task: { emoji: "🗒️", label: "Task" },
  vehicle: { emoji: "🚑", label: "Vehicle" },
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

const READINESS_LABEL = {
  ready: "Ready",
  warning: "Needs attention",
  critical: "Critical",
  empty: "No operations",
};

// "Thursday, July 16, 2026" — parsed from parts to stay timezone-safe.
function formatFullDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${weekday}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

// Extract HH:MM from an event ISO start and format per the user's 12h/24h setting.
function eventTime(startIso, timeFormat) {
  if (!startIso) return null;
  return formatTimeForDisplay(startIso.slice(11, 16), timeFormat);
}

// Read-only operational overview for a single day. Summarizes the calls and crew
// units the calendar already aggregates and links into the Dispatch Board — it
// never duplicates the board itself. `events` is the full event list; this
// filters to the given date.
const DayOperationsDrawer = ({
  open,
  dateIso,
  summary,
  events,
  timeFormat = "12h",
  onClose,
  onOpenDay,
  onOpenCall,
  onOpenUnit,
}) => {
  if (!dateIso) return null;

  const dayEvents = (events || []).filter((e) => e.date === dateIso);
  const calls = dayEvents.filter((e) => e.type === "scheduled_call");
  const units = dayEvents.filter((e) => e.type === "crew_shift");
  const others = dayEvents.filter((e) => e.type in OVERLAY_TYPES);

  // Derive the issue list from the same events — reliable checks only.
  const issues = [];
  calls.forEach((c) => {
    if (c.status === "unassigned") issues.push({ key: `unassigned-${c.sourceId}`, text: `Call #${c.sourceId} is unassigned` });
    if (c.metadata?.alsOnBls) issues.push({ key: `als-${c.sourceId}`, text: `Call #${c.sourceId}: ALS call on a BLS unit`, critical: true });
    if (c.metadata?.missingPickupTime && (c.status === "assigned" || c.status === "unassigned")) {
      issues.push({ key: `nopickup-${c.sourceId}`, text: `Call #${c.sourceId} has no pickup time` });
    }
  });
  units.forEach((u) => {
    if (!u.metadata?.crewComplete) {
      issues.push({ key: `crew-${u.sourceId}`, text: `Unit ${u.assignedUnitNumber} crew incomplete (${u.metadata?.crewCount}/${u.metadata?.minCrew})` });
    }
    // The backend decides whether an unavailable truck is critical (cannot roll)
    // or a warning (planned maintenance); mirror that rather than re-deciding.
    if (u.metadata?.vehicleIssue) {
      issues.push({
        key: `vehicle-${u.sourceId}`,
        text: `Unit ${u.assignedUnitNumber}: vehicle ${u.metadata.vehicleIssue}`,
        critical: u.severity === "critical",
      });
    }
    // Overlaps are reported on both shifts; list each pair once.
    (u.metadata?.conflicts || []).forEach((c) => {
      if (c.withUnitId < u.sourceId) return;
      const what = c.type === "vehicle_double_booked" ? "same vehicle" : "same crew member";
      issues.push({
        key: `conflict-${u.sourceId}-${c.withUnitId}`,
        text: `Unit ${u.assignedUnitNumber} and Unit ${c.withUnitNumber} overlap in time (${what})`,
        critical: true,
      });
    });
  });

  const readiness = summary?.readiness || "empty";

  // Roles without Dispatch access get no handlers, so the drawer stays a
  // read-only day summary instead of offering a jump that bounces them home.
  const footer = onOpenDay ? (
    <button
      type="button"
      className="btn btn-primary d-inline-flex align-items-center gap-2"
      onClick={() => onOpenDay(dateIso)}
    >
      Open Day in Dispatch Board
      <FaArrowRight />
    </button>
  ) : null;

  return (
    <EntityDrawer
      open={open}
      onClose={onClose}
      title={formatFullDate(dateIso)}
      subtitle="Day operations overview"
      width="42vw"
      footer={footer}
    >
      {/* Summary */}
      <div className={`calendar-day-readiness readiness-${readiness}`}>
        <span className="calendar-day-readiness-label">{READINESS_LABEL[readiness]}</span>
        {summary && (
          <div className="calendar-day-stats">
            <span>{summary.callsTotal} calls</span>
            <span>{summary.callsAssigned} assigned</span>
            <span>{summary.callsUnassigned} unassigned</span>
            <span>{summary.unitsTotal} units</span>
            {summary.warningCount > 0 && <span className="warn">{summary.warningCount} warnings</span>}
            {summary.criticalCount > 0 && <span className="crit">{summary.criticalCount} critical</span>}
          </div>
        )}
      </div>

      {/* Scheduled calls */}
      <section className="calendar-day-section">
        <h5><FaPhoneAlt /> Scheduled Calls ({calls.length})</h5>
        {calls.length === 0 ? (
          <p className="calendar-day-empty">No scheduled calls.</p>
        ) : (
          <ul className="calendar-day-list">
            {calls.map((c) => (
              <li key={c.id} className="calendar-day-row"
                  role={onOpenCall ? "button" : undefined}
                  tabIndex={onOpenCall ? 0 : undefined}
                  onClick={onOpenCall ? () => onOpenCall(dateIso, c.sourceId) : undefined}
                  onKeyDown={onOpenCall ? (e) => { if (e.key === "Enter") onOpenCall(dateIso, c.sourceId); } : undefined}>
                <div className="calendar-day-row-main">
                  <span className="calendar-day-time">{eventTime(c.start, timeFormat) || "No time"}</span>
                  <span className="calendar-day-title">{c.metadata?.patientLabel || c.title}</span>
                </div>
                <div className="calendar-day-row-meta">
                  <span className="calendar-tag">{c.metadata?.serviceLevel || "—"}</span>
                  {c.metadata?.priority && c.metadata.priority !== "Normal" && (
                    <span className="calendar-tag">{c.metadata.priority}</span>
                  )}
                  <span className={`calendar-status status-${c.status} ${c.severity === "critical" ? "crit" : ""}`}>
                    {c.assignedUnitNumber ? `Unit ${c.assignedUnitNumber}` : c.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Crew units */}
      <section className="calendar-day-section">
        <h5><FaAmbulance /> Crew Units ({units.length})</h5>
        {units.length === 0 ? (
          <p className="calendar-day-empty">No crew units scheduled.</p>
        ) : (
          <ul className="calendar-day-list">
            {units.map((u) => (
              <li key={u.id} className="calendar-day-row"
                  role={onOpenUnit ? "button" : undefined}
                  tabIndex={onOpenUnit ? 0 : undefined}
                  onClick={onOpenUnit ? () => onOpenUnit(dateIso, u.sourceId) : undefined}
                  onKeyDown={onOpenUnit ? (e) => { if (e.key === "Enter") onOpenUnit(dateIso, u.sourceId); } : undefined}>
                <div className="calendar-day-row-main">
                  <span className="calendar-day-title">Unit {u.assignedUnitNumber}</span>
                  <span className="calendar-tag">{u.metadata?.unitType}</span>
                </div>
                <div className="calendar-day-row-meta">
                  <span className="calendar-day-time">
                    {eventTime(u.start, timeFormat)}{u.end ? `–${eventTime(u.end, timeFormat)}` : ""}
                  </span>
                  <span className={`calendar-tag ${u.metadata?.crewComplete ? "" : "warn"}`}>
                    crew {u.metadata?.crewCount}/{u.metadata?.minCrew}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Other events — birthdays, certifications, tasks, vehicle dates */}
      {others.length > 0 && (
        <section className="calendar-day-section">
          <h5><FaRegCalendarCheck /> Other ({others.length})</h5>
          <ul className="calendar-day-list">
            {others.map((e) => {
              const meta = OVERLAY_TYPES[e.type];
              return (
                <li key={e.id} className="calendar-day-row calendar-day-row-static">
                  <div className="calendar-day-row-main">
                    <span className="calendar-day-time" aria-hidden="true">{meta.emoji}</span>
                    <span className="calendar-day-title">{e.title}</span>
                  </div>
                  <div className="calendar-day-row-meta">
                    {e.severity !== "normal" && (
                      <span className={`calendar-tag ${e.severity === "critical" ? "crit" : "warn"}`}>{e.severity}</span>
                    )}
                    <span className="calendar-tag">{meta.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Issues */}
      <section className="calendar-day-section">
        <h5><FaExclamationTriangle /> Issues ({issues.length})</h5>
        {issues.length === 0 ? (
          <p className="calendar-day-empty">No operational issues detected.</p>
        ) : (
          <ul className="calendar-day-issues">
            {issues.map((i) => (
              <li key={i.key} className={i.critical ? "crit" : "warn"}>{i.text}</li>
            ))}
          </ul>
        )}
      </section>
    </EntityDrawer>
  );
};

export default DayOperationsDrawer;
