import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import UnitDetailPanel from "./UnitDetailPanel";

// Minimal available unit with no calls, so only the status controls are exercised.
const unit = {
  id: 1, truckNumber: "12", unitType: "BLS", dispatchStatus: "available",
  crewCount: 2, assignedCalls: [], completedCalls: [], callPriority: [],
};

function renderPanel(liveControlsEnabled) {
  render(
    <UnitDetailPanel
      selectedUnit={unit}
      bottomHeight={200}
      liveControlsEnabled={liveControlsEnabled}
      onRowDividerMouseDown={vi.fn()}
      onStatusChange={vi.fn()}
      sortCallsByPriority={() => []}
      isCallOverdue={() => false}
      onUnassign={vi.fn()}
      onComplete={vi.fn()}
      onCardClick={vi.fn()}
      onSetPickupTime={vi.fn()}
      onSetHighPriority={vi.fn()}
      onMoveCall={vi.fn()}
      onResetPriority={vi.fn()}
    />,
  );
}

describe("UnitDetailPanel live-status gating", () => {
  it("disables live status controls when not in Live mode (planning/history)", () => {
    renderPanel(false);
    expect(screen.getByRole("button", { name: "En Route" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Out of Service" })).toBeDisabled();
    expect(screen.getByText(/Live status is available on today's board only/)).toBeInTheDocument();
  });

  it("enables live status controls in Live mode", () => {
    renderPanel(true);
    // "Available" is the current status so it stays disabled; the next status is enabled.
    expect(screen.getByRole("button", { name: "En Route" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Out of Service" })).not.toBeDisabled();
  });
});
