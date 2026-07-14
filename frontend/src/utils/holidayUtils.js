// US federal holiday calculation for the Calendar module. Pure date math — no
// network, no locale dependency. Foundations only: this powers the static
// calendar scaffold; derived operational events (shifts, certs, birthdays…)
// arrive in a later phase via the backend.

// Format a Date as a local YYYY-MM-DD string (timezone-safe — uses local
// getters, never toISOString which would shift across the UTC boundary).
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// The nth (1-based) occurrence of a given weekday (0=Sun … 6=Sat) in a month.
export function nthWeekdayOfMonth(year, monthIndex, weekday, n) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return new Date(year, monthIndex, 1 + offset + (n - 1) * 7);
}

// The last occurrence of a given weekday in a month.
export function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const lastDay = new Date(year, monthIndex + 1, 0);
  const offset = (lastDay.getDay() - weekday + 7) % 7;
  return new Date(year, monthIndex, lastDay.getDate() - offset);
}

// The eleven US federal holidays for a calendar year, sorted by date.
// shortName is the compact label shown inside a day cell; name is the full
// title used in tooltips / the side panel.
export function getUsFederalHolidays(year) {
  const holidays = [
    { date: new Date(year, 0, 1), name: "New Year's Day", shortName: "New Year's" },
    { date: nthWeekdayOfMonth(year, 0, 1, 3), name: "Birthday of Martin Luther King, Jr.", shortName: "MLK Jr. Day" },
    { date: nthWeekdayOfMonth(year, 1, 1, 3), name: "Washington's Birthday", shortName: "Presidents' Day" },
    { date: lastWeekdayOfMonth(year, 4, 1), name: "Memorial Day", shortName: "Memorial Day" },
    { date: new Date(year, 5, 19), name: "Juneteenth National Independence Day", shortName: "Juneteenth" },
    { date: new Date(year, 6, 4), name: "Independence Day", shortName: "Independence Day" },
    { date: nthWeekdayOfMonth(year, 8, 1, 1), name: "Labor Day", shortName: "Labor Day" },
    { date: nthWeekdayOfMonth(year, 9, 1, 2), name: "Columbus Day", shortName: "Columbus Day" },
    { date: new Date(year, 10, 11), name: "Veterans Day", shortName: "Veterans Day" },
    { date: nthWeekdayOfMonth(year, 10, 4, 4), name: "Thanksgiving Day", shortName: "Thanksgiving" },
    { date: new Date(year, 11, 25), name: "Christmas Day", shortName: "Christmas" },
  ];

  return holidays
    .map((h) => ({ ...h, date: toISODate(h.date) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Per-year memoized ISO-date → holiday map. A month grid can spill into the
// previous/next year (late Dec / early Jan), so lookups resolve the year from
// the date itself rather than assuming a single active year.
const _yearCache = new Map();

function holidaysForYear(year) {
  if (!_yearCache.has(year)) {
    const map = new Map();
    for (const h of getUsFederalHolidays(year)) map.set(h.date, h);
    _yearCache.set(year, map);
  }
  return _yearCache.get(year);
}

// Look up a holiday by ISO date ("YYYY-MM-DD") or Date; returns the holiday
// object or null.
export function getHoliday(dateOrIso) {
  const iso = typeof dateOrIso === "string" ? dateOrIso : toISODate(dateOrIso);
  const year = Number(iso.slice(0, 4));
  return holidaysForYear(year).get(iso) || null;
}
