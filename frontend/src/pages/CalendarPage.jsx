import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  getMonthMatrix,
  getMonthTitle,
  getWeekDays,
  getRangeTitle,
  startOfWeek,
  addDays,
} from "../utils/calendarUtils";
import { getUsFederalHolidays, toISODate } from "../utils/holidayUtils";
import { getCalendarEvents } from "../api/calendarApi";
import { hasDispatchAccess } from "../api/authApi";
import { buildDispatchLink } from "../utils/calendarLinks";
import { useUserSettings } from "../context/useUserSettings";

import CalendarToolbar from "../components/calendar/CalendarToolbar";
import CalendarGrid from "../components/calendar/CalendarGrid";
import CalendarWeekView from "../components/calendar/CalendarWeekView";
import CalendarAgendaView from "../components/calendar/CalendarAgendaView";
import CalendarSidebar from "../components/calendar/CalendarSidebar";
import DayOperationsDrawer from "../components/calendar/DayOperationsDrawer";

const AGENDA_DAYS = 28; // agenda shows a rolling four-week window
const VIEWS = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "agenda", label: "Agenda" },
];

// Operational calendar — aggregates existing calls and crew units (via the
// backend calendar API) into a month view with per-day readiness, and links
// each day into the Dispatch Board. Read-only: it never mutates or duplicates a
// call or crew unit.
const DEFAULT_SOURCES = {
  scheduled_call: true, crew_shift: true, patient_birthday: true,
  employee_birthday: true, certification: true, task: true, vehicle: true,
};

