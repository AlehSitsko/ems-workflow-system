import {
  FaBirthdayCake,
  FaCertificate,
  FaAmbulance,
  FaTasks,
  FaPhoneAlt,
  FaTruck,
} from "react-icons/fa";

// Event sources the calendar will surface once the derived-events API lands
// (Roadmap Phase 2). Shown now as a read-only preview so the page communicates
// where it is headed — these are not yet wired to data.
const PLANNED_SOURCES = [
  { icon: FaBirthdayCake, label: "Employee & patient birthdays" },
  { icon: FaCertificate, label: "Certification expirations" },
  { icon: FaAmbulance, label: "Crew shifts" },
  { icon: FaTasks, label: "Task due dates" },
  { icon: FaPhoneAlt, label: "Scheduled calls" },
  { icon: FaTruck, label: "Vehicle inspections & maintenance" },
];

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Sat, Jul 4" — parsed from parts to stay timezone-safe.
function formatHolidayDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAY_ABBR[new Date(y, m - 1, d).getDay()];
  return `${weekday}, ${MONTH_ABBR[m - 1]} ${d}`;
}

const CalendarSidebar = ({ monthTitle, holidays }) => (
  <aside className="calendar-aside">
    <section className="content-panel">
      <div className="content-panel-header">
        <div>
          <h4>Legend</h4>
        </div>
      </div>
      <ul className="calendar-legend">
        <li>
          <span className="calendar-legend-swatch today" />
          Today
        </li>
        <li>
          <span className="calendar-legend-swatch weekend" />
          Weekend
        </li>
        <li>
          <span className="calendar-legend-swatch holiday" />
          US federal holiday
        </li>
      </ul>
    </section>

    <section className="content-panel">
      <div className="content-panel-header">
        <div>
          <h4>Holidays</h4>
          <p>{monthTitle}</p>
        </div>
      </div>
      {holidays.length === 0 ? (
        <p className="calendar-aside-empty">No US federal holidays this month.</p>
      ) : (
        <ul className="calendar-holiday-list">
          {holidays.map((h) => (
            <li key={h.date}>
              <span className="calendar-holiday-name">{h.shortName}</span>
              <span className="calendar-holiday-date">{formatHolidayDate(h.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>

    <section className="content-panel">
      <div className="content-panel-header">
        <div>
          <h4>Coming soon</h4>
          <p>Event sources this calendar will aggregate.</p>
        </div>
      </div>
      <ul className="calendar-source-list">
        {PLANNED_SOURCES.map(({ icon: Icon, label }) => (
          <li key={label}>
            <span className="calendar-source-icon">
              <Icon />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </section>
  </aside>
);

export default CalendarSidebar;
