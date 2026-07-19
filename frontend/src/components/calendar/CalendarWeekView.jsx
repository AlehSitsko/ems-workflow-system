import CalendarEventRow from "./CalendarEventRow";
import { WEEKDAY_LABELS } from "../../utils/calendarUtils";

// Week view: seven day columns, each a header (weekday + date, opens the day
// drawer) over that day's events, ordered by time. Reuses the same event data
// and readiness the month view uses — no new fetch shape.

function sortByTime(events) {
  return [...events].sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")));
}

export default function CalendarWeekView({
  weekDays, dayEventsByIso, days, onDaySelect, onOpenCall, onOpenUnit, timeFormat,
}) {
  return (
    <div className="calendar-week">
      {weekDays.map((cell) => {
        const events = sortByTime(dayEventsByIso[cell.iso] || []);
        const summary = days?.[cell.iso];
        const readiness = summary?.readiness || "empty";
        return (
          <div
            key={cell.iso}
            className={`calendar-week-col${cell.isToday ? " today" : ""}${cell.isWeekend ? " weekend" : ""}`}
          >
            <button
              type="button"
              className="calendar-week-head"
              onClick={() => onDaySelect(cell)}
              title={cell.holiday ? cell.holiday.name : "Open day operations"}
            >
              <span className="calendar-week-weekday">{WEEKDAY_LABELS[cell.date.getDay()]}</span>
              <span className="calendar-week-daynum">{cell.day}</span>
              {summary && (summary.callsTotal > 0 || summary.unitsTotal > 0) && (
                <span className={`calendar-week-readiness readiness-${readiness}`} aria-hidden="true" />
              )}
              {cell.holiday && <span className="calendar-week-holiday">{cell.holiday.name}</span>}
            </button>

            <div className="calendar-week-events">
              {events.length === 0 ? (
                <p className="calendar-week-empty">—</p>
              ) : (
                events.map((e) => (
                  <CalendarEventRow
                    key={e.id}
                    event={e}
                    timeFormat={timeFormat}
                    onOpenCall={onOpenCall}
                    onOpenUnit={onOpenUnit}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
