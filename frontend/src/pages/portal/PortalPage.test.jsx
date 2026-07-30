import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import PortalPage from "./PortalPage";
import * as api from "../../api/portalApi";

vi.mock("../../api/portalApi");

const user = { id: 9, role: "employee", display_name: "James Carter" };

beforeEach(() => {
  vi.clearAllMocks();
  api.getMySchedule.mockResolvedValue([
    { id: 1, shiftDate: "2026-08-10", unitType: "ALS", truckNumber: "214",
      startTime: "08:00", endTime: "20:00", role: "Medical", shiftStatus: "scheduled" },
  ]);
  api.getMyTasks.mockResolvedValue([
    { id: 5, title: "Restock the rig", status: "Assigned", due_date: "2026-08-11", description: "" },
  ]);
  api.updateMyTask.mockResolvedValue({ id: 5, status: "In Progress" });
  api.getMyLeave.mockResolvedValue([]);
  api.requestLeave.mockResolvedValue({ id: 1, status: "pending" });
  api.getMyProfile.mockResolvedValue({
    firstName: "James", lastName: "Carter", employeeNumber: "E101", role: "Paramedic",
    qualification: "paramedic", hireDate: "2019-03-01", phone: "555-0101",
    email: "j@example.org", status: "active",
    cpr: { hasLicense: true, expirationDate: "2027-01-01" },
    evoc: { hasLicense: true, expirationDate: "2026-12-01" },
    emt: { hasLicense: false, expirationDate: "" },
    paramedic: { hasLicense: true, expirationDate: "2027-06-01" },
  });
});

describe("PortalPage", () => {
  it("greets the employee and shows their schedule by default", async () => {
    render(<PortalPage currentUser={user} />);
    expect(screen.getByText(/Hi, James/)).toBeInTheDocument();
    expect(await screen.findByText("214", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Medical")).toBeInTheDocument();
  });

  it("lets me advance one of my tasks", async () => {
    render(<PortalPage currentUser={user} />);
    fireEvent.click(screen.getByRole("button", { name: /My Tasks/i }));
    expect(await screen.findByText("Restock the rig")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "In Progress" }));
    await waitFor(() => expect(api.updateMyTask).toHaveBeenCalledWith(5, "In Progress"));
  });

  it("submits a leave request for myself", async () => {
    render(<PortalPage currentUser={user} />);
    fireEvent.click(screen.getByRole("button", { name: /My Leave/i }));
    await screen.findByText(/Request time off/i);

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Request" }));

    await waitFor(() => expect(api.requestLeave).toHaveBeenCalledWith(
      expect.objectContaining({ leaveType: "vacation", startDate: "2026-09-01", endDate: "2026-09-01" }),
    ));
  });

  it("blocks a leave request with no start date", async () => {
    render(<PortalPage currentUser={user} />);
    fireEvent.click(screen.getByRole("button", { name: /My Leave/i }));
    await screen.findByText(/Request time off/i);
    fireEvent.click(screen.getByRole("button", { name: "Request" }));
    expect(await screen.findByText(/start date is required/i)).toBeInTheDocument();
    expect(api.requestLeave).not.toHaveBeenCalled();
  });

  it("shows my profile and certifications", async () => {
    render(<PortalPage currentUser={user} />);
    fireEvent.click(screen.getByRole("button", { name: /My Profile/i }));
    expect(await screen.findByText("James Carter")).toBeInTheDocument();
    expect(screen.getByText("E101")).toBeInTheDocument();
    expect(screen.getByText("555-0101")).toBeInTheDocument();  // phone — unique
    // The certifications table renders each cert row.
    expect(screen.getByText("EVOC")).toBeInTheDocument();
  });
});
