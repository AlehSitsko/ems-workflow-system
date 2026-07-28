import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import EmployeeDisciplinaryTab from "./EmployeeDisciplinaryTab";
import * as api from "../../api/employeesApi";

vi.mock("../../api/employeesApi");

const action = {
  id: 5, employeeId: 3, actionType: "written_warning", actionDate: "2026-05-01",
  severity: "high", subject: "Late reports", description: "Three late PCRs",
  acknowledged: false, createdByName: "HR User", createdAt: "2026-05-01T10:00:00",
};

describe("EmployeeDisciplinaryTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDisciplinaryActions.mockResolvedValue([action]);
    api.createDisciplinaryAction.mockResolvedValue({ ...action, id: 6 });
    api.setDisciplinaryAcknowledged.mockResolvedValue({ ...action, acknowledged: true });
    api.deleteDisciplinaryAction.mockResolvedValue({ message: "ok" });
  });

  it("loads and renders the record with severity and subject", async () => {
    render(<EmployeeDisciplinaryTab employeeId={3} />);
    expect(await screen.findByText("Late reports")).toBeInTheDocument();
    expect(screen.getByText("Written warning")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Not acknowledged")).toBeInTheDocument();
    expect(api.getDisciplinaryActions).toHaveBeenCalledWith(3);
  });

  it("records a new action and refetches", async () => {
    render(<EmployeeDisciplinaryTab employeeId={3} />);
    await screen.findByText("Late reports");

    fireEvent.click(screen.getByRole("button", { name: /record action/i }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Record action" }));

    await waitFor(() =>
      expect(api.createDisciplinaryAction).toHaveBeenCalledWith(3, expect.objectContaining({
        actionType: "written_warning",
        actionDate: "2026-06-01",
      })),
    );
    await waitFor(() => expect(api.getDisciplinaryActions).toHaveBeenCalledTimes(2));
  });

  it("blocks submit without a date", async () => {
    render(<EmployeeDisciplinaryTab employeeId={3} />);
    await screen.findByText("Late reports");

    fireEvent.click(screen.getByRole("button", { name: /record action/i }));
    fireEvent.click(screen.getByRole("button", { name: "Record action" }));

    expect(await screen.findByText(/Action date is required/i)).toBeInTheDocument();
    expect(api.createDisciplinaryAction).not.toHaveBeenCalled();
  });

  it("toggles acknowledgement", async () => {
    render(<EmployeeDisciplinaryTab employeeId={3} />);
    await screen.findByText("Late reports");

    fireEvent.click(screen.getByRole("button", { name: /acknowledge/i }));
    await waitFor(() => expect(api.setDisciplinaryAcknowledged).toHaveBeenCalledWith(5, true));
  });

  it("deletes an action", async () => {
    render(<EmployeeDisciplinaryTab employeeId={3} />);
    await screen.findByText("Late reports");

    fireEvent.click(screen.getByRole("button", { name: /delete this disciplinary action/i }));
    await waitFor(() => expect(api.deleteDisciplinaryAction).toHaveBeenCalledWith(5));
  });
});
