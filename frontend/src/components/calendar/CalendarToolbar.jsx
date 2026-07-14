import { FaChevronLeft, FaChevronRight, FaCalendarDay } from "react-icons/fa";

// Month navigation bar shown above the grid: previous / next month, the current
// month title, and a jump-to-today button. Presentational — all navigation is
// handled by the page via props.
const CalendarToolbar = ({ title, onPrev, onNext, onToday }) => (
  <div className="calendar-toolbar">
    <div className="calendar-nav">
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={onPrev}
        aria-label="Previous month"
      >
        <FaChevronLeft />
      </button>

      <span className="calendar-nav-title">{title}</span>

      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={onNext}
        aria-label="Next month"
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
