import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import EmployeeEmploymentTab from "./EmployeeEmploymentTab";
import * as api from "../../api/employeesApi";

vi.mock("../../api/employeesApi");

const HR = { role: "hr" };

const event = {
  id: 7, employeeId: 3, eventType: "position_change", effectiveDate: "2026-06-01",
  title: "Lead EMT", employmentType: "full_time", status: "active",
  note: "Promoted", createdByName: "HR User", createdAt: "2026-06-01T09:00:00",
};

describe("EmployeeEmploymentTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getEmploymentEvents.mockResolvedValue([event]);
    api.createEmploymentEvent.mockResolvedValue({ ...event, id: 8 });
    api.deleteEmploymentEvent.mockResolvedValue({ message: "ok" });
  });

  it("loads and renders the timeline for the employee", async () => {
    render(<EmployeeEmploymentTab employeeId={3} currentUser={HR} />);
    expect(await screen.findByText("Lead EMT")).toBeInTheDocument();
    expect(screen.getByText("Position change")).toBeInTheDocument();
    expect(screen.getByText("Promoted")).toBeInTheDocument();
    expect(api.getEmploymentEvents).toHaveBeenCalledWith(3);
  });

  it("submits a new event and refetches", async () => {
    render(<EmployeeEmploymentTab employeeId={3} currentUser={HR} />);
    await screen.findByText("Lead EMT");

    fireEvent.click(screen.getByRole("button", { name: /add event/i }));
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2026-07-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Add event" }));

    await waitFor(() =>
      expect(api.createEmploymentEvent).toHaveBeenCalledWith(3, expect.objectContaining({
        eventType: "position_change",
        effectiveDate: "2026-07-01",
      })),
    );
    // Refetched after the write (initial load + reload).
    await waitFor(() => expect(api.getEmploymentEvents).toHaveBeenCalledTimes(2));
  });

  it("blocks submit without an effective date", async () => {
    render(<EmployeeEmploymentTab employeeId={3} currentUser={HR} />);
    await screen.findByText("Lead EMT");

    fireEvent.click(screen.getByRole("button", { name: /add event/i }));
    fireEvent.click(screen.getByRole("button", { name: "Add event" }));

    expect(await screen.findByText(/Effective date is required/i)).toBeInTheDocument();
    expect(api.createEmploymentEvent).not.toHaveBeenCalled();
  });

  it("deletes an event", async () => {
    render(<EmployeeEmploymentTab employeeId={3} currentUser={HR} />);
    await screen.findByText("Lead EMT");

    fireEvent.click(screen.getByRole("button", { name: /delete this employment event/i }));
    await waitFor(() => expect(api.deleteEmploymentEvent).toHaveBeenCalledWith(7));
  });

  it("hides management controls for a role that cannot manage", async () => {
    render(<EmployeeEmploymentTab employeeId={3} currentUser={{ role: "dispatcher" }} />);
    await screen.findByText("Lead EMT");
    expect(screen.queryByRole("button", { name: /add event/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete this employment event/i })).not.toBeInTheDocument();
  });
});
