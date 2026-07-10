import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusPill from "./StatusPill";
import { STATUS_LABELS } from "../../utils/dispatchBoardUtils";

// Smoke test proving the React Testing Library + jsdom setup works end to end
// against a real (tiny, pure) component.
describe("StatusPill", () => {
  it("renders the human label for a known status", () => {
    const status = Object.keys(STATUS_LABELS)[0];
    render(<StatusPill status={status} />);
    expect(screen.getByText(STATUS_LABELS[status])).toBeInTheDocument();
  });

  it("falls back to the raw status when unknown", () => {
    render(<StatusPill status="mystery_status" />);
    expect(screen.getByText("mystery_status")).toBeInTheDocument();
  });
});
