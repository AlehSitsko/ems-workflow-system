import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getMonthMatrix,
  getMonthTitle,
  shiftMonth,
} from "../utils/calendarUtils";
import { getUsFederalHolidays } from "../utils/holidayUtils";
import { getCalendarEvents } from "../api/calendarApi";
import { buildDispatchLink } from "../utils/calendarLinks";
import { useUserSettings } from "../context/useUserSettings";

import CalendarToolbar from "../components/calendar/CalendarToolbar";
import CalendarGrid from "../components/calendar/CalendarGrid";
import CalendarSidebar from "../components/calendar/CalendarSidebar";
import DayOperationsDrawer from "../components/calendar/DayOperationsDrawer";

// Operational calendar — aggregates existing calls and crew units (via the
// backend calendar API) into a month view with per-day readiness, and links
// each day into the Dispatch Board. Read-only: it never mutates or duplicates a
// call or crew unit.
const CalendarPage = ({ currentUser }) => {
  const navigate = useNavigate();
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";

  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));

  const matrix = useMemo(
    () => getMonthMatrix(cursor.year, cursor.month, today),
    [cursor, today],
  );

  // The visible grid can spill into adjacent months; fetch that full range so
  // out-of-month cells also show operational data.
  const rangeStart = matrix[0][0].iso;
  const rangeEnd = matrix[5][6].iso;

  const [events, setEvents] = useState([]);
  const [days, setDays] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedDay, setSelectedDay] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Reload whenever the visible range changes (month navigation).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getCalendarEvents(rangeStart, rangeEnd, currentUser)
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events || []);
        setDays(data.days || {});
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Failed to load calendar events");
        setEvents([]);
        setDays({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [rangeStart, rangeEnd, currentUser]);

  const monthTitle = getMonthTitle(cursor.year, cursor.month);

  const monthHolidays = useMemo(() => {
    const prefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}`;
    return getUsFederalHolidays(cursor.year).filter((h) => h.date.startsWith(prefix));
  }, [cursor]);

  const goToday = useCallback(
    () => setCursor({ year: today.getFullYear(), month: today.getMonth() }),
    [today],
  );
  const goPrev = () => setCursor((c) => shiftMonth(c.year, c.month, -1));
  const goNext = () => setCursor((c) => shiftMonth(c.year, c.month, 1));

  const handleDaySelect = (cell) => {
    setSelectedDay(cell.iso);
    setDrawerOpen(true);
  };

  // Navigation into the Dispatch Board on the chosen date (optionally focusing a
  // specific call/unit via query params).
  const openDay = (iso) => navigate(buildDispatchLink(iso));
  const openCall = (iso, callId) => navigate(buildDispatchLink(iso, { call: callId }));
  const openUnit = (iso, unitId) => navigate(buildDispatchLink(iso, { unit: unitId }));

  return (
    <div className="page-stack">
      <div className="calendar-layout">
        <section className="content-panel calendar-main">
          <div className="content-panel-header">
            <div>
              <h4>Calendar</h4>
              <p>
                Operational overview — scheduled calls, crew shifts, and daily
                readiness. Click a day for details or to open it in Dispatch.
              </p>
            </div>

            <div className="calendar-viewswitch" role="group" aria-label="Calendar view">
              <button type="button" className="btn btn-sm btn-primary" aria-pressed="true">
                Month
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary" disabled title="Coming soon">
                Week
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary" disabled title="Coming soon">
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

          {error && (
            <div className="alert alert-danger py-2" role="alert">
              {error}
            </div>
          )}
          {loading && (
            <div className="calendar-loading" role="status">Loading operations…</div>
          )}

          <CalendarGrid matrix={matrix} days={days} onDaySelect={handleDaySelect} />
        </section>

        <CalendarSidebar monthTitle={monthTitle} holidays={monthHolidays} />
      </div>

      <DayOperationsDrawer
        open={drawerOpen}
        dateIso={selectedDay}
        summary={selectedDay ? days[selectedDay] : null}
        events={events}
        timeFormat={timeFormat}
        onClose={() => setDrawerOpen(false)}
        onOpenDay={openDay}
        onOpenCall={openCall}
        onOpenUnit={openUnit}
      />
    </div>
  );
};

export default CalendarPage;
