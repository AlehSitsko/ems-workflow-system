import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ROUTE_METADATA, GROUP_ORDER, getRouteMetadata, getNavigationGroups,
} from "./routeMetadata";

const admin = { id: 1, role: "admin", display_name: "Admin" };
const dispatcher = { id: 3, role: "dispatcher", display_name: "Dispatcher" };
const hr = { id: 4, role: "hr", display_name: "HR" };

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
  const OUTSIDE_SHELL = ["/login"];

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

describe("getNavigationGroups", () => {
  it("orders groups and hides empty ones", () => {
    const titles = getNavigationGroups(admin).map((g) => g.title);
    expect(titles).toEqual(GROUP_ORDER.filter((g) => titles.includes(g)));
    expect(titles[0]).toBe("Main");
  });

  it("never includes hidden detail routes", () => {
    const paths = getNavigationGroups(admin).flatMap((g) => g.items.map((i) => i.path));
    expect(paths).not.toContain("/fleet/vehicles/:vehicleId");
  });

  it("scopes navigation to the role", () => {
    const paths = (u) => getNavigationGroups(u).flatMap((g) => g.items.map((i) => i.path));

    // HR has no operational reason to see the board, the fleet or crew planning —
    // and the API would reject them anyway (see backend tests/test_security.py).
    expect(paths(hr)).not.toContain("/dispatch");
    expect(paths(hr)).not.toContain("/fleet/vehicles");
    expect(paths(hr)).not.toContain("/crew-planner");
    expect(paths(hr)).not.toContain("/patients");
    expect(paths(hr)).toContain("/employees");

    // Dispatcher runs operations but does not administer users.
    expect(paths(dispatcher)).toContain("/dispatch");
    expect(paths(dispatcher)).toContain("/fleet/vehicles");
    expect(paths(dispatcher)).not.toContain("/users");

    expect(paths(admin)).toContain("/users");
  });

  it("gives an anonymous user nothing but the public entries", () => {
    const paths = getNavigationGroups(null).flatMap((g) => g.items.map((i) => i.path));
    expect(paths).not.toContain("/dispatch");
    expect(paths).not.toContain("/patients");
  });
});
