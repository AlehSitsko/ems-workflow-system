import { useMemo, useState } from "react";

import {
  getMonthMatrix,
  getMonthTitle,
  shiftMonth,
} from "../utils/calendarUtils";
import { getUsFederalHolidays } from "../utils/holidayUtils";

import CalendarToolbar from "../components/calendar/CalendarToolbar";
import CalendarGrid from "../components/calendar/CalendarGrid";
import CalendarSidebar from "../components/calendar/CalendarSidebar";

// Operational calendar — foundation shell (Roadmap Phase 2). Renders a
// month grid with weekend and US-holiday highlighting; the derived event API
// (shifts, certifications, birthdays, calls, vehicles) is wired in a later
// phase. Read-only, no backend calls yet.
const CalendarPage = () => {
  // A single "now" reference so "today" highlighting and the initial month
  // stay consistent across renders.
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));

  const matrix = useMemo(
    () => getMonthMatrix(cursor.year, cursor.month, today),
    [cursor, today],
  );

  const monthTitle = getMonthTitle(cursor.year, cursor.month);

  // Federal holidays falling inside the visible month, for the sidebar list.
  const monthHolidays = useMemo(() => {
    const prefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`;
    return getUsFederalHolidays(cursor.year).filter((h) => h.date.startsWith(prefix));
  }, [cursor]);

  const goToday = () => setCursor({ year: today.getFullYear(), month: today.getMonth() });
  const goPrev = () => setCursor((c) => shiftMonth(c.year, c.month, -1));
  const goNext = () => setCursor((c) => shiftMonth(c.year, c.month, 1));

  return (
    <div className="page-stack">
      <div className="calendar-layout">
        <section className="content-panel calendar-main">
          <div className="content-panel-header">
            <div>
              <h4>Calendar</h4>
              <p>
                Weekends and US federal holidays. Shifts, certifications,
                birthdays and more are coming soon.
              </p>
            </div>

            <div className="calendar-viewswitch" role="group" aria-label="Calendar view">
              <button type="button" className="btn btn-sm btn-primary" aria-pressed="true">
                Month
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled
                title="Coming soon"
              >
                Week
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled
                title="Coming soon"
              >
                Agenda
              </button>
            </div>
          </div>

          <CalendarToolbar
            title={monthTitle}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
          />

          <CalendarGrid matrix={matrix} />
        </section>

        <CalendarSidebar monthTitle={monthTitle} holidays={monthHolidays} />
      </div>
    </div>
  );
};

export default CalendarPage;
