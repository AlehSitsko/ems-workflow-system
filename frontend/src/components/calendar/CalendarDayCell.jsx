import { FaCheck, FaExclamationTriangle, FaExclamationCircle } from "react-icons/fa";

// Readiness → icon + text label. Icons (not color alone) carry the status so the
// cell stays accessible; color is a secondary cue via the CSS class.
const READINESS = {
  ready: { Icon: FaCheck, label: "Ready", cls: "ready" },
  warning: { Icon: FaExclamationTriangle, label: "Needs attention", cls: "warning" },
  critical: { Icon: FaExclamationCircle, label: "Critical", cls: "critical" },
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

// Overlay (non-operational) event types → a compact emoji badge. Emoji carry the
// meaning so the indicator isn't color-only.
const OVERLAY_BADGES = [
  { types: ["patient_birthday", "employee_birthday"], emoji: "🎂", label: "birthdays" },
  { types: ["certification"], emoji: "🎓", label: "certifications" },
  { types: ["task"], emoji: "🗒️", label: "tasks" },
  { types: ["vehicle"], emoji: "🚑", label: "vehicle dates" },
];

// Build a screen-reader label describing the whole cell (date + operations).
function buildAriaLabel(cell, summary) {
  const [y, m, d] = cell.iso.split("-").map(Number);
  const parts = [`${MONTHS[m - 1]} ${d}, ${y}`];
  if (cell.isToday) parts.push("today");
  if (cell.holiday) parts.push(cell.holiday.name);
  else if (cell.isWeekend) parts.push("weekend");
  if (summary && (summary.callsTotal > 0 || summary.unitsTotal > 0)) {
    if (summary.callsTotal > 0) parts.push(`${summary.callsTotal} calls`);
    if (summary.callsUnassigned > 0) parts.push(`${summary.callsUnassigned} unassigned`);
    if (summary.unitsTotal > 0) parts.push(`${summary.unitsTotal} units`);
    const r = READINESS[summary.readiness];
    if (r) parts.push(r.label);
  }
  return parts.join(", ") + ".";
}

// One day in the month grid. Presentational — receives a resolved cell object
// (day number, weekend, today, holiday) plus an optional operational `summary`
// from the calendar events API. Clicking opens the Day Operations drawer.
const CalendarDayCell = ({ cell, summary, events, onSelect }) => {
  const classes = [
    "calendar-cell",
    cell.inCurrentMonth ? "" : "out-of-month",
    cell.isWeekend ? "weekend" : "",
    cell.isToday ? "today" : "",
    cell.holiday ? "holiday" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const readiness = summary && summary.readiness !== "empty" ? READINESS[summary.readiness] : null;
  const hasData = summary && (summary.callsTotal > 0 || summary.unitsTotal > 0);

  // Compact overlay badges (birthdays, certs, tasks, vehicle dates) from the
  // day's non-operational events.
  const overlayBadges = (events && events.length)
    ? OVERLAY_BADGES
        .map((b) => ({ ...b, count: events.filter((e) => b.types.includes(e.type)).length }))
        .filter((b) => b.count > 0)
    : [];

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(cell);
    }
  };

  const ariaLabel = buildAriaLabel(cell, summary)
    + overlayBadges.map((b) => ` ${b.count} ${b.label}.`).join("");

  return (
    <div
      className={classes}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={() => onSelect?.(cell)}
      onKeyDown={handleKeyDown}
    >
      <div className="calendar-cell-head">
        <span className="calendar-cell-daynum">{cell.day}</span>
        <span className="calendar-cell-marks">
          {cell.holiday && <span className="calendar-cell-dot" title={cell.holiday.name} />}
          {readiness && (
            <span className={`calendar-readiness ${readiness.cls}`} title={readiness.label} aria-hidden="true">
              <readiness.Icon />
            </span>
          )}
        </span>
      </div>

      {cell.holiday && (
        <span className="calendar-cell-holiday" title={cell.holiday.name}>
          {cell.holiday.shortName}
        </span>
      )}

      {hasData && (
        <div className="calendar-cell-summary" aria-hidden="true">
          {summary.callsTotal > 0 && (
            <span className="calendar-chip">{summary.callsTotal} {summary.callsTotal === 1 ? "call" : "calls"}</span>
          )}
          {summary.unitsTotal > 0 && (
            <span className="calendar-chip">{summary.unitsTotal} {summary.unitsTotal === 1 ? "unit" : "units"}</span>
          )}
          {summary.callsUnassigned > 0 && (
            <span className="calendar-chip warn">{summary.callsUnassigned} unassigned</span>
          )}
        </div>
      )}

      {overlayBadges.length > 0 && (
        <div className="calendar-cell-overlays" aria-hidden="true">
          {overlayBadges.map((b) => (
            <span key={b.label} className="calendar-overlay-badge" title={`${b.count} ${b.label}`}>
              {b.emoji}{b.count > 1 ? ` ${b.count}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default CalendarDayCell;
