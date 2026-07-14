// Build a Dispatch Board deep link for a given operational date, optionally
// focusing a specific call or unit. Kept pure and separate so the URL contract
// (/dispatch?date=YYYY-MM-DD[&call=][&unit=]) is testable and shared between the
// Calendar (which navigates into the board) and any other caller.
export function buildDispatchLink(dateIso, { call, unit } = {}) {
  const params = new URLSearchParams({ date: dateIso });
  if (call !== undefined && call !== null) params.set("call", String(call));
  if (unit !== undefined && unit !== null) params.set("unit", String(unit));
  return `/dispatch?${params.toString()}`;
}
