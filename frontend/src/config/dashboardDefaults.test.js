import { describe, it, expect } from "vitest";

import {
  roleQuickLinks, resolveQuickLinkPaths, isWidgetHidden, QUICK_LINKS_BY_ROLE,
} from "./dashboardDefaults";

describe("dashboardDefaults", () => {
  it("returns the role's default shortcuts", () => {
    expect(roleQuickLinks("hr")).toEqual(QUICK_LINKS_BY_ROLE.hr);
    expect(roleQuickLinks("nobody")).toEqual([]);
  });

  it("resolves to the role default when no custom list is set", () => {
    expect(resolveQuickLinkPaths("admin", null)).toEqual(QUICK_LINKS_BY_ROLE.admin);
    expect(resolveQuickLinkPaths("admin", { quickLinks: null })).toEqual(QUICK_LINKS_BY_ROLE.admin);
  });

  it("resolves to the user's custom list when set, order preserved", () => {
    const custom = ["/calendar", "/dispatch"];
    expect(resolveQuickLinkPaths("admin", { quickLinks: custom })).toEqual(custom);
  });

  it("treats an empty custom list as an explicit choice, not a fallback", () => {
    // A user who removed every shortcut gets none — not the role default back.
    expect(resolveQuickLinkPaths("admin", { quickLinks: [] })).toEqual([]);
  });

  it("reads widget visibility from hiddenWidgets", () => {
    expect(isWidgetHidden({ hiddenWidgets: ["tasks"] }, "tasks")).toBe(true);
    expect(isWidgetHidden({ hiddenWidgets: ["tasks"] }, "todayBoard")).toBe(false);
    expect(isWidgetHidden(null, "tasks")).toBe(false);
    expect(isWidgetHidden({}, "tasks")).toBe(false);
  });
});
