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
  api.getMyPto.mockResolvedValue({ balance: 10, annualDays: 15, ledger: [] });
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
  api.getMyClock.mockResolvedValue({ clockedIn: false, since: null, entryId: null });
  api.clockIn.mockResolvedValue({ id: 1 });
  api.clockOut.mockResolvedValue({ id: 1 });
  api.getMyHours.mockResolvedValue({
    entries: [{ id: 1, clock_in: "2026-08-10T08:00:00", clock_out: "2026-08-10T16:00:00",
                duration_minutes: 480, status: "approved" }],
    totalMinutes: 480,
  });
  api.getMyDocuments.mockResolvedValue([
    { id: 3, title: "EMT License", doc_type: "ems_license",
      expiry_date: "2027-01-01", expiry_status: "ok", has_file: true },
  ]);
  api.myDocumentFileUrl.mockReturnValue("/api/portal/me/documents/3/file");
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

  it("shows the review decision on a reviewed leave request", async () => {
    api.getMyLeave.mockResolvedValue([
      {
        id: 9, leaveType: "vacation", startDate: "2026-09-01", endDate: "2026-09-03",
        status: "approved", reviewedByName: "Dana HR", reviewedAt: "2026-08-15T09:00:00",
        reviewNote: "Approved — enjoy!",
      },
      { id: 10, leaveType: "sick", startDate: "2026-09-20", endDate: "2026-09-20", status: "pending" },
    ]);
    render(<PortalPage currentUser={user} />);
    fireEvent.click(screen.getByRole("button", { name: /My Leave/i }));

    expect(await screen.findByText("Approved — enjoy!")).toBeInTheDocument();
    expect(screen.getByText("Dana HR", { exact: false })).toBeInTheDocument();
    // A still-pending request reads as awaiting, not a blank decision.
    expect(screen.getByText(/Awaiting review/i)).toBeInTheDocument();
  });

  it("blocks a leave request with no start date", async () => {
    render(<PortalPage currentUser={user} />);
    fireEvent.click(screen.getByRole("button", { name: /My Leave/i }));
    await screen.findByText(/Request time off/i);
    fireEvent.click(screen.getByRole("button", { name: "Request" }));
    expect(await screen.findByText(/start date is required/i)).toBeInTheDocument();
    expect(api.requestLeave).not.toHaveBeenCalled();
  });

  it("lets me clock in from the hours tab", async () => {
    render(<PortalPage currentUser={user} />);
    fireEvent.click(screen.getByRole("button", { name: /My Hours/i }));
    expect(await screen.findByText(/Not clocked in/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Clock in/i }));
    await waitFor(() => expect(api.clockIn).toHaveBeenCalled());
  });

  it("shows my documents with a download link", async () => {
    render(<PortalPage currentUser={user} />);
    fireEvent.click(screen.getByRole("button", { name: /My Documents/i }));
    expect(await screen.findByText("EMT License")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Download/i });
    expect(link).toHaveAttribute("href", "/api/portal/me/documents/3/file");
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
