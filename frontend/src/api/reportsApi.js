import API_BASE from "./config.js";

const API_BASE_URL = API_BASE;

/**
 * Operational reports (admin/supervisor). The Supervisor Dashboard answers "how
 * is each dispatcher doing"; this answers "what did operations look like across
 * a period" — volume, outcomes and service-level mix for a date range.
 */

/** Aggregate call metrics for [start, end] (YYYY-MM-DD). */
export async function getCallsReport(start, end) {
  const params = new URLSearchParams({ start, end });
  const response = await fetch(`${API_BASE_URL}/api/reports/calls?${params}`, {
    credentials: "include",
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to load report");
  }
  return data;
}

/**
 * The browser URL for the CSV export. The export is a plain GET the browser can
 * navigate to (it downloads via Content-Disposition), so a link/anchor works and
 * carries the session cookie without going through fetch.
 */
export function callsReportExportUrl(start, end) {
  const params = new URLSearchParams({ start, end });
  return `${API_BASE_URL}/api/reports/calls/export?${params}`;
}
