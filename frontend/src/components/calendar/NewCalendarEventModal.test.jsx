import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import NewCalendarEventModal from "./NewCalendarEventModal";
import * as api from "../../api/calendarEventsApi";

vi.mock("../../api/calendarEventsApi");

function setup(user = { role: "dispatcher" }, extra = {}) {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(
    <NewCalendarEventModal
      open
      onClose={onClose}
      onCreated={onCreated}
      currentUser={user}
      defaultDate="2026-08-10"
      {...extra}
    />,
  );
  return { onCreated, onClose };
}

describe("NewCalendarEventModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.createCalendarEvent.mockResolvedValue({ id: 1 });
  });

  it("hides role/company options from a dispatcher", () => {
    setup({ role: "dispatcher" });
    const options = Array.from(screen.getByLabelText("Visibility").querySelectorAll("option")).map((o) => o.value);
    expect(options).toEqual(["personal"]);
    expect(screen.getByText(/Only admins and supervisors can share/i)).toBeInTheDocument();
  });

  it("offers role and company to a supervisor", () => {
    setup({ role: "supervisor" });
    const options = Array.from(screen.getByLabelText("Visibility").querySelectorAll("option")).map((o) => o.value);
    expect(options).toEqual(["personal", "role", "company"]);
  });

  it("requires a title", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));
    expect(await screen.findByText(/Title and date are required/i)).toBeInTheDocument();
    expect(api.createCalendarEvent).not.toHaveBeenCalled();
  });

  it("creates a personal event and signals success", async () => {
    const { onCreated, onClose } = setup();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Dentist" } });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => expect(api.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Dentist", eventDate: "2026-08-10", visibility: "personal" }),
    ));
    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the role picker only for a role-scoped event", () => {
    setup({ role: "admin" });
    expect(screen.queryByLabelText("Which role")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: "role" } });
    expect(screen.getByLabelText("Which role")).toBeInTheDocument();
  });
});
