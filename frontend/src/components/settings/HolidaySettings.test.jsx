import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import HolidaySettings from "./HolidaySettings";
import * as api from "../../api/holidaysApi";

vi.mock("../../api/holidaysApi");

describe("HolidaySettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listHolidays.mockResolvedValue([{ id: 1, date: "2026-07-04", name: "Independence Day" }]);
    api.createHoliday.mockResolvedValue({ id: 2, date: "2026-12-25", name: "Christmas" });
    api.deleteHoliday.mockResolvedValue({});
  });

  it("lists holidays", async () => {
    render(<HolidaySettings />);
    expect(await screen.findByText(/Independence Day/)).toBeInTheDocument();
  });

  it("adds a holiday", async () => {
    render(<HolidaySettings />);
    await screen.findByText(/Independence Day/);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-25" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Christmas" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    await waitFor(() => expect(api.createHoliday).toHaveBeenCalledWith("2026-12-25", "Christmas"));
  });

  it("deletes a holiday", async () => {
    render(<HolidaySettings />);
    await screen.findByText(/Independence Day/);
    fireEvent.click(screen.getByRole("button", { name: /delete independence day/i }));
    await waitFor(() => expect(api.deleteHoliday).toHaveBeenCalledWith(1));
  });
});
