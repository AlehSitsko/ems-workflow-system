import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import AssignedCallCard from "./AssignedCallCard";

vi.mock("../../context/useUserSettings", () => ({
  useUserSettings: () => ({ settings: { ui: { time_format: "12h" } } }),
}));

const base = {
  id: 5, patient_name: "Jane Doe", pickup_time: "10:00", assignment_id: 1,
  call_type: "scheduled", service_level: "ALS",
  pickup_address: "1 A St", dropoff_address: "2 B Ave",
};

function renderCard(extra) {
  render(
    <AssignedCallCard
      call={{ ...base, ...extra }}
      isCurrent
      onUnassign={vi.fn()} onComplete={vi.fn()} onCardClick={vi.fn()} onSetPickupTime={vi.fn()}
    />,
  );
}

describe("AssignedCallCard capability mismatch badge", () => {
  it("shows a warning badge carrying the mismatch reason when the unit can't serve the call", () => {
    renderCard({ mismatch: "BLS unit for an ALS call" });
    expect(screen.getByTitle("BLS unit for an ALS call")).toBeInTheDocument();
  });

  it("shows no mismatch badge when the assignment is suitable", () => {
    renderCard({ mismatch: null });
    expect(screen.queryByTitle(/unit for|not .*-capable/i)).toBeNull();
  });
});
