import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ROUTE_METADATA, GROUP_ORDER, NAV_SECTIONS, getRouteMetadata,
  getNavigationTree, getNavigationItems, getActiveHub,
} from "./routeMetadata";

const admin = { id: 1, role: "admin", display_name: "Admin" };
const dispatcher = { id: 3, role: "dispatcher", display_name: "Dispatcher" };
const hr = { id: 4, role: "hr", display_name: "HR" };
const supervisor = { id: 2, role: "supervisor", display_name: "Supervisor" };

describe("getRouteMetadata", () => {
  it("resolves an exact route", () => {
    expect(getRouteMetadata("/patients")).toMatchObject({
      title: "Patients", group: "Operations", width: "standard",
    });
  });

  it("resolves a parameterized route", () => {
    expect(getRouteMetadata("/fleet/vehicles/42")).toMatchObject({ title: "Vehicle", hidden: true });
  });

  it("prefers the exact route over the parameterized one", () => {
    // /fleet/vehicles must not resolve to /fleet/vehicles/:vehicleId
    expect(getRouteMetadata("/fleet/vehicles").title).toBe("Vehicles");
  });

  it("falls back for an unknown path instead of throwing", () => {
    const meta = getRouteMetadata("/nope/nowhere");
    expect(meta.title).toBe("EMS Workflow System");
    expect(meta.width).toBe("standard");
  });

  it("marks dense operational surfaces as wide", () => {
    ["/dispatch", "/calendar", "/supervisor", "/crew-planner"].forEach((p) => {
      expect(getRouteMetadata(p).width).toBe("wide");
    });
    ["/home", "/patients", "/fleet/vehicles", "/notifications"].forEach((p) => {
      expect(getRouteMetadata(p).width).toBe("standard");
    });
  });
});

