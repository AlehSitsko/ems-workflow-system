import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Sidebar from "./Sidebar";

const admin = { id: 1, role: "admin", display_name: "Admin User" };
const hr = { id: 4, role: "hr", display_name: "HR User" };

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
  it("renders groups from route metadata, in order", () => {
    renderSidebar();
    const nav = screen.getByLabelText("Main navigation");
    expect(within(nav).getByText("Main")).toBeInTheDocument();
    expect(within(nav).getByText("Operations")).toBeInTheDocument();
    expect(within(nav).getByText("Fleet")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/home");
  });

  it("scopes navigation to the user's role", () => {
    renderSidebar({ currentUser: hr });
    // HR has no operational reason to see these, and the API rejects them.
    expect(screen.queryByRole("link", { name: "Dispatch Board" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Vehicles" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Employees" })).toBeInTheDocument();
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
