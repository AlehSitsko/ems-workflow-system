// One day in the month grid. Presentational — receives a fully-resolved cell
// object from getMonthMatrix (day number, in/out of month, weekend, today,
// holiday). Future operational events will render as chips below the header.
const CalendarDayCell = ({ cell }) => {
  const classes = [
    "calendar-cell",
    cell.inCurrentMonth ? "" : "out-of-month",
    cell.isWeekend ? "weekend" : "",
    cell.isToday ? "today" : "",
    cell.holiday ? "holiday" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="calendar-cell-head">
        <span className="calendar-cell-daynum">{cell.day}</span>
        {cell.holiday && <span className="calendar-cell-dot" title={cell.holiday.name} />}
      </div>

      {cell.holiday && (
        <span className="calendar-cell-holiday" title={cell.holiday.name}>
          {cell.holiday.shortName}
        </span>
      )}
    </div>
  );
};

export default CalendarDayCell;
