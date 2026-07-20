import {
  FaBirthdayCake,
  FaCertificate,
  FaAmbulance,
  FaTasks,
  FaPhoneAlt,
  FaTruck,
  FaUmbrellaBeach,
} from "react-icons/fa";

// Live event sources the calendar aggregates (role-filtered server-side).
// Toggle visibility per source in Settings → Calendar.
const EVENT_SOURCES = [
  { icon: FaPhoneAlt, label: "Scheduled calls" },
  { icon: FaAmbulance, label: "Crew shifts" },
  { icon: FaBirthdayCake, label: "Employee & patient birthdays" },
  { icon: FaCertificate, label: "Certification expirations" },
  { icon: FaTasks, label: "Task due dates" },
  { icon: FaTruck, label: "Vehicle inspections & maintenance" },
  { icon: FaUmbrellaBeach, label: "Employee leave" },
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
          <h4>Event sources</h4>
          <p>Aggregated here, filtered by your role. Toggle in Settings.</p>
        </div>
      </div>
      <ul className="calendar-source-list">
        {EVENT_SOURCES.map(({ icon: Icon, label }) => (
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
