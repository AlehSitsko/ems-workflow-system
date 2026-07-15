import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CalendarDayCell from "./CalendarDayCell";

const baseCell = {
  iso: "2026-07-16",
  day: 16,
  inCurrentMonth: true,
  isWeekend: false,
  isToday: false,
  holiday: null,
};

function summary(overrides = {}) {
  return {
    callsTotal: 0, callsAssigned: 0, callsUnassigned: 0, callsCompleted: 0,
    callsCancelled: 0, unitsTotal: 0, unitsReady: 0, unitsIncomplete: 0,
    warningCount: 0, criticalCount: 0, readiness: "empty", ...overrides,
  };
}

describe("CalendarDayCell", () => {
  it("renders operational counts", () => {
    render(<CalendarDayCell cell={baseCell} summary={summary({ callsTotal: 12, unitsTotal: 3, callsUnassigned: 2, readiness: "warning" })} />);
    expect(screen.getByText("12 calls")).toBeInTheDocument();
    expect(screen.getByText("3 units")).toBeInTheDocument();
    expect(screen.getByText("2 unassigned")).toBeInTheDocument();
  });

  it("shows a readiness indicator with an accessible label (not color-only)", () => {
    const { container } = render(
      <CalendarDayCell cell={baseCell} summary={summary({ callsTotal: 1, callsAssigned: 1, readiness: "ready" })} />,
    );
    expect(container.querySelector(".calendar-readiness.ready")).toHaveAttribute("title", "Ready");
    // Whole-cell aria-label carries the status as text too.
    expect(screen.getByRole("button").getAttribute("aria-label")).toContain("Ready");
  });

  it("renders no summary chips for an empty day", () => {
    const { container } = render(<CalendarDayCell cell={baseCell} summary={summary()} />);
    expect(container.querySelector(".calendar-cell-summary")).toBeNull();
  });

  it("calls onSelect with the cell when clicked", () => {
    const onSelect = vi.fn();
    render(<CalendarDayCell cell={baseCell} summary={summary({ callsTotal: 1 })} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(baseCell);
  });

  it("renders a holiday label", () => {
    render(<CalendarDayCell cell={{ ...baseCell, holiday: { name: "Independence Day", shortName: "Independence Day" } }} />);
    expect(screen.getByText("Independence Day")).toBeInTheDocument();
  });

  it("renders overlay badges for non-operational events", () => {
    const events = [
      { id: "employee_birthday:1", type: "employee_birthday", date: "2026-07-16" },
      { id: "certification:2", type: "certification", date: "2026-07-16" },
    ];
    const { container } = render(<CalendarDayCell cell={baseCell} events={events} />);
    const badges = container.querySelectorAll(".calendar-overlay-badge");
    expect(badges.length).toBe(2);
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/birthdays/);
  });
});
