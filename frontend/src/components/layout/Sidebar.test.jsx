import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Sidebar from "./Sidebar";

const admin = { id: 1, role: "admin", display_name: "Admin User" };
const hr = { id: 4, role: "hr", display_name: "HR User" };
const dispatcher = { id: 3, role: "dispatcher", display_name: "Dispatcher User" };

function renderSidebar(props = {}, { route = "/home" } = {}) {
  const merged = { currentUser: admin, ...props };
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <Sidebar {...merged} />
    </MemoryRouter>,
  );
  return { ...utils, props: merged };
}

describe("Sidebar navigation", () => {
  it("renders the sections from route metadata", () => {
    renderSidebar();
    const nav = screen.getByLabelText("Main navigation");
    ["Operations", "Resources", "Workforce", "Administration"].forEach((title) => {
      expect(within(nav).getByText(title)).toBeInTheDocument();
    });
    // Dashboard sits above the sections rather than inside one.
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/home");
  });

  it("scopes navigation to the user's role", () => {
    renderSidebar({ currentUser: hr });
    // HR has no operational reason to see these, and the API rejects them.
    expect(screen.queryByRole("link", { name: "Dispatch Board" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Vehicles" })).not.toBeInTheDocument();
    // Employees is a hub for HR — all four of its pages are permitted.
    expect(screen.getByRole("button", { name: "Employees" })).toBeInTheDocument();
  });

  it("drops a section whose every item is denied", () => {
    renderSidebar({ currentUser: hr });
    const nav = screen.getByLabelText("Main navigation");
    // Patients, Crew Planner and Vehicles are all operational — nothing is left
    // of Resources for HR, so the heading must go too.
    expect(within(nav).queryByText("Resources")).not.toBeInTheDocument();
    expect(within(nav).getByText("Workforce")).toBeInTheDocument();
  });

  it("marks the current route as active", () => {
    renderSidebar({}, { route: "/patients" });
    expect(screen.getByRole("link", { name: "Patients" }).className).toContain("active");
    expect(screen.getByRole("link", { name: "Dashboard" }).className).not.toContain("active");
  });
});

describe("Sidebar collapse (desktop)", () => {
  it("keeps labels reachable when collapsed by using them as accessible names", () => {
    renderSidebar({ collapsed: true });
    const link = screen.getByRole("link", { name: "Patients" });
    expect(link).toHaveAttribute("title", "Patients");
  });

  it("reports collapse state and fires the toggle", () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ collapsed: false, onToggleCollapse });
    const button = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it("offers no collapse control on mobile — the panel is full width there", () => {
    renderSidebar({ isMobile: true, mobileOpen: true });
    expect(screen.queryByRole("button", { name: /Collapse sidebar/ })).not.toBeInTheDocument();
  });
});

describe("Sidebar off-canvas (mobile)", () => {
  it("is a modal dialog when open", () => {
    renderSidebar({ isMobile: true, mobileOpen: true });
    const aside = screen.getByLabelText("Main navigation");
    expect(aside).toHaveAttribute("role", "dialog");
    expect(aside).toHaveAttribute("aria-modal", "true");
    expect(aside.className).toContain("open");
  });

  it("is hidden from assistive tech when closed", () => {
    renderSidebar({ isMobile: true, mobileOpen: false });
    expect(screen.getByLabelText("Main navigation")).toHaveAttribute("aria-hidden", "true");
  });

  it("closes on Escape", () => {
    const onCloseMobile = vi.fn();
    renderSidebar({ isMobile: true, mobileOpen: true, onCloseMobile });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCloseMobile).toHaveBeenCalled();
  });

  it("closes when the scrim behind it is clicked", () => {
    const onCloseMobile = vi.fn();
    const { container } = renderSidebar({ isMobile: true, mobileOpen: true, onCloseMobile });
    fireEvent.click(container.querySelector(".sidebar-scrim"));
    expect(onCloseMobile).toHaveBeenCalled();
  });

  it("closes after picking a destination", () => {
    const onCloseMobile = vi.fn();
    renderSidebar({ isMobile: true, mobileOpen: true, onCloseMobile });
    fireEvent.click(screen.getByRole("link", { name: "Patients" }));
    expect(onCloseMobile).toHaveBeenCalled();
  });

  it("locks background scroll only while open", () => {
    const { unmount } = renderSidebar({ isMobile: true, mobileOpen: true, onCloseMobile: vi.fn() });
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("moves focus into the panel when it opens", () => {
    renderSidebar({ isMobile: true, mobileOpen: true, onCloseMobile: vi.fn() });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close navigation" }));
  });
});

describe("Sidebar hubs (two-level navigation)", () => {
  const hubName = "Calls & Scheduling";

  it("renders a hub as an expandable button, not a link", () => {
    renderSidebar();
    const toggle = screen.getByRole("button", { name: hubName });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "sidebar-hub-calls-scheduling");
    // Closed: its pages are not in the document at all.
    expect(screen.queryByRole("link", { name: "Scheduling Inbox" })).not.toBeInTheDocument();
  });

  it("opens and closes on click, and says so to assistive tech", () => {
    renderSidebar();
    const toggle = screen.getByRole("button", { name: hubName });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const submenu = screen.getByRole("group", { name: hubName });
    expect(within(submenu).getByRole("link", { name: "Scheduling Inbox" }))
      .toHaveAttribute("href", "/scheduling-inbox");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("is operable from the keyboard because it is a real button", () => {
    renderSidebar();
    const toggle = screen.getByRole("button", { name: hubName });
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    // A <button> fires click on Enter/Space natively; jsdom needs the click.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the hub that contains the current page", () => {
    renderSidebar({}, { route: "/recurring-trips" });
    expect(screen.getByRole("button", { name: hubName })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Recurring Trips" }).className).toContain("active");
  });

  it("opens the hub for a detail route via its parent", () => {
    // /calls/42 is a call's own page; it still belongs to Calls & Scheduling.
    renderSidebar({}, { route: "/calls/42" });
    expect(screen.getByRole("button", { name: hubName })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps only one hub open at a time", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: hubName }));
    fireEvent.click(screen.getByRole("button", { name: "Fleet & Crews" }));

    expect(screen.getByRole("button", { name: hubName })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Fleet & Crews" })).toHaveAttribute("aria-expanded", "true");
  });

  it("marks a closed hub that holds the current page", () => {
    renderSidebar({}, { route: "/scheduling-inbox" });
    const toggle = screen.getByRole("button", { name: hubName });
    fireEvent.click(toggle);   // user closes it deliberately
    expect(toggle.className).toContain("contains-active");
  });

  it("collapses a hub with one permitted child into a plain link", () => {
    // A dispatcher may open Vehicles and Crew Planner but no Workforce page, so
    // the Employees hub disappears rather than becoming a one-item disclosure.
    renderSidebar({ currentUser: dispatcher });
    expect(screen.queryByRole("button", { name: "Employees" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tasks" })).toBeInTheDocument();
  });

  it("expands the rail instead of showing a submenu with no room for it", () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ collapsed: true, onToggleCollapse });
    const toggle = screen.getByRole("button", { name: hubName });

    // Collapsed, aria-expanded would describe a submenu that is not rendered.
    expect(toggle).not.toHaveAttribute("aria-expanded");
    fireEvent.click(toggle);
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it("closes the mobile drawer after picking a page inside a hub", () => {
    const onCloseMobile = vi.fn();
    renderSidebar({ isMobile: true, mobileOpen: true, onCloseMobile });
    fireEvent.click(screen.getByRole("button", { name: hubName }));
    fireEvent.click(screen.getByRole("link", { name: "Confirmations" }));
    expect(onCloseMobile).toHaveBeenCalled();
  });
});

describe("Sidebar badges", () => {
  it("shows a count only where there is work waiting", () => {
    renderSidebar({ attentionCounts: { schedulingInbox: 3, confirmationRound: 0 } });
    fireEvent.click(screen.getByRole("button", { name: /Calls & Scheduling/ }));

    expect(screen.getByRole("link", { name: "Scheduling Inbox, 3 waiting" })).toBeInTheDocument();
    // Zero renders no badge — "nothing waiting" reads better as nothing.
    expect(screen.getByRole("link", { name: "Confirmations" })).toBeInTheDocument();
  });

  it("rolls child counts up onto a closed hub", () => {
    renderSidebar({ attentionCounts: { schedulingInbox: 3, confirmationRound: 2 } });
    expect(screen.getByRole("button", { name: "Calls & Scheduling, 5 waiting" })).toBeInTheDocument();
  });

  it("never counts work the role cannot open", () => {
    // leaveReview is an HR queue; a dispatcher has no Leave page to badge.
    renderSidebar({ currentUser: dispatcher, attentionCounts: { leaveReview: 4 } });
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });
});
