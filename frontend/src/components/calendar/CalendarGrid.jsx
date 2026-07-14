import { WEEKDAY_LABELS } from "../../utils/calendarUtils";
import CalendarDayCell from "./CalendarDayCell";

// Month grid: a Sunday-first weekday header row plus the 6×7 day matrix.
// Presentational — the matrix is built by getMonthMatrix in the page; `days`
// is the per-ISO operational summary map from the calendar events API.
const CalendarGrid = ({ matrix, days = {}, onDaySelect }) => (
  <div className="calendar-month">
    <div className="calendar-weekdays">
      {WEEKDAY_LABELS.map((label, i) => (
        <div
          key={label}
          className={`calendar-weekday${i === 0 || i === 6 ? " weekend" : ""}`}
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
          onSelect={onDaySelect}
        />
      ))}
    </div>
  </div>
);

export default CalendarGrid;
