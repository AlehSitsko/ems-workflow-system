import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { EmptyState, ErrorState, LoadingSkeleton } from "./States";
import StatusBadge, { OperationalStatusBadge } from "./StatusBadge";
import { PageHeader, PageSection, PageToolbar, SearchInput, ToolbarField } from "./Page";
import { StatCard, EntityCard, EntityField, OverflowMenu, Pagination, LoadMore, ActivityTimeline } from "./Entity";

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

// ── States ──────────────────────────────────────────────────────────────────

describe("EmptyState", () => {
  it("distinguishes an empty collection from filters matching nothing", () => {
    const { rerender } = render(<EmptyState variant="empty" title="No vehicles yet" />);
    expect(screen.getByRole("status")).toHaveTextContent("No vehicles yet");

    rerender(<EmptyState variant="no-results" title="No vehicles match" description="Try another filter." />);
    expect(screen.getByText("No vehicles match")).toBeInTheDocument();
    expect(screen.getByText("Try another filter.")).toBeInTheDocument();
  });

  it("can carry a recovery action", () => {
    const onClick = vi.fn();
    render(<EmptyState title="Nothing" action={<button onClick={onClick}>Add one</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "Add one" }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("ErrorState", () => {
  it("announces itself as an alert and offers a retry", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Network down" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Network down");
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("omits retry when there is nothing to retry", () => {
    render(<ErrorState message="Forbidden" />);
    expect(screen.queryByRole("button", { name: /Try again/ })).not.toBeInTheDocument();
  });
});

describe("LoadingSkeleton", () => {
  it("marks the region busy for assistive tech", () => {
    render(<LoadingSkeleton rows={2} label="Loading vehicles" />);
    const region = screen.getByLabelText("Loading vehicles");
    expect(region).toHaveAttribute("aria-busy", "true");
  });

  it("renders the requested number of placeholders", () => {
    const { container } = render(<LoadingSkeleton rows={3} />);
    expect(container.querySelectorAll(".skeleton-item")).toHaveLength(3);
  });
});

// ── StatusBadge ─────────────────────────────────────────────────────────────

describe("StatusBadge", () => {
  it("always renders the label as text, not colour alone", () => {
    render(<StatusBadge tone="danger" label="Out of Service" />);
    const badge = screen.getByText("Out of Service");
    expect(badge).toHaveAttribute("title", "Out of Service");
    expect(badge.className).toContain("tone-danger");
  });

  it("falls back to a neutral tone for an unknown tone", () => {
    render(<StatusBadge tone="chartreuse" label="Odd" />);
    expect(screen.getByText("Odd").className).toContain("tone-neutral");
  });
});

describe("OperationalStatusBadge", () => {
  it("maps canonical statuses to one consistent tone", () => {
    const { rerender } = render(<OperationalStatusBadge status="in_service" />);
    expect(screen.getByText("In Service").className).toContain("tone-success");

    rerender(<OperationalStatusBadge status="out_of_service" />);
    expect(screen.getByText("Out of Service").className).toContain("tone-danger");

    rerender(<OperationalStatusBadge status="maintenance" />);
    expect(screen.getByText("Maintenance").className).toContain("tone-warning");
  });

  it("lets retired win over whatever the status column says", () => {
    render(<OperationalStatusBadge status="in_service" isRetired />);
    expect(screen.getByText("Retired")).toBeInTheDocument();
    expect(screen.queryByText("In Service")).not.toBeInTheDocument();
  });

  it("degrades an unrecognised status to neutral without breaking", () => {
    render(<OperationalStatusBadge status="teleporting" />);
    expect(screen.getByText("Unknown").getAttribute("title")).toContain("teleporting");
  });
});

// ── Page structure ──────────────────────────────────────────────────────────

describe("PageHeader", () => {
  it("keeps the page title below the app h1 so heading order stays valid", () => {
    render(<PageHeader title="Vehicles" description="The physical fleet." count="6 vehicles" />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Vehicles");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("announces the result count politely", () => {
    render(<PageHeader title="Vehicles" count="6 vehicles" />);
    expect(screen.getByText("6 vehicles")).toHaveAttribute("aria-live", "polite");
  });
});

describe("PageToolbar", () => {
  it("only enables Clear when something is actually filtered", () => {
    const onClear = vi.fn();
    const { rerender } = render(<PageToolbar onClear={onClear} canClear={false}><div /></PageToolbar>);
    expect(screen.getByRole("button", { name: /Clear/ })).toBeDisabled();

    rerender(<PageToolbar onClear={onClear} canClear><div /></PageToolbar>);
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe("SearchInput", () => {
  it("is labelled and reports changes", () => {
    const onChange = vi.fn();
    render(<SearchInput id="s" value="" onChange={onChange} placeholder="Search by name" />);
    fireEvent.change(screen.getByLabelText("Search by name"), { target: { value: "medic" } });
    expect(onChange).toHaveBeenCalledWith("medic");
  });
});

describe("ToolbarField", () => {
  it("associates its label with the control", () => {
    render(
      <ToolbarField label="Status" htmlFor="status">
        <select id="status"><option>All</option></select>
      </ToolbarField>,
    );
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
  });
});

describe("PageSection", () => {
  it("renders a titled card", () => {
    render(<PageSection title="Vehicle Identity"><p>body</p></PageSection>);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Vehicle Identity");
  });
});

// ── Entity primitives ───────────────────────────────────────────────────────

describe("StatCard", () => {
  it("links the whole tile when given a destination", () => {
    wrap(<StatCard label="My Open Tasks" value={12} to="/tasks?status=open" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/tasks?status=open");
  });

  it("is not a link when there is nowhere to go", () => {
    wrap(<StatCard label="Total" value={5} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("EntityCard", () => {
  it("makes the whole card the navigation target", () => {
    wrap(<EntityCard to="/fleet/vehicles/1" ariaLabel="Unit 101">content</EntityCard>);
    expect(screen.getByRole("link", { name: "Unit 101" })).toHaveAttribute("href", "/fleet/vehicles/1");
  });

  it("supports keyboard activation when it is a button", () => {
    const onClick = vi.fn();
    wrap(<EntityCard onClick={onClick} ariaLabel="Row">content</EntityCard>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Row" }), { key: "Enter" });
    expect(onClick).toHaveBeenCalled();
  });
});

describe("EntityField", () => {
  it("shows an em dash rather than blank for a missing value", () => {
    render(<EntityField label="License Plate" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("OverflowMenu", () => {
  const items = [
    { label: "View", onClick: vi.fn() },
    { label: "Retire", danger: true, disabled: true, disabledReason: "Requires a supervisor" },
  ];

  it("renders nothing when there are no actions", () => {
    const { container } = render(<OverflowMenu items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens, reports state, and runs an action", () => {
    const onClick = vi.fn();
    render(<OverflowMenu items={[{ label: "View", onClick }]} />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "View" }));
    expect(onClick).toHaveBeenCalled();
  });

  it("explains why a forbidden action is disabled instead of silently doing nothing", () => {
    render(<OverflowMenu items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const retire = screen.getByRole("menuitem", { name: "Retire" });
    expect(retire).toBeDisabled();
    expect(retire).toHaveAttribute("title", "Requires a supervisor");
  });

  it("closes on Escape", () => {
    render(<OverflowMenu items={[{ label: "View", onClick: vi.fn() }]} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });
});

describe("Pagination", () => {
  it("reports the visible range and total", () => {
    render(<Pagination page={1} perPage={6} total={6} onPageChange={vi.fn()} />);
    expect(screen.getByText("Showing 1 to 6 of 6")).toBeInTheDocument();
  });

  it("disables the edges of the range", () => {
    render(<Pagination page={1} perPage={10} total={25} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("renders nothing when there is nothing to page", () => {
    const { container } = render(<Pagination page={1} perPage={10} total={0} onPageChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("LoadMore", () => {
  it("hides itself once everything is loaded", () => {
    const { container } = render(<LoadMore loaded={25} total={25} onLoadMore={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows progress while more remains", () => {
    render(<LoadMore loaded={25} total={693} onLoadMore={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Load more (25 of 693)" })).toBeInTheDocument();
  });
});

describe("ActivityTimeline", () => {
  it("shows an empty message rather than a bare list", () => {
    render(<ActivityTimeline entries={[]} />);
    expect(screen.getByText("No recorded activity yet.")).toBeInTheDocument();
  });

  it("renders human dates and the actor", () => {
    render(<ActivityTimeline entries={[
      { id: 1, title: "Odometer updated to 48,256 mi", timestamp: "Jun 28, 2026, 8:15 AM", actor: "John D.", tone: "info" },
    ]} />);
    expect(screen.getByText("Odometer updated to 48,256 mi")).toBeInTheDocument();
    expect(screen.getByText(/Jun 28, 2026, 8:15 AM · John D./)).toBeInTheDocument();
  });
});
