import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import DashboardSettings from "./DashboardSettings";

const allowedLinks = [
  { path: "/dispatch", title: "Dispatch Board", subtitle: "", icon: null },
  { path: "/calendar", title: "Calendar", subtitle: "", icon: null },
  { path: "/employees", title: "Employees", subtitle: "", icon: null },
  { path: "/tasks", title: "Tasks", subtitle: "", icon: null },
];
const roleDefaults = ["/dispatch", "/calendar"];

function setup(value = { quickLinks: null, hiddenWidgets: [] }) {
  const onChange = vi.fn();
  render(
    <DashboardSettings
      value={value}
      allowedLinks={allowedLinks}
      roleDefaults={roleDefaults}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("DashboardSettings", () => {
  it("shows role-default shortcuts as selected when quickLinks is null", () => {
    setup();
    // Selected rows have a Remove button; the two defaults are selected.
    expect(screen.getAllByRole("button", { name: /remove .* from shortcuts/i })).toHaveLength(2);
    // The rest are offered as add buttons (labelled by their page title).
    expect(screen.getByRole("button", { name: "Employees" })).toBeInTheDocument();
  });

  it("materialises the default list when adding a shortcut", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "Employees" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ quickLinks: ["/dispatch", "/calendar", "/employees"] }),
    );
  });

  it("removes a selected shortcut", () => {
    const onChange = setup({ quickLinks: ["/dispatch", "/calendar"], hiddenWidgets: [] });
    fireEvent.click(screen.getByRole("button", { name: /remove dispatch board from shortcuts/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ quickLinks: ["/calendar"] }));
  });

  it("reorders a shortcut down", () => {
    const onChange = setup({ quickLinks: ["/dispatch", "/calendar"], hiddenWidgets: [] });
    fireEvent.click(screen.getByRole("button", { name: /move dispatch board down/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ quickLinks: ["/calendar", "/dispatch"] }));
  });

  it("resets to role defaults", () => {
    const onChange = setup({ quickLinks: ["/tasks"], hiddenWidgets: [] });
    fireEvent.click(screen.getByRole("button", { name: /reset to default/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ quickLinks: null }));
  });

  it("hides a widget by adding it to hiddenWidgets", () => {
    const onChange = setup();
    fireEvent.click(screen.getByLabelText("My tasks"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hiddenWidgets: ["tasks"] }));
  });

  it("does not offer a reset while on role defaults", () => {
    setup();
    expect(screen.queryByRole("button", { name: /reset to default/i })).not.toBeInTheDocument();
  });
});
