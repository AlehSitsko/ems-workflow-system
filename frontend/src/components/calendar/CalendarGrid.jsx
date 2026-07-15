import { getWeekdayLabels } from "../../utils/calendarUtils";
import CalendarDayCell from "./CalendarDayCell";

// Month grid: a weekday header row (respecting weekStartsOn) plus the 6×7 day
// matrix. Presentational — the matrix is built by getMonthMatrix in the page;
// `days` is the per-ISO operational summary map from the calendar events API.
const CalendarGrid = ({ matrix, days = {}, onDaySelect, weekStartsOn = 0, dayEventsByIso = {} }) => (
  <div className="calendar-month">
    <div className="calendar-weekdays">
      {getWeekdayLabels(weekStartsOn).map((label) => (
        <div
          key={label}
          className={`calendar-weekday${label === "Sat" || label === "Sun" ? " weekend" : ""}`}
        >
          {label}
        </div>
      ))}
    </div>

    <div className="calendar-grid">
      {matrix.flat().map((cell) => (
        <CalendarDayCell
          key={cell.iso}
          cell={cell}
          summary={days[cell.iso]}
          events={dayEventsByIso[cell.iso]}
          onSelect={onDaySelect}
        />
      ))}
    </div>
  </div>
);

export default CalendarGrid;
