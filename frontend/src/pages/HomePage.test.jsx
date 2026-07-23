import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

const attention = vi.hoisted(() => ({ value: {} }));
vi.mock("../api/operationsApi", () => ({
  getAttentionCounts: vi.fn(() => Promise.resolve(attention.value)),
}));

const board = vi.hoisted(() => ({ value: { openCalls: [], units: [], completedCalls: [] } }));
vi.mock("../api/dispatchApi", () => ({
  fetchBoard: vi.fn(() => Promise.resolve(board.value)),
}));

const admin = { id: 1, role: "admin", display_name: "Admin User" };
const hr = { id: 4, role: "hr", display_name: "HR User" };
const dispatcher = { id: 3, role: "dispatcher", display_name: "Dispatcher User" };

function renderHome(currentUser = admin) {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <HomePage currentUser={currentUser} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  attention.value = {};
  board.value = { openCalls: [], units: [], completedCalls: [] };
});

describe("Dashboard priorities", () => {
  it("is an overview of the day, not a copy of the menu", async () => {
    const { container } = renderHome(admin);
    await screen.findByText("My Open Tasks");

    // The sidebar already lists every page; repeating it here told nobody what
    // was urgent. Navigation is now a short role-specific set — everything else
    // on the page is a number about today, not a destination.
    expect(container.querySelectorAll(".quick-tile").length).toBeLessThanOrEqual(5);
    ["User Manual", "Audit Log", "Kiosk", "Settings", "Patients"].forEach((name) => {
      expect(screen.queryByRole("link", { name: new RegExp(name) }),
        `${name} should not be reproduced on the dashboard`).not.toBeInTheDocument();
    });
  });

  it("surfaces waiting work with the count the API reported", async () => {
    attention.value = { schedulingInbox: 4, confirmationRound: 7, dayCloseout: 0 };
    renderHome(dispatcher);

    const inbox = await screen.findByRole("link", { name: /Calls with no date/ });
    expect(inbox).toHaveAttribute("href", "/scheduling-inbox");
    expect(inbox).toHaveTextContent("4");
    expect(screen.getByRole("link", { name: /Trips to confirm tomorrow/ })).toHaveTextContent("7");
  });

  it("says nothing about a queue that is empty", async () => {
    attention.value = { schedulingInbox: 0, confirmationRound: 0, dayCloseout: 0 };
    renderHome(dispatcher);
    await waitFor(() => {
      expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
    });
  });

  it("flags an operational day nobody signed off", async () => {
    attention.value = { dayCloseout: 1 };
    renderHome(dispatcher);
    expect(await screen.findByRole("link", { name: /not signed off/ }))
      .toHaveAttribute("href", "/day-closeout");
  });

  it("counts today's board the way the board itself counts it", async () => {
    // Assigning a call moves it out of openCalls, so these are the unassigned
    // ones; the assigned ones sit under their unit.
    board.value = {
      openCalls: [{ id: 1 }, { id: 2 }],
      units: [{ id: 9, assignedCalls: [{ id: 3 }] }],
      completedCalls: [{ id: 4 }],
    };
    renderHome(dispatcher);

    const toAssign = await screen.findByRole("link", { name: /Calls to assign/ });
    expect(toAssign).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: /Assigned/ })).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /Units on duty/ })).toHaveTextContent("1");
  });

  it("does not ask for a board the role may not open", async () => {
    const { fetchBoard } = await import("../api/dispatchApi");
    renderHome(hr);
    await screen.findByText("My Open Tasks");
    // HR has no dispatch access; requesting it would 403 and leak a queue count.
    expect(fetchBoard).not.toHaveBeenCalled();
  });
});

describe("Dashboard role awareness", () => {
  it("offers the call CTA only to roles that may take calls", async () => {
    renderHome(dispatcher);
    expect(await screen.findByRole("link", { name: /Start Taking Call/ }))
      .toHaveAttribute("href", "/call-form");
  });

  it("withholds the call CTA from a role that cannot take calls", async () => {
    renderHome(hr);
    await screen.findByText("My Open Tasks");
    expect(screen.queryByRole("link", { name: /Start Taking Call/ })).not.toBeInTheDocument();
  });

  it("gives each role its own quick links", async () => {
    renderHome(hr);
    await screen.findByText("My Open Tasks");
    expect(screen.getByRole("link", { name: /Employees/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Payroll/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Dispatch Board/ })).not.toBeInTheDocument();
  });

  it("never links a role somewhere it would be turned away", async () => {
    renderHome(dispatcher);
    await screen.findByText("My Open Tasks");
    ["Payroll", "Compliance", "Users", "Leave"].forEach((name) => {
      expect(screen.queryByRole("link", { name: new RegExp(name) })).not.toBeInTheDocument();
    });
  });
});

describe("Dashboard task KPIs", () => {
  it("renders the summary the API returned", async () => {
    renderHome(admin);
    expect(await screen.findByText("My Open Tasks")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("links each KPI to the list its count came from", async () => {
    renderHome(admin);
    const link = await screen.findByRole("link", { name: /My Overdue Tasks/ });
    expect(link).toHaveAttribute("href", "/tasks?mine=1&overdue=1");
  });

  it("hides manager-only KPIs from other roles", async () => {
    renderHome({ id: 3, role: "dispatcher", display_name: "D" });
    await screen.findByText("My Open Tasks");
    expect(screen.queryByText("Unassigned Tasks")).not.toBeInTheDocument();
  });
});
