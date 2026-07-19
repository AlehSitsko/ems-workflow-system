// Month-grid construction for the Calendar module. Pure functions — given a
// year/month, produce the 6×7 matrix of day cells a month view renders. Holiday
// resolution lives in holidayUtils; this file only handles the grid + date
// classification (weekend, today, in/out of month).

import { toISODate, getHoliday } from "./holidayUtils";

export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Weekday headers for a Sunday-first week (US convention).
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Weekday headers rotated for a given first day of week (0 = Sunday, 1 = Monday).
export function getWeekdayLabels(weekStartsOn = 0) {
  return Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(weekStartsOn + i) % 7]);
}

// True for Saturday (6) and Sunday (0).
export function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

// Build a fixed 6-week (42-cell) month matrix. Fixed height keeps the grid from
// jumping as the user pages between months. `weekStartsOn` (0 = Sunday,
// 1 = Monday) rotates the leading column. Each cell describes one day:
//   { date, iso, day, inCurrentMonth, isWeekend, isToday, holiday }
export function getMonthMatrix(year, monthIndex, today = new Date(), weekStartsOn = 0) {
  const todayIso = toISODate(today);
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const offset = (firstWeekday - weekStartsOn + 7) % 7;
  const gridStart = new Date(year, monthIndex, 1 - offset);

  const weeks = [];
  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + w * 7 + d);
      const iso = toISODate(date);
      week.push({
        date,
        iso,
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === monthIndex,
        isWeekend: isWeekend(date),
        isToday: iso === todayIso,
        holiday: getHoliday(iso),
      });
    }
    weeks.push(week);
  }
  return weeks;
}

// Human-readable "Month YYYY" title.
export function getMonthTitle(year, monthIndex) {
  return `${MONTH_LABELS[monthIndex]} ${year}`;
}

// Step a {year, month} cursor by ±1 month, rolling the year over as needed.
export function shiftMonth(year, monthIndex, delta) {
  const base = new Date(year, monthIndex + delta, 1);
  return { year: base.getFullYear(), month: base.getMonth() };
}

// ── Week / Agenda helpers ───────────────────────────────────────────────────

// A local-midnight Date `n` days from `date` (no timezone drift).
export function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

// The first day of the week containing `date`, honouring `weekStartsOn`.
export function startOfWeek(date, weekStartsOn = 0) {
  const offset = (date.getDay() - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

// The 7 day cells of the week containing `anchor` — same cell shape the month
// matrix uses (minus `inCurrentMonth`, which has no meaning for a week).
export function getWeekDays(anchor, today = new Date(), weekStartsOn = 0) {
  const todayIso = toISODate(today);
  const start = startOfWeek(anchor, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const iso = toISODate(date);
    return {
      date,
      iso,
      day: date.getDate(),
      isWeekend: isWeekend(date),
      isToday: iso === todayIso,
      holiday: getHoliday(iso),
    };
  });
}

// "Jul 13 – 19, 2026", or "Jun 29 – Jul 5, 2026" across a month/year boundary.
export function getRangeTitle(startDate, endDate) {
  const sMonth = MONTH_LABELS[startDate.getMonth()].slice(0, 3);
  const eMonth = MONTH_LABELS[endDate.getMonth()].slice(0, 3);
  const sameMonth = startDate.getMonth() === endDate.getMonth()
    && startDate.getFullYear() === endDate.getFullYear();
  if (sameMonth) {
    return `${sMonth} ${startDate.getDate()} – ${endDate.getDate()}, ${endDate.getFullYear()}`;
  }
  const sYear = startDate.getFullYear() !== endDate.getFullYear() ? `, ${startDate.getFullYear()}` : "";
  return `${sMonth} ${startDate.getDate()}${sYear} – ${eMonth} ${endDate.getDate()}, ${endDate.getFullYear()}`;
}
