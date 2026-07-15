import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ServiceLevelBadge, UnitTypeBadge, VehicleTypeBadge,
  QualificationBadge, AssignedRoleBadge, EmployeeAvatar,
} from "./TaxonomyBadges";

// Accessibility contract for the visual classification system:
// the category must be readable WITHOUT colour — via text + an accessible name.

describe("ServiceLevelBadge", () => {
  it("shows the canonical label as text, not colour alone", () => {
    render(<ServiceLevelBadge value="bls" />);
    const badge = screen.getByText("BLS");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "BLS");
    expect(badge).toHaveAttribute("aria-label", "BLS");
  });

  it("degrades an unrecognised value to a neutral badge and keeps the raw value visible", () => {
    render(<ServiceLevelBadge value="emergency" />);
    const badge = screen.getByText("Unknown");
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute("title")).toContain("emergency");
  });

  it("supports a prefix so patient default and call actual read differently", () => {
    render(<ServiceLevelBadge value="ALS" prefix="Default" />);
    expect(screen.getByText("Default ALS")).toHaveAttribute("aria-label", "Default: ALS");
  });
});

describe("UnitTypeBadge / VehicleTypeBadge", () => {
  it("labels a unit type accessibly", () => {
    render(<UnitTypeBadge value="ALS" />);
    expect(screen.getByText("ALS")).toHaveAttribute("aria-label", "Unit type: ALS");
  });

  it("canonicalizes the legacy BARI vehicle spelling", () => {
    render(<VehicleTypeBadge value="BARI" />);
    expect(screen.getByText("Bariatric")).toHaveAttribute("aria-label", "Vehicle capability: Bariatric");
  });
});

describe("QualificationBadge", () => {
  it("labels a clinical qualification", () => {
    render(<QualificationBadge value="Paramedic" />);
    expect(screen.getByText("Paramedic")).toHaveAttribute("aria-label", "Qualification: Paramedic");
  });

  it("shows an administrative role as administrative, not a clinical qualification", () => {
    render(<QualificationBadge value="Supervisor" />);
    const badge = screen.getByText("Supervisor");
    expect(badge.getAttribute("aria-label")).toContain("Administrative role");
    expect(badge.getAttribute("aria-label")).not.toContain("Qualification:");
  });

  it("does not break on an unknown value", () => {
    render(<QualificationBadge value="wizard" />);
    expect(screen.getByText("Unknown").getAttribute("title")).toContain("wizard");
  });
});

describe("AssignedRoleBadge", () => {
  it("names the shift role in text", () => {
    render(<AssignedRoleBadge role="driver" />);
    expect(screen.getByText("Driver")).toBeInTheDocument();
    expect(screen.getByTitle("Shift role: Driver")).toBeInTheDocument();
  });

  it("renders nothing for an unknown role rather than an empty badge", () => {
    const { container } = render(<AssignedRoleBadge role={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("EmployeeAvatar", () => {
  it("spells out qualification and shift role in the accessible name", () => {
    // A Paramedic rostered as Driver: the ring shows the qualification, while the
    // accessible name states both — colour never implies the shift role.
    render(<EmployeeAvatar name="Nina Ortiz" qualification="Paramedic" shiftRole="driver" />);
    const avatar = screen.getByLabelText(/Nina Ortiz — Paramedic — Driver this shift/);
    expect(avatar).toHaveTextContent("NO");
  });

  it("falls back gracefully with no name or qualification", () => {
    render(<EmployeeAvatar name="" qualification={null} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