const CalendarPage = ({ currentUser }) => {
  const navigate = useNavigate();
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";

  // Per-user calendar display preferences (with safe fallbacks).
  const calPrefs = settings?.calendar || {};
  const enabledSources = useMemo(
    () => ({ ...DEFAULT_SOURCES, ...(calPrefs.sources || {}) }),
    [calPrefs.sources],
  );
  const weekStartsOn = calPrefs.weekStartsOn ?? 0;
  const density = calPrefs.density || "comfortable";
  const showWeekends = calPrefs.showWeekends !== false;
  const showHolidays = calPrefs.showHolidays !== false;

  const today = useMemo(() => new Date(), []);
  // One anchor date drives every view: the month/week it falls in, or the start
  // of the agenda window. Switching views keeps you on the same date.
  const [view, setView] = useState("month");
  const [anchor, setAnchor] = useState(() => new Date());

  const matrix = useMemo(() => {
    const m = getMonthMatrix(anchor.getFullYear(), anchor.getMonth(), today, weekStartsOn);
    // Strip holiday markers when the user has turned them off.
    return showHolidays ? m : m.map((week) => week.map((c) => ({ ...c, holiday: null })));
  }, [anchor, today, weekStartsOn, showHolidays]);

  const weekDays = useMemo(
    () => getWeekDays(anchor, today, weekStartsOn),
    [anchor, today, weekStartsOn],
  );

  const agendaStart = useMemo(() => startOfWeek(anchor, weekStartsOn), [anchor, weekStartsOn]);
  const agendaEnd = useMemo(() => addDays(agendaStart, AGENDA_DAYS - 1), [agendaStart]);

  // Fetch the range the active view needs. Month spills into adjacent months so
  // out-of-month cells still show data.
  const [rangeStart, rangeEnd] = useMemo(() => {
    if (view === "week") return [weekDays[0].iso, weekDays[6].iso];
    if (view === "agenda") return [toISODate(agendaStart), toISODate(agendaEnd)];
    return [matrix[0][0].iso, matrix[5][6].iso];
  }, [view, matrix, weekDays, agendaStart, agendaEnd]);

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

  // Apply the user's per-source visibility toggles (display-only; access is
  // already enforced server-side). Group the visible events by date for the
  // month-cell overlay badges and the day drawer.
  const visibleEvents = useMemo(
    () => events.filter((e) => enabledSources[e.type] !== false),
    [events, enabledSources],
  );
  const dayEventsByIso = useMemo(() => {
    const map = {};
    for (const e of visibleEvents) (map[e.date] ||= []).push(e);
    return map;
  }, [visibleEvents]);

  const monthTitle = getMonthTitle(anchor.getFullYear(), anchor.getMonth());
  const viewTitle = view === "week"
    ? getRangeTitle(weekDays[0].date, weekDays[6].date)
    : view === "agenda"
      ? getRangeTitle(agendaStart, agendaEnd)
      : monthTitle;

  // The sidebar always lists the anchor month's holidays, regardless of view.
  const monthHolidays = useMemo(() => {
    const prefix = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;
    return getUsFederalHolidays(anchor.getFullYear()).filter((h) => h.date.startsWith(prefix));
  }, [anchor]);

  // Navigation steps by the active view's unit: a month, a week, or the agenda
  // window.
  const step = useCallback((dir) => {
    setAnchor((a) => {
      if (view === "week") return addDays(a, 7 * dir);
      if (view === "agenda") return addDays(a, AGENDA_DAYS * dir);
      return new Date(a.getFullYear(), a.getMonth() + dir, 1);
    });
  }, [view]);

  const goToday = useCallback(() => setAnchor(new Date()), []);
  const goPrev = () => step(-1);
  const goNext = () => step(1);

  const handleDaySelect = (cell) => {
    setSelectedDay(cell.iso);
    setDrawerOpen(true);
  };

  // Navigation into the Dispatch Board on the chosen date (optionally focusing a
  // specific call/unit via query params).
  //
  // HR can see crew shifts on the calendar but has no Dispatch access — the
  // board would just bounce them home. So the links are only handed down to
  // roles that can actually open it; without a handler the rows and the footer
  // button simply don't offer the action.
  const canOpenDispatch = hasDispatchAccess(currentUser);
  const openDay = canOpenDispatch ? (iso) => navigate(buildDispatchLink(iso)) : undefined;
  const openCall = canOpenDispatch
    ? (iso, callId) => navigate(buildDispatchLink(iso, { call: callId }))
    : undefined;
  const openUnit = canOpenDispatch
    ? (iso, unitId) => navigate(buildDispatchLink(iso, { unit: unitId }))
    : undefined;

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
              {VIEWS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  className={`btn btn-sm ${view === v.value ? "btn-primary" : "btn-outline-secondary"}`}
                  aria-pressed={view === v.value}
                  onClick={() => setView(v.value)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <CalendarToolbar
            title={viewTitle}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            stepLabel={view === "week" ? "week" : view === "agenda" ? "period" : "month"}
          />

          {error && (
            <div className="alert alert-danger py-2" role="alert">
              {error}
            </div>
          )}
          {loading && (
            <div className="calendar-loading" role="status">Loading operations…</div>
          )}

          <div className={`calendar-density-${density}${showWeekends ? "" : " hide-weekend-tint"}`}>
            {view === "month" && (
              <CalendarGrid
                matrix={matrix}
                days={days}
                dayEventsByIso={dayEventsByIso}
                weekStartsOn={weekStartsOn}
                onDaySelect={handleDaySelect}
              />
            )}
            {view === "week" && (
              <CalendarWeekView
                weekDays={weekDays}
                dayEventsByIso={dayEventsByIso}
                days={days}
                timeFormat={timeFormat}
                onDaySelect={handleDaySelect}
                onOpenCall={openCall}
                onOpenUnit={openUnit}
              />
            )}
            {view === "agenda" && (
              <CalendarAgendaView
                events={visibleEvents}
                todayIso={toISODate(today)}
                timeFormat={timeFormat}
                onOpenCall={openCall}
                onOpenUnit={openUnit}
              />
            )}
          </div>
        </section>

        <CalendarSidebar monthTitle={monthTitle} holidays={showHolidays ? monthHolidays : []} />
      </div>

      <DayOperationsDrawer
        open={drawerOpen}
        dateIso={selectedDay}
        summary={selectedDay ? days[selectedDay] : null}
        events={visibleEvents}
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
