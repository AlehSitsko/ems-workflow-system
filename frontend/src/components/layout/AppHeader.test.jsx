import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AppHeader from "./AppHeader";
import { ThemeContext } from "../../context/useTheme";
import { getRouteMetadata } from "../../config/routeMetadata";

const dispatcher = { id: 3, role: "dispatcher", display_name: "Dispatcher User" };
const hr = { id: 4, role: "hr", display_name: "HR User" };

function renderHeader(props = {}) {
  const merged = {
    meta: getRouteMetadata("/patients"),
    currentUser: dispatcher,
    onLogout: vi.fn(),
    notifications: [],
    unreadCount: 0,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    isMobile: false,
    mobileNavOpen: false,
    onToggleMobileNav: vi.fn(),
    sidebarId: "app-sidebar",
    ...props,
  };
  render(
    <MemoryRouter>
      <ThemeContext.Provider value={{ theme: "light", toggleTheme: vi.fn() }}>
        <AppHeader {...merged} />
      </ThemeContext.Provider>
    </MemoryRouter>,
  );
  return merged;
}

describe("AppHeader title", () => {
  it("shows the route's title and subtitle, not the product name", () => {
    renderHeader();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Patients");
    expect(screen.getByText("Search, review, and manage patient records")).toBeInTheDocument();
    expect(screen.queryByText("EMS Workflow System")).not.toBeInTheDocument();
  });

  it("renders exactly one h1 per page", () => {
    renderHeader();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("follows the route", () => {
    renderHeader({ meta: getRouteMetadata("/dispatch") });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dispatch Board");
  });
});

describe("AppHeader hamburger", () => {
  it("is absent on desktop — the sidebar is permanent and owns its collapse control", () => {
    renderHeader({ isMobile: false });
    expect(screen.queryByRole("button", { name: /navigation/i })).not.toBeInTheDocument();
  });

  it("appears on mobile and reports its state to assistive tech", () => {
    renderHeader({ isMobile: true, mobileNavOpen: false });
    const button = screen.getByRole("button", { name: "Open navigation" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "app-sidebar");
  });

  it("reflects the open state", () => {
    renderHeader({ isMobile: true, mobileNavOpen: true });
    const button = screen.getByRole("button", { name: "Close navigation" });
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("fires the toggle", () => {
    const props = renderHeader({ isMobile: true });
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(props.onToggleMobileNav).toHaveBeenCalled();
  });
});

describe("AppHeader actions", () => {
  it("shows Start Taking Call for a role that takes calls", () => {
    renderHeader({ currentUser: dispatcher });
    expect(screen.getByRole("link", { name: /Start Taking Call/ })).toHaveAttribute("href", "/call-form");
  });

  it("hides Start Taking Call from a role that does not take calls", () => {
    renderHeader({ currentUser: hr });
    expect(screen.queryByRole("link", { name: /Start Taking Call/ })).not.toBeInTheDocument();
  });

  it("has a working theme control rather than a decorative one", () => {
    const toggleTheme = vi.fn();
    render(
      <MemoryRouter>
        <ThemeContext.Provider value={{ theme: "light", toggleTheme }}>
          <AppHeader
            meta={getRouteMetadata("/home")} currentUser={dispatcher} onLogout={vi.fn()}
            notifications={[]} unreadCount={0} markRead={vi.fn()} markAllRead={vi.fn()}
            isMobile={false} mobileNavOpen={false} onToggleMobileNav={vi.fn()} sidebarId="app-sidebar"
          />
        </ThemeContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(toggleTheme).toHaveBeenCalled();
  });

  it("ships no disabled decorative search box", () => {
    const { container } = render(
      <MemoryRouter>
        <ThemeContext.Provider value={{ theme: "light", toggleTheme: vi.fn() }}>
          <AppHeader
            meta={getRouteMetadata("/home")} currentUser={dispatcher} onLogout={vi.fn()}
            notifications={[]} unreadCount={0} markRead={vi.fn()} markAllRead={vi.fn()}
            isMobile={false} mobileNavOpen={false} onToggleMobileNav={vi.fn()} sidebarId="app-sidebar"
          />
        </ThemeContext.Provider>
      </MemoryRouter>,
    );
    // The old header shipped a permanently-disabled search input. Global search
    // arrives as a real control; until then the slot stays empty.
    expect(container.querySelectorAll("input[disabled]")).toHaveLength(0);
  });
});
