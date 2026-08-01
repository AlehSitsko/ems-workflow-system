import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import ReportsPage from "./ReportsPage";
import * as api from "../api/reportsApi";

vi.mock("../api/reportsApi");

// The three reports have different payload shapes. Switching tabs triggers an
// async re-fetch, and the view must not render against the previous report's
// data during that in-flight fetch (a regression that crashed HoursView on a
// missing `by_employee`). These tests pin that the guard holds.

const callsPayload = {
  range: { start: "2026-01-01", end: "2026-01-31", days: 31 },
  summary: { total_calls: 3, completed: 2, cancelled: 1, completion_rate: 67, cancellation_rate: 33 },
  by_day: [{ date: "2026-01-01", total: 3, completed: 2, cancelled: 1 }],
  by_status: [{ status: "completed", count: 2 }],
  by_service_level: [{ service_level: "BLS", count: 3 }],
};

const utilizationPayload = {
  range: { start: "2026-01-01", end: "2026-01-31", days: 31 },
  summary: { unit_days: 4, total_calls: 3, assigned_calls: 1, assigned_rate: 33, avg_units_per_day: 0.1, avg_calls_per_unit: 0.8 },
  by_day: [{ date: "2026-01-01", units: 2, calls: 3, assigned: 1, calls_per_unit: 1.5 }],
};

const hoursPayload = {
  range: { start: "2026-01-01", end: "2026-01-31", days: 31 },
  summary: { employees: 1, total_hours: 11.5, total_entries: 2 },
  by_employee: [{ employee_id: 5, name: "Ann Ng", total_hours: 11.5, days_worked: 2, entries: 2 }],
};

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getCallsReport.mockResolvedValue(callsPayload);
    api.getUtilizationReport.mockResolvedValue(utilizationPayload);
    api.getHoursReport.mockResolvedValue(hoursPayload);
    api.callsReportExportUrl.mockReturnValue("http://x/calls.csv");
    api.hoursReportExportUrl.mockReturnValue("http://x/hours.csv");
  });

  it("shows the calls report by default", async () => {
    render(<ReportsPage />);
    expect(await screen.findByText("Total calls")).toBeInTheDocument();
    expect(screen.getByText("By service level")).toBeInTheDocument();
  });

  it("switches to fleet utilisation without rendering stale-shape data", async () => {
    render(<ReportsPage />);
    await screen.findByText("Total calls");

    fireEvent.click(screen.getByRole("button", { name: "Fleet utilisation" }));

    expect(await screen.findByText("Unit-days")).toBeInTheDocument();
    // "Calls / unit" is both a tile label and a table column — its presence (twice)
    // confirms the utilisation view rendered.
    expect(screen.getAllByText("Calls / unit").length).toBeGreaterThan(0);
    // The crash regression surfaced as a thrown "reading 'map'"; a clean render proves the guard.
    expect(screen.queryByText(/Application Error/i)).not.toBeInTheDocument();
  });

  it("switches to staff hours and lists employees", async () => {
    render(<ReportsPage />);
    await screen.findByText("Total calls");

    fireEvent.click(screen.getByRole("button", { name: "Staff hours" }));

    expect(await screen.findByText("Total hours")).toBeInTheDocument();
    expect(screen.getByText("Ann Ng")).toBeInTheDocument();
    // Staff hours carries a CSV export; utilisation does not.
    expect(screen.getByRole("link", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("offers no CSV export on the utilisation tab", async () => {
    render(<ReportsPage />);
    await screen.findByText("Total calls");
    fireEvent.click(screen.getByRole("button", { name: "Fleet utilisation" }));
    await screen.findByText("Unit-days");
    expect(screen.queryByRole("link", { name: "Export CSV" })).not.toBeInTheDocument();
  });
});
