import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BoardToolbar from "./BoardToolbar";

function renderToolbar(overrides = {}) {
  const props = {
    date: "2026-07-14",
    onDateChange: vi.fn(),
    mode: "live",
    onPrevDay: vi.fn(),
    onToday: vi.fn(),
    onNextDay: vi.fn(),
    loading: false,
    onRefresh: vi.fn(),
    onCreateDayUnit: vi.fn(),
    onCreateNightUnit: vi.fn(),
    creatingDisabled: false,
    openCallsCount: 0,
    unitsCount: 0,
    ...overrides,
  };
  render(<BoardToolbar {...props} />);
  return props;
}

describe("BoardToolbar mode + date navigation", () => {
  it("shows the Live badge and hides the Today button in live mode", () => {
    renderToolbar({ mode: "live" });
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
  });

  it("shows the Planning badge and a Today button off-live", () => {
    renderToolbar({ mode: "planning" });
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
  });

  it("shows the History badge", () => {
    renderToolbar({ mode: "history" });
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("fires day-navigation callbacks", () => {
    const props = renderToolbar({ mode: "history" });
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(props.onPrevDay).toHaveBeenCalled();
    expect(props.onNextDay).toHaveBeenCalled();
    expect(props.onToday).toHaveBeenCalled();
  });
});
