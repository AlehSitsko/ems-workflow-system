import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CallCard from "./CallCard";

// Settings context only supplies the time format; a fixed 12h is enough here.
vi.mock("../../context/useUserSettings", () => ({
  useUserSettings: () => ({ settings: { ui: { time_format: "12h" } } }),
}));

const baseCall = (over = {}) => ({
  id: 42,
  patient_name: "George Alvarez",
  call_type: "scheduled",
  status: "new",
  pickup_time: "10:30",
  pickup_address: "88 Riverside Ave",
  dropoff_address: "Springfield Memorial",
  ...over,
});

describe("CallCard", () => {
  it("renders the patient name", () => {
    render(<CallCard call={baseCall()} onDragStart={vi.fn()} />);
    expect(screen.getByText("George Alvarez")).toBeInTheDocument();
  });

  it("falls back to the call id when there is no patient name", () => {
    render(<CallCard call={baseCall({ patient_name: "" })} onDragStart={vi.fn()} />);
    expect(screen.getByText("Call #42")).toBeInTheDocument();
  });

  it("renders the pickup → dropoff route", () => {
    render(<CallCard call={baseCall()} onDragStart={vi.fn()} />);
    expect(screen.getByText(/88 Riverside Ave/)).toBeInTheDocument();
    expect(screen.getByText(/Springfield Memorial/)).toBeInTheDocument();
  });

  it("flags an emergency call", () => {
    render(<CallCard call={baseCall({ call_type: "emergency" })} onDragStart={vi.fn()} />);
    expect(screen.getByText("EMRG")).toBeInTheDocument();
  });

  it("shows the will-call treatment and hides the pickup time", () => {
    render(<CallCard call={baseCall({ call_type: "will_call" })} onDragStart={vi.fn()} />);
    expect(screen.getByText("WILL CALL")).toBeInTheDocument();
    expect(screen.getByText(/Will call when ready/)).toBeInTheDocument();
  });

  it("marks a return leg", () => {
    render(<CallCard call={baseCall({ _slot: "return" })} onDragStart={vi.fn()} />);
    expect(screen.getByText("RETURN")).toBeInTheDocument();
  });

  it("renders a cancelled call: badge, reason, and not draggable", () => {
    const { container } = render(
      <CallCard call={baseCall({ status: "cancelled", cancel_reason: "Patient no-show" })}
                onDragStart={vi.fn()} />);
    expect(screen.getByText("CNCL")).toBeInTheDocument();
    expect(screen.getByText(/Patient no-show/)).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute("draggable", "false");
  });

  it("renders a completed call with the DONE badge", () => {
    render(<CallCard call={baseCall({ status: "completed" })} onDragStart={vi.fn()} />);
    expect(screen.getByText("DONE")).toBeInTheDocument();
  });

  it("fires onCardClick with the call and its completed flag", () => {
    const onCardClick = vi.fn();
    render(<CallCard call={baseCall({ status: "completed" })} onDragStart={vi.fn()} onCardClick={onCardClick} />);
    fireEvent.click(screen.getByText("George Alvarez"));
    expect(onCardClick).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), true);
  });

  it("passes the call to onDragStart", () => {
    const onDragStart = vi.fn();
    const { container } = render(<CallCard call={baseCall()} onDragStart={onDragStart} />);
    fireEvent.dragStart(container.firstChild, { dataTransfer: { effectAllowed: "" } });
    expect(onDragStart).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });

  it("shows a patient-alert badge with an accessible title", () => {
    render(<CallCard call={baseCall({ patient_alert_severity: "critical", patient_alert_count: 2 })}
                     onDragStart={vi.fn()} />);
    expect(screen.getByTitle(/2 active patient alert/)).toBeInTheDocument();
  });
});
