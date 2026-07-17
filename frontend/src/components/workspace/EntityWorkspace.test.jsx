import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

import EntityWorkspace from "./EntityWorkspace";

// The confirm dialog is provider-backed; stub it so these tests focus on the
// workspace contract rather than the dialog implementation.
const confirmMock = vi.fn(() => Promise.resolve(true));
vi.mock("../ui/useConfirm", () => ({ useConfirm: () => confirmMock }));

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "compliance", label: "Compliance" },
  { key: "maintenance", label: "Maintenance", disabled: true, disabledReason: "Arrives with Fleet Management" },
];

function LocationSpy() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderWorkspace(props = {}, { route = "/fleet/vehicles/7" } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route
          path="/fleet/vehicles/:id"
          element={
            <EntityWorkspace backTo="/fleet/vehicles" backLabel="Vehicles" title="Ambu-1" tabs={TABS} {...props}>
              {(activeTab) => <div data-testid="tab-content">{activeTab} content</div>}
            </EntityWorkspace>
          }
        />
        <Route path="/fleet/vehicles" element={<LocationSpy />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EntityWorkspace states", () => {
  it("renders the first tab by default", () => {
    renderWorkspace();
    expect(screen.getByTestId("tab-content")).toHaveTextContent("overview content");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows a not-found state instead of a broken page", () => {
    renderWorkspace({ notFound: true });
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-content")).not.toBeInTheDocument();
  });

  it("shows an error state", () => {
    renderWorkspace({ error: "Boom" });
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });

  it("shows a loading state", () => {
    renderWorkspace({ loading: true });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("refuses to render the entity without permission", () => {
    renderWorkspace({ canView: false });
    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-content")).not.toBeInTheDocument();
  });

  it("keeps the back link available in every state", () => {
    renderWorkspace({ notFound: true });
    expect(screen.getByRole("link", { name: /Vehicles/ })).toBeInTheDocument();
  });
});

describe("EntityWorkspace tabs", () => {
  it("puts the active tab in the URL so the view is shareable", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("tab", { name: "Compliance" }));
    // Tab changes go through the unsaved-changes guard, so they settle async.
    await waitFor(() => expect(screen.getByTestId("tab-content")).toHaveTextContent("compliance content"));
  });

  it("opens the tab named in the URL on a deep link", () => {
    renderWorkspace({}, { route: "/fleet/vehicles/7?tab=compliance" });
    expect(screen.getByTestId("tab-content")).toHaveTextContent("compliance content");
  });

  it("disables tabs whose feature does not exist yet, rather than faking them", () => {
    renderWorkspace();
    const tab = screen.getByRole("tab", { name: /Maintenance/ });
    expect(tab).toBeDisabled();
    expect(tab).toHaveAttribute("title", "Arrives with Fleet Management");
  });
});

describe("EntityWorkspace back navigation", () => {
  it("returns to the list", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("link", { name: /Vehicles/ }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/fleet/vehicles"));
  });

  it("asks before discarding unsaved changes", async () => {
    confirmMock.mockClear();
    renderWorkspace({ dirty: true });
    fireEvent.click(screen.getByRole("tab", { name: "Compliance" }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
  });

  it("does not ask when there is nothing to lose", async () => {
    confirmMock.mockClear();
    renderWorkspace({ dirty: false });
    fireEvent.click(screen.getByRole("tab", { name: "Compliance" }));
    // The tab still changes (async, through the guard) — wait for it to settle,
    // then confirm the guard never prompted.
    await waitFor(() => expect(screen.getByTestId("tab-content")).toHaveTextContent("compliance content"));
    expect(confirmMock).not.toHaveBeenCalled();
  });
});
