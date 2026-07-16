import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import HomePage from "./HomePage";

vi.mock("../api/timeApi", () => ({
  kioskStatus: vi.fn(() => Promise.resolve({ clocked_in: false, clock_in: null })),
  kioskClockIn: vi.fn(),
  kioskClockOut: vi.fn(),
}));

vi.mock("../api/tasksApi", () => ({
  getTaskSummary: vi.fn(() => Promise.resolve({
    my_open: 3, my_overdue: 1, due_today: 2, unassigned_count: 4, total_overdue: 5,
  })),
}));

const admin = { id: 1, role: "admin", display_name: "Admin User" };
const hr = { id: 4, role: "hr", display_name: "HR User" };

function renderHome(currentUser = admin) {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <HomePage currentUser={currentUser} />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("Dashboard quick navigation", () => {
  it("shows only destinations the user may open", () => {
    renderHome(hr);
    // The tile list is derived from route metadata rather than hand-copied, so a
    // role that cannot open Dispatch is never offered a tile to it.
    expect(screen.queryByRole("link", { name: /Dispatch Board/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Vehicles/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Employees/ })).toBeInTheDocument();
  });

  it("offers operational destinations to a dispatcher-capable role", () => {
    renderHome(admin);
    expect(screen.getByRole("link", { name: /Dispatch Board/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Vehicles/ })).toBeInTheDocument();
  });

  it("does not repeat the header's Start Taking Call CTA", () => {
    renderHome(admin);
    expect(screen.queryByText("Start Taking Call")).not.toBeInTheDocument();
  });

  it("does not link to the dashboard from its own quick navigation", () => {
    renderHome(admin);
    const selfLinks = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/home");
    expect(selfLinks).toHaveLength(0);
  });
});

describe("Dashboard task KPIs", () => {
  it("renders the summary the API returned", async () => {
    renderHome(admin);
    expect(await screen.findByText("My Open Tasks")).toBeInTheDocument();
    expect(screen.getByText("Unassigned Tasks")).toBeInTheDocument();
  });

  it("hides manager-only KPIs from other roles", async () => {
    renderHome({ id: 9, role: "dispatcher", display_name: "Dispatcher" });
    expect(await screen.findByText("My Open Tasks")).toBeInTheDocument();
    expect(screen.queryByText("Unassigned Tasks")).not.toBeInTheDocument();
  });

  it("shows no task KPIs for a role without task access", () => {
    renderHome({ id: 7, role: "user", display_name: "Field User" });
    expect(screen.queryByText("My Open Tasks")).not.toBeInTheDocument();
  });
});