describe("metadata integrity", () => {
  it("every entry has the fields the shell renders", () => {
    ROUTE_METADATA.forEach((r) => {
      expect(r.path, `${r.path} path`).toMatch(/^\//);
      expect(r.title, `${r.path} title`).toBeTruthy();
      expect(typeof r.canAccess, `${r.path} canAccess`).toBe("function");
      expect(["standard", "wide"], `${r.path} width`).toContain(r.width);
      expect(r.icon, `${r.path} icon`).toBeTruthy();
      expect(GROUP_ORDER, `${r.path} group`).toContain(r.group);
    });
  });

  it("has no duplicate paths", () => {
    const paths = ROUTE_METADATA.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("metadata stays in step with the router", () => {
  // Metadata is only useful if it actually covers the app. This reads the real
  // router so a new <Route> without metadata fails here instead of silently
  // rendering a page with a fallback header.
  // Resolved from the project root: vitest runs in jsdom, where import.meta.url
  // is not a file:// URL.
  const appSource = readFileSync(resolve(process.cwd(), "src/App.jsx"), "utf-8");
  // The app uses a data router (createHashRouter), so routes are config objects
  // `{ path: "...", element: ... }` rather than <Route path="..."> elements.
  const routerPaths = [...appSource.matchAll(/\bpath:\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => p !== "*" && p !== "/");

  // Rendered outside the AppShell, so it has no header/sidebar to describe.
  // Routes that render outside the ops AppShell, so they carry no shell metadata:
  // the login page and the employee portal (its own PortalLayout).
  const OUTSIDE_SHELL = ["/login", "/portal"];

  it("covers every shell route in the router", () => {
    const metaPaths = ROUTE_METADATA.map((r) => r.path);
    const missing = routerPaths.filter(
      (p) => !OUTSIDE_SHELL.includes(p) && !metaPaths.includes(p),
    );
    expect(missing, `routes missing metadata: ${missing.join(", ")}`).toEqual([]);
  });

  it("declares no route the router does not have", () => {
    const orphans = ROUTE_METADATA.map((r) => r.path).filter((p) => !routerPaths.includes(p));
    expect(orphans, `metadata for non-existent routes: ${orphans.join(", ")}`).toEqual([]);
  });
});

describe("navigation structure", () => {
  const paths = (u) => getNavigationItems(u).map((i) => i.path);

  it("points every nav node at a real route", () => {
    // A node with no metadata would render with no label and no permission
    // check, so it must fail here rather than in front of a user.
    const known = new Set(ROUTE_METADATA.map((r) => r.path));
    NAV_SECTIONS.forEach((section) => {
      section.items.forEach((item) => {
        const nodes = item.children || [item];
        nodes.forEach((node) => {
          expect(known.has(node.path), `${node.path} has no route metadata`).toBe(true);
        });
      });
    });
  });

  it("never puts one page in two places", () => {
    const all = NAV_SECTIONS.flatMap((s) =>
      s.items.flatMap((i) => (i.children || [i]).map((n) => n.path)));
    expect(new Set(all).size, "a duplicated nav entry").toBe(all.length);
  });

  it("keeps the top level short by grouping related pages", () => {
    // The point of the hubs: an admin sees every page, but not as one long list.
    const topLevel = getNavigationTree(admin).flatMap((s) => s.items);
    expect(topLevel.length).toBeLessThanOrEqual(16);
    expect(topLevel.filter((i) => i.type === "hub").length).toBeGreaterThanOrEqual(3);
  });

  it("never shows a hidden detail route", () => {
    expect(paths(admin)).not.toContain("/fleet/vehicles/:vehicleId");
    expect(paths(admin)).not.toContain("/calls/:callId");
  });

  it("leaves no page unreachable from the menu", () => {
    // Every visible route must be somewhere in the tree, or the refactor lost it.
    const navigable = new Set(paths(admin));
    const missing = ROUTE_METADATA
      .filter((r) => !r.hidden && r.canAccess(admin))
      .map((r) => r.path)
      .filter((p) => !navigable.has(p));
    expect(missing, `routes with no menu entry: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps the call form out of the menu without losing it", () => {
    // Taking a call is an action, reached from the header button and from New
    // Call inside Calls & Scheduling — but the route and its permission stand.
    const callForm = ROUTE_METADATA.find((r) => r.path === "/call-form");
    expect(callForm.hidden).toBe(true);
    expect(callForm.quickAction).toBe(true);
    expect(callForm.canAccess(dispatcher)).toBe(true);
    expect(callForm.canAccess(hr)).toBe(false);
    expect(paths(admin)).not.toContain("/call-form");
  });
});

describe("navigation permissions", () => {
  const paths = (u) => getNavigationItems(u).map((i) => i.path);

  it("scopes navigation to the role", () => {
    // HR has no operational reason to see the board, the fleet or crew planning —
    // and the API would reject them anyway (see backend tests/test_security.py).
    expect(paths(hr)).not.toContain("/dispatch");
    expect(paths(hr)).not.toContain("/fleet/vehicles");
    expect(paths(hr)).not.toContain("/crew-planner");
    expect(paths(hr)).not.toContain("/patients");
    expect(paths(hr)).toContain("/employees");

    // Dispatcher runs operations but does not administer users or staff records.
    expect(paths(dispatcher)).toContain("/dispatch");
    expect(paths(dispatcher)).toContain("/fleet/vehicles");
    expect(paths(dispatcher)).not.toContain("/users");
    expect(paths(dispatcher)).not.toContain("/payroll");

    expect(paths(admin)).toContain("/users");
  });

  it("matches the route guard on the audit log", () => {
    // The guard is EmployeeRoute (admin/supervisor/hr). The menu used to offer
    // it to dispatchers, who were bounced straight back to the dashboard.
    expect(paths(dispatcher)).not.toContain("/audit");
    expect(paths(hr)).toContain("/audit");
  });

  it("drops a hub whose every child is denied", () => {
    const hubs = (u) => getNavigationTree(u).flatMap((s) => s.items)
      .filter((i) => i.type === "hub").map((i) => i.label);

    expect(hubs(dispatcher)).not.toContain("Employees");
    expect(hubs(hr)).toContain("Employees");
    expect(hubs(hr)).not.toContain("Fleet & Crews");
  });

  it("drops a section left with nothing in it", () => {
    const sections = (u) => getNavigationTree(u).map((s) => s.title);
    // Resources is Patients + Fleet & Crews; HR may open none of them.
    expect(sections(hr)).not.toContain("Resources");
    expect(sections(dispatcher)).toContain("Resources");
  });

  it("collapses a single-child hub into a direct link, for every role alike", () => {
    // Consistency matters more than the individual case: the rule is applied by
    // getNavigationTree, so no role can meet a different one.
    const onlyOneChild = (user) => getNavigationTree(user)
      .flatMap((s) => s.items)
      .filter((i) => i.type === "hub")
      .every((hub) => hub.children.length > 1);

    [admin, supervisor, dispatcher, hr].forEach((user) => {
      expect(onlyOneChild(user), `${user.role} sees a one-item hub`).toBe(true);
    });
  });

  it("gives an anonymous user nothing but the public entries", () => {
    expect(paths(null)).not.toContain("/dispatch");
    expect(paths(null)).not.toContain("/patients");
    expect(paths(null)).not.toContain("/employees");
  });
});

describe("getActiveHub", () => {
  it("finds the hub a page belongs to", () => {
    expect(getActiveHub("/scheduling-inbox", admin).id).toBe("calls-scheduling");
    expect(getActiveHub("/fleet/vehicles", admin).id).toBe("fleet-crews");
    expect(getActiveHub("/compliance", hr).id).toBe("workforce-employees");
  });

  it("resolves a detail route through its parent", () => {
    expect(getActiveHub("/calls/42", admin).id).toBe("calls-scheduling");
    expect(getActiveHub("/fleet/vehicles/7", admin).id).toBe("fleet-crews");
    expect(getActiveHub("/employees/3", hr).id).toBe("workforce-employees");
  });

  it("returns nothing for a page that stands on its own", () => {
    expect(getActiveHub("/dispatch", admin)).toBeNull();
    expect(getActiveHub("/home", admin)).toBeNull();
  });

  it("returns nothing when the role cannot see the hub", () => {
    expect(getActiveHub("/compliance", dispatcher)).toBeNull();
  });
});
