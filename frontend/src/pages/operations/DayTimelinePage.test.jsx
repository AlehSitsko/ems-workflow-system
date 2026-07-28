import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import DayTimelinePage from "./DayTimelinePage";
import * as api from "../../api/operationsApi";

vi.mock("../../api/operationsApi");

const payload = {
  day: "2026-08-05",
  mode: "history",
  summary: { trips: 2, withPickupVariance: 2, lateArrivals: 1 },
  trips: [
    {
      callId: 1, patientName: "John D.", serviceLevel: "BLS", status: "completed",
      assignedUnitId: 12,
      planned: { pickup: "09:00", appointment: "", end: "10:30", endNextDay: false },
      actual: { dispatched: "09:02", arrivedPickup: "09:05", loaded: "09:10", arrivedDest: "10:20", completed: "10:28" },
      pickupVarianceMinutes: 5,
    },
    {
      callId: 2, patientName: "Jane R.", serviceLevel: "ALS", status: "completed",
      assignedUnitId: 7,
      planned: { pickup: "10:00", appointment: "", end: "", endNextDay: false },
      actual: { dispatched: "", arrivedPickup: "10:25", loaded: "", arrivedDest: "", completed: "" },
      pickupVarianceMinutes: 25,
    },
  ],
};

function renderAt(path = "/operations/days/2026-08-05") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/operations/days/:date" element={<DayTimelinePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DayTimelinePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the day and renders trips with planned/actual + variance", async () => {
    api.getDayTimeline.mockResolvedValue(payload);
    renderAt();

    expect(await screen.findByText("John D.")).toBeInTheDocument();
    expect(api.getDayTimeline).toHaveBeenCalledWith("2026-08-05");

    // On-time (≤5 min) vs late (>5 min) chips.
    expect(screen.getByText("On time")).toBeInTheDocument();
    expect(screen.getByText(/\+25 min late/)).toBeInTheDocument();

    // Planned end shows for the first trip, and an actual milestone renders.
    expect(screen.getByText(/→ 10:30/)).toBeInTheDocument();
    expect(screen.getByText("09:05")).toBeInTheDocument();
  });

  it("shows an empty state when the day has no trips", async () => {
    api.getDayTimeline.mockResolvedValue({ ...payload, trips: [], summary: { trips: 0, withPickupVariance: 0, lateArrivals: 0 } });
    renderAt();
    expect(await screen.findByText(/No trips on this day/i)).toBeInTheDocument();
  });

  it("shows an error with retry when the load fails", async () => {
    api.getDayTimeline.mockRejectedValue(new Error("boom"));
    renderAt();
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });
});
