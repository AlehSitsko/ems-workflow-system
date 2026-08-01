import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import NewCalendarEventModal from "./NewCalendarEventModal";
import * as api from "../../api/calendarEventsApi";
import * as employeesApi from "../../api/employeesApi";

vi.mock("../../api/calendarEventsApi");
vi.mock("../../api/employeesApi");

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
    api.updateCalendarEvent.mockResolvedValue({ id: 5 });
    employeesApi.getEmployees.mockResolvedValue([
      { id: 7, firstName: "Sam", lastName: "Cruz" },
      { id: 8, firstName: "Rae", lastName: "Ng" },
    ]);
  });

  it("hides role/company options from a dispatcher", () => {
    setup({ role: "dispatcher" });
    const options = Array.from(screen.getByLabelText("Visibility").querySelectorAll("option")).map((o) => o.value);
    expect(options).toEqual(["personal"]);
    expect(screen.getByText(/Only admins and supervisors can share/i)).toBeInTheDocument();
  });

  it("creates a weekly recurring event with an until date", async () => {
    setup({ role: "admin" });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Weekly sync" } });
    fireEvent.change(screen.getByLabelText("Repeats"), { target: { value: "weekly" } });
    // The 'Until' field only appears once it repeats.
    fireEvent.change(screen.getByLabelText(/Until/), { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => expect(api.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ recurrence: "weekly", recurrenceUntil: "2026-09-30" }),
    ));
  });

  it("hides the until field until an event repeats", () => {
    setup({ role: "admin" });
    expect(screen.queryByLabelText(/Until/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Repeats"), { target: { value: "monthly" } });
    expect(screen.getByLabelText(/Until/)).toBeInTheDocument();
  });

  it("prefills recurrence when editing a repeating event", () => {
    const event = {
      id: "calendar_event:5:2026-08-03", sourceId: 5, title: "Standup", date: "2026-08-03",
      allDay: true, metadata: { recurrence: "weekly", recurrenceUntil: "2026-09-30", visibility: "company" },
    };
    setup({ role: "admin" }, { event });
    expect(screen.getByLabelText("Repeats")).toHaveValue("weekly");
    expect(screen.getByLabelText(/Until/)).toHaveValue("2026-09-30");
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

  it("edits an existing event: prefilled and PATCHes by sourceId", async () => {
    const event = {
      id: "calendar_event:5", sourceId: 5, title: "All-hands", date: "2026-08-12",
      allDay: true,
      metadata: { category: "meeting", visibility: "company", description: "Q3 review" },
    };
    setup({ role: "admin" }, { event });

    expect(screen.getByText("Edit calendar event")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("All-hands");
    expect(screen.getByLabelText("Visibility")).toHaveValue("company");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "All-hands (Q3)" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(api.updateCalendarEvent).toHaveBeenCalledWith(
      5, expect.objectContaining({ title: "All-hands (Q3)", visibility: "company" }),
    ));
    expect(api.createCalendarEvent).not.toHaveBeenCalled();
  });

  it("shows the role picker only for a role-scoped event", () => {
    setup({ role: "admin" });
    expect(screen.queryByLabelText("Which role")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: "role" } });
    expect(screen.getByLabelText("Which role")).toBeInTheDocument();
  });

  it("sends the reminder and chosen participants in the payload", async () => {
    setup({ role: "admin" });
    // The roster loads asynchronously.
    await screen.findByRole("option", { name: "Sam Cruz" });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Kickoff" } });
    fireEvent.change(screen.getByLabelText("Remind"), { target: { value: "60" } });
    const picker = screen.getByLabelText(/Participants/);
    // Mark both <option>s selected, then fire change — jsdom reads selectedOptions.
    Array.from(picker.options).forEach((o) => { o.selected = o.value === "7" || o.value === "8"; });
    fireEvent.change(picker);
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => expect(api.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ reminderMinutes: 60, participantEmployeeIds: [7, 8] }),
    ));
  });

  it("prefills the reminder and participants when editing", async () => {
    const event = {
      id: "calendar_event:9", sourceId: 9, title: "Review", date: "2026-08-15", allDay: true,
      metadata: { visibility: "personal", reminderMinutes: 30, participants: [{ employeeId: 8, name: "Rae Ng" }] },
    };
    setup({ role: "admin" }, { event });
    await screen.findByRole("option", { name: "Rae Ng" });

    expect(screen.getByLabelText("Remind")).toHaveValue("30");
    const picker = screen.getByLabelText(/Participants/);
    const selected = Array.from(picker.selectedOptions).map((o) => o.value);
    expect(selected).toEqual(["8"]);
  });
});
