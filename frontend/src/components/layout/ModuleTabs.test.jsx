import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ModuleTabs from "./ModuleTabs";
import { getActiveHub } from "../../config/routeMetadata";

const admin = { id: 1, role: "admin", display_name: "Admin" };
const dispatcher = { id: 3, role: "dispatcher", display_name: "Dispatcher" };

function renderTabs(hub, { route = "/calls", ...props } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ModuleTabs hub={hub} {...props} />
    </MemoryRouter>,
  );
}

describe("ModuleTabs", () => {
  it("renders nothing outside a hub, so plain pages stay plain", () => {
    const { container } = renderTabs(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the hub's pages, each keeping its own route", () => {
    renderTabs(getActiveHub("/calls", admin));
    const tabs = screen.getByRole("navigation", { name: "Calls & Scheduling sections" });

    expect(within(tabs).getByRole("link", { name: "All Calls" })).toHaveAttribute("href", "/calls");
    expect(within(tabs).getByRole("link", { name: "Scheduling Inbox" }))
      .toHaveAttribute("href", "/scheduling-inbox");
    expect(within(tabs).getByRole("link", { name: "Recurring Trips" }))
      .toHaveAttribute("href", "/recurring-trips");
    expect(within(tabs).getByRole("link", { name: "Confirmations" }))
      .toHaveAttribute("href", "/confirmation-round");
  });

  it("marks the page being viewed", () => {
    renderTabs(getActiveHub("/scheduling-inbox", admin), { route: "/scheduling-inbox" });
    expect(screen.getByRole("link", { name: "Scheduling Inbox" }).className).toContain("active");
    expect(screen.getByRole("link", { name: "All Calls" }).className).not.toContain("active");
  });

  it("shows waiting counts on the tab that owns them", () => {
    renderTabs(getActiveHub("/calls", admin), {
      badgeFor: (item) => (item.badgeKey === "schedulingInbox" ? 6 : 0),
    });
    expect(screen.getByRole("link", { name: "Scheduling Inbox, 6 waiting" })).toHaveTextContent("6");
    expect(screen.getByRole("link", { name: "Confirmations" })).not.toHaveTextContent(/\d/);
  });

  it("carries the section's own action", () => {
    renderTabs(getActiveHub("/calls", admin), { actions: <button type="button">New Call</button> });
    expect(screen.getByRole("button", { name: "New Call" })).toBeInTheDocument();
  });

  it("never offers a tab the role could not open", () => {
    // The hub comes from the permission-filtered tree, so this holds by
    // construction — the test pins that it stays that way.
    const hub = getActiveHub("/fleet/vehicles", dispatcher);
    renderTabs(hub, { route: "/fleet/vehicles" });
    expect(screen.getByRole("link", { name: "Vehicles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crew Planner" })).toBeInTheDocument();
  });
});
