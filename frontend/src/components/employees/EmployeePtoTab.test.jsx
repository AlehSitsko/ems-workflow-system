import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import EmployeePtoTab from "./EmployeePtoTab";
import * as api from "../../api/ptoApi";

vi.mock("../../api/ptoApi");

const data = {
  employeeId: 7, balance: 4.5, annualDays: 15,
  ledger: [
    { id: 2, effectiveDate: "2026-02-01", kind: "accrual", deltaDays: 1.25, note: "monthly accrual" },
    { id: 1, effectiveDate: "2026-01-10", kind: "used", deltaDays: -2, note: "vacation" },
  ],
};

describe("EmployeePtoTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getEmployeePto.mockResolvedValue(data);
    api.runAccrual.mockResolvedValue({ posted: 1 });
    api.adjustPto.mockResolvedValue({ balance: 7.5 });
  });

  it("shows the balance and ledger", async () => {
    render(<EmployeePtoTab employeeId={7} />);
    expect(await screen.findByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("Used")).toBeInTheDocument();
    expect(screen.getByText("Accrual")).toBeInTheDocument();
  });

  it("runs accrual", async () => {
    render(<EmployeePtoTab employeeId={7} />);
    await screen.findByText("4.5");
    fireEvent.click(screen.getByRole("button", { name: /run accrual/i }));
    await waitFor(() => expect(api.runAccrual).toHaveBeenCalled());
  });

  it("posts a manual adjustment", async () => {
    render(<EmployeePtoTab employeeId={7} />);
    await screen.findByText("4.5");
    fireEvent.change(screen.getByLabelText(/Adjust/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "import" } });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    await waitFor(() => expect(api.adjustPto).toHaveBeenCalledWith(7, 3, "import"));
  });
});
