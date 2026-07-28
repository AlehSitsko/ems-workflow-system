import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DayOperationsDrawer from "./DayOperationsDrawer";

const events = [
  {
    id: "call:1", type: "scheduled_call", title: "BLS", date: "2026-07-16",
    start: "2026-07-16T10:00:00", status: "unassigned", severity: "warning",
    sourceId: 1, assignedUnitNumber: null,
    metadata: { serviceLevel: "BLS", priority: "Normal", isAssigned: false, missingPickupTime: false, alsOnBls: false, patientLabel: "John D." },
  },
  {
    id: "crew_unit:5", type: "crew_shift", title: "Unit 12 — BLS", date: "2026-07-16",
    start: "2026-07-16T08:00:00", end: "2026-07-16T20:00:00", status: "planned", severity: "normal",
    sourceId: 5, assignedUnitNumber: "12",
    metadata: { unitType: "BLS", crewCount: 1, minCrew: 2, crewComplete: false },
  },
  // Different day — must be filtered out.
  { id: "call:9", type: "scheduled_call", title: "ALS", date: "2026-07-17", start: null, status: "unassigned", severity: "warning", sourceId: 9, metadata: {} },
  // Overlay event on the selected day.
  { id: "employee_birthday:3", type: "employee_birthday", title: "Jane S. — Birthday", date: "2026-07-16", start: null, status: "info", severity: "normal", sourceId: 3, metadata: {} },
];

const summary = {
  callsTotal: 1, callsAssigned: 0, callsUnassigned: 1, callsCompleted: 0, callsCancelled: 0,
  unitsTotal: 1, unitsReady: 0, unitsIncomplete: 1, warningCount: 2, criticalCount: 0, readiness: "warning",
};

function renderDrawer(overrides = {}) {
  const props = {
    open: true,
    dateIso: "2026-07-16",
    summary,
    events,
    timeFormat: "24h",
    onClose: vi.fn(),
    onOpenDay: vi.fn(),
    onOpenCall: vi.fn(),
    onOpenUnit: vi.fn(),
    ...overrides,
  };
  render(<DayOperationsDrawer {...props} />, { wrapper: MemoryRouter });
  return props;
}

describe("DayOperationsDrawer", () => {
  it("shows only the selected day's calls and units", () => {
    renderDrawer();
    expect(screen.getByText("Scheduled Calls (1)")).toBeInTheDocument();
    expect(screen.getByText("Crew Units (1)")).toBeInTheDocument();
    expect(screen.getByText("John D.")).toBeInTheDocument();       // minimized label used
    expect(screen.getByText("Unit 12")).toBeInTheDocument();
    expect(screen.queryByText("ALS")).not.toBeInTheDocument();      // other day filtered out
  });

  it("lists derived issues (unassigned call + incomplete crew)", () => {
    renderDrawer();
    expect(screen.getByText(/Call #1 is unassigned/)).toBeInTheDocument();
    expect(screen.getByText(/Unit 12 crew incomplete \(1\/2\)/)).toBeInTheDocument();
  });

  it("shows the readiness summary", () => {
    renderDrawer();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });

  it("lists non-operational overlay events in the Other section", () => {
    renderDrawer();
    expect(screen.getByText("Other (1)")).toBeInTheDocument();
    expect(screen.getByText("Jane S. — Birthday")).toBeInTheDocument();
  });

  it("fires onOpenDay from the primary button", () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /Open Day in Dispatch Board/i }));
    expect(props.onOpenDay).toHaveBeenCalledWith("2026-07-16");
  });

  it("fires onOpenCall / onOpenUnit from rows", () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByText("John D."));
    expect(props.onOpenCall).toHaveBeenCalledWith("2026-07-16", 1);
    fireEvent.click(screen.getByText("Unit 12"));
    expect(props.onOpenUnit).toHaveBeenCalledWith("2026-07-16", 5);
  });
});

describe("DayOperationsDrawer without Dispatch access", () => {
  // HR sees crew shifts on the calendar but cannot open the board — the page
  // withholds the handlers so the drawer must not offer a dead jump.
  const readOnly = { onOpenDay: undefined, onOpenCall: undefined, onOpenUnit: undefined };

  it("hides the Open in Dispatch button", () => {
    renderDrawer(readOnly);
    expect(screen.queryByRole("button", { name: /Open Day in Dispatch/i })).not.toBeInTheDocument();
  });

  it("still shows the day's operations, just not as links", () => {
    renderDrawer(readOnly);
    expect(screen.getByText("John D.")).toBeInTheDocument();
    expect(screen.getByText("Unit 12")).toBeInTheDocument();
    // No row is a button when there is nowhere to go.
    expect(screen.queryAllByRole("button").filter((b) => /John D\.|Unit 12/.test(b.textContent))).toHaveLength(0);
  });
});

describe("vehicle availability issues", () => {
  const unitWithBadTruck = (issue, severity) => ({
    id: "crew_unit:7", type: "crew_shift", title: "Unit 12 — BLS", date: "2026-07-16",
    start: "2026-07-16T08:00:00", end: "2026-07-16T20:00:00", status: "planned",
    severity, sourceId: 7, assignedUnitNumber: "12",
    metadata: { unitType: "BLS", crewCount: 2, minCrew: 2, crewComplete: true, vehicleIssue: issue },
  });

  it("lists an out-of-service truck as a critical issue", () => {
    renderDrawer({ events: [unitWithBadTruck("out of service", "critical")] });
    const issue = screen.getByText("Unit 12: vehicle out of service");
    expect(issue).toBeInTheDocument();
    expect(issue).toHaveClass("crit");
  });

  it("lists planned maintenance as a warning, not a critical issue", () => {
    renderDrawer({ events: [unitWithBadTruck("in maintenance", "warning")] });
    const issue = screen.getByText("Unit 12: vehicle in maintenance");
    expect(issue).toHaveClass("warn");
  });

  it("says nothing about the truck when there is no issue", () => {
    renderDrawer({ events: [unitWithBadTruck(null, "normal")] });
    expect(screen.getByText("No operational issues detected.")).toBeInTheDocument();
  });
});
