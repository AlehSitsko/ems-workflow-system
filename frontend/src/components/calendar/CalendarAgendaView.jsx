import CalendarEventRow from "./CalendarEventRow";

// Agenda view: every day in the range that has events, in order, as a date
// header over its events. Empty days are skipped — it's a scannable "what's
// coming up" list rather than a grid.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Thursday, Jul 16" from an ISO date — parsed from parts to stay timezone-safe.
function headerLabel(iso, todayIso) {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  const base = `${weekday}, ${MONTHS[m - 1]} ${d}`;
  return iso === todayIso ? `${base} · Today` : base;
}

export default function CalendarAgendaView({ events, todayIso, onOpenCall, onOpenUnit, timeFormat }) {
  const byDate = {};
  for (const e of events) (byDate[e.date] ||= []).push(e);
  const dates = Object.keys(byDate).sort();

  if (dates.length === 0) {
    return <p className="calendar-agenda-empty">No events in this range.</p>;
  }

  return (
    <div className="calendar-agenda">
      {dates.map((iso) => {
        const dayEvents = [...byDate[iso]].sort(
          (a, b) => String(a.start || "").localeCompare(String(b.start || "")),
        );
        return (
          <section key={iso} className={`calendar-agenda-day${iso === todayIso ? " today" : ""}`}>
            <h5 className="calendar-agenda-date">{headerLabel(iso, todayIso)}</h5>
            <div className="calendar-agenda-events">
              {dayEvents.map((e) => (
                <CalendarEventRow
                  key={e.id}
                  event={e}
                  timeFormat={timeFormat}
                  onOpenCall={onOpenCall}
                  onOpenUnit={onOpenUnit}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
