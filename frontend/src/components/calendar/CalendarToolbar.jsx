import { FaChevronLeft, FaChevronRight, FaCalendarDay } from "react-icons/fa";

// Navigation bar shown above the grid: previous / next step, the current range
// title, and a jump-to-today button. Presentational — all navigation is handled
// by the page via props. `stepLabel` names the unit the arrows move by so the
// labels match the active view.
const CalendarToolbar = ({ title, onPrev, onNext, onToday, stepLabel = "month" }) => (
  <div className="calendar-toolbar">
    <div className="calendar-nav">
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={onPrev}
        aria-label={`Previous ${stepLabel}`}
      >
        <FaChevronLeft />
      </button>

      <span className="calendar-nav-title">{title}</span>

      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={onNext}
        aria-label={`Next ${stepLabel}`}
      >
        <FaChevronRight />
      </button>
    </div>

    <button
      type="button"
      className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2"
      onClick={onToday}
    >
      <FaCalendarDay />
      Today
    </button>
  </div>
);

export default CalendarToolbar;
