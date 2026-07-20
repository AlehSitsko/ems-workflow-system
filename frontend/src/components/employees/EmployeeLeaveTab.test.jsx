import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EmployeeLeaveTab from "./EmployeeLeaveTab";

// The API already decided what this role may see. These tests pin that the
// component renders exactly that and invents nothing — an HR-shaped record shows
// its detail, a scheduling-shaped one has no detail to show.

const base = {
  employeeName: "Nina Brooks",
  onCreate: vi.fn(), onDecide: vi.fn(), onCancel: vi.fn(), busy: false,
};

const hrRecord = {
  id: 1, startDate: "2026-08-10", endDate: "2026-08-14", leaveType: "sick",
  status: "approved", blocksScheduling: true, isPartialDay: false,
  reason: "Flu", privateNotes: "Back Monday", reviewedByName: "HR User", reviewNote: "OK",
};

const schedulingRecord = {
  id: 1, startDate: "2026-08-10", endDate: "2026-08-14", leaveType: "unavailable",
  status: "approved", blocksScheduling: true, isPartialDay: false,
};

describe("EmployeeLeaveTab", () => {
  it("shows the HR detail when the API sent it", () => {
    render(<EmployeeLeaveTab {...base} requests={[hrRecord]} canFile canDecide />);
    expect(screen.getByText("Sick")).toBeInTheDocument();
    expect(screen.getByText(/Reason: Flu/)).toBeInTheDocument();
    expect(screen.getByText(/HR notes: Back Monday/)).toBeInTheDocument();
  });

  it("shows only what a scheduling role received", () => {
    render(<EmployeeLeaveTab {...base} requests={[schedulingRecord]} canFile={false} canDecide={false} />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/HR notes:/)).not.toBeInTheDocument();
    expect(screen.queryByText("Sick")).not.toBeInTheDocument();
  });

  it("still states the staffing consequence without the reason", () => {
    render(<EmployeeLeaveTab {...base} requests={[schedulingRecord]} canFile={false} canDecide={false} />);
    expect(screen.getByText("Blocks scheduling")).toBeInTheDocument();
    expect(screen.getByText("2026-08-10 – 2026-08-14")).toBeInTheDocument();
  });

  it("offers approve and deny only to a role that may decide", () => {
    const pending = { ...schedulingRecord, status: "pending", blocksScheduling: false };
    const { rerender } = render(
      <EmployeeLeaveTab {...base} requests={[pending]} canFile canDecide />);
    expect(screen.getByRole("button", { name: /Approve/ })).toBeInTheDocument();

    rerender(<EmployeeLeaveTab {...base} requests={[pending]} canFile canDecide={false} />);
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  });

  it("hides the file button from roles that cannot file", () => {
    render(<EmployeeLeaveTab {...base} requests={[]} canFile={false} canDecide={false} />);
    expect(screen.queryByRole("button", { name: /File a request/ })).not.toBeInTheDocument();
    expect(screen.getByText("No leave on record")).toBeInTheDocument();
  });

  it("does not offer approve on leave that was already decided", () => {
    render(<EmployeeLeaveTab {...base} requests={[hrRecord]} canFile canDecide />);
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
  });
});
