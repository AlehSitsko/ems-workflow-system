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

// True for Saturday (6) and Sunday (0).
export function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

// Build a fixed 6-week (42-cell) month matrix. Fixed height keeps the grid from
// jumping as the user pages between months. Each cell describes one day:
//   { date, iso, day, inCurrentMonth, isWeekend, isToday, holiday }
export function getMonthMatrix(year, monthIndex, today = new Date()) {
  const todayIso = toISODate(today);
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const gridStart = new Date(year, monthIndex, 1 - firstWeekday);

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
