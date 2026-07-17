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
  // These roles have task access, so the async task summary loads after render;
  // each test awaits it so that state update settles inside act().
  it("shows only destinations the user may open", async () => {
    renderHome(hr);
    // The tile list is derived from route metadata rather than hand-copied, so a
    // role that cannot open Dispatch is never offered a tile to it.
    expect(screen.queryByRole("link", { name: /Dispatch Board/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Vehicles/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Employees/ })).toBeInTheDocument();
    await screen.findByText("My Open Tasks");
  });

  it("offers operational destinations to a dispatcher-capable role", async () => {
    renderHome(admin);
    expect(screen.getByRole("link", { name: /Dispatch Board/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Vehicles/ })).toBeInTheDocument();
    await screen.findByText("My Open Tasks");
  });

  it("does not repeat the header's Start Taking Call CTA", async () => {
    renderHome(admin);
    expect(screen.queryByText("Start Taking Call")).not.toBeInTheDocument();
    await screen.findByText("My Open Tasks");
  });

  it("does not link to the dashboard from its own quick navigation", async () => {
    renderHome(admin);
    const selfLinks = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/home");
    expect(selfLinks).toHaveLength(0);
    await screen.findByText("My Open Tasks");
  });
});

describe("Dashboard task KPIs", () => {
  it("renders the summary the API returned", async () => {
    renderHome(admin);
    expect(await screen.findByText("My Open Tasks")).toBeInTheDocument();
    expect(screen.getByText("Unassigned Tasks")).toBeInTheDocument();
  });

  it("links each KPI to the list its count came from", async () => {
    renderHome(admin);
    const href = async (label) =>
      (await screen.findByText(label)).closest("a").getAttribute("href");

    // The query mirrors the filter the summary endpoint applied; backend
    // test_my_overdue_kpi_matches_the_list_it_links_to holds the two together.
    expect(await href("My Open Tasks")).toBe("/tasks?mine=1&open=1");
    expect(await href("My Overdue Tasks")).toBe("/tasks?mine=1&overdue=1");
    expect(await href("Unassigned Tasks")).toBe("/tasks?unassigned=1&open=1");
    expect(await href("Total Overdue")).toBe("/tasks?overdue=1");
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
