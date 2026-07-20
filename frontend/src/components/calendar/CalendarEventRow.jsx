import { formatTimeForDisplay } from "../../utils/timeUtils";

// One event line, shared by the Week and Agenda views so both read identically.
// Calls and crew units link into the Dispatch Board; overlay events (birthdays,
// certifications, tasks, vehicle dates) are informational and not clickable.

const TYPE_META = {
  scheduled_call: { emoji: "📞", label: "Call" },
  crew_shift: { emoji: "🚑", label: "Unit" },
  patient_birthday: { emoji: "🎂", label: "Birthday" },
  employee_birthday: { emoji: "🎂", label: "Birthday" },
  certification: { emoji: "🎓", label: "Certification" },
  task: { emoji: "🗒️", label: "Task" },
  vehicle: { emoji: "🚑", label: "Vehicle" },
  employee_leave: { emoji: "🌴", label: "Leave" },
};

function eventTime(startIso, timeFormat) {
  if (!startIso || startIso.length < 16) return "";
  return formatTimeForDisplay(startIso.slice(11, 16), timeFormat);
}

export default function CalendarEventRow({ event, timeFormat = "12h", onOpenCall, onOpenUnit }) {
  const meta = TYPE_META[event.type] || { emoji: "•", label: event.type };
  const isCall = event.type === "scheduled_call";
  const isUnit = event.type === "crew_shift";
  // Only offer the jump when a handler was supplied — the page withholds them
  // from roles without Dispatch access rather than rendering a dead link.
  const clickable = (isCall && !!onOpenCall) || (isUnit && !!onOpenUnit);

  const time = eventTime(event.start, timeFormat);
  const title = isCall
    ? (event.metadata?.patientLabel || event.title)
    : isUnit
      ? `Unit ${event.assignedUnitNumber || event.metadata?.unitType || ""}`.trim()
      : event.title;

  const onClick = () => {
    if (isCall) onOpenCall?.(event.date, event.sourceId);
    else if (isUnit) onOpenUnit?.(event.date, event.sourceId);
  };

  const statusTag = isCall
    ? (event.assignedUnitNumber ? `Unit ${event.assignedUnitNumber}` : event.status)
    : isUnit
      ? (event.metadata?.crewComplete ? "Crew ready" : "Crew incomplete")
      : meta.label;

  return (
    <div
      className={`calendar-event-row type-${event.type}${clickable ? " clickable" : ""}${event.severity === "critical" ? " crit" : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
    >
      <span className="calendar-event-time">{time || <span className="calendar-event-icon" aria-hidden="true">{meta.emoji}</span>}</span>
      <span className="calendar-event-title">{title}</span>
      {statusTag && (
        <span className={`calendar-event-tag${isCall ? ` status-${event.status}` : ""}`}>{statusTag}</span>
      )}
    </div>
  );
}
