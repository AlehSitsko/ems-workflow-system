import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VehicleSelect from "./VehicleSelect";

const vehicle = (over = {}) => ({
  id: 1, unitName: "Ambu-1", unitNumber: "101", unitType: "BLS",
  capabilities: ["BLS"], isActive: true, isRetired: false,
  operationalStatus: "in_service", availableForService: true,
  ...over,
});

const fleet = [
  vehicle(),
  vehicle({ id: 2, unitName: "Ambu-2", unitNumber: "102" }),
  vehicle({ id: 3, unitName: "Ambu-3", unitNumber: "103", availableForService: false, operationalStatus: "maintenance" }),
];

describe("VehicleSelect", () => {
  it("offers the ready vehicles only", () => {
    render(<VehicleSelect vehicles={fleet} vehicleId={null} onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Ambu-1 (#101) — BLS" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Ambu-3/ })).not.toBeInTheDocument();
  });

  it("reports the picked vehicle and snapshots its number", () => {
    const onChange = vi.fn();
    render(<VehicleSelect vehicles={fleet} vehicleId={null} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith({ vehicleId: 2, truckNumber: "102" });
  });

  it("keeps a shift's vehicle selectable after it leaves service", () => {
    render(<VehicleSelect vehicles={fleet} vehicleId={3} onChange={vi.fn()} />);
    const opt = screen.getByRole("option", { name: "Ambu-3 (#103) — BLS — maintenance" });
    expect(opt).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("3");
  });

  it("preserves a legacy truck number that matches no fleet record", () => {
    render(<VehicleSelect vehicles={fleet} vehicleId={null} truckNumber="77" onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: "77 — not in fleet" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("__legacy__");
  });

  it("clears the selection back to nothing", () => {
    const onChange = vi.fn();
    render(<VehicleSelect vehicles={fleet} vehicleId={1} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ vehicleId: null, truckNumber: "" });
  });

  it("states the dependency instead of offering a free-text fallback", () => {
    // A text box here would let a dispatcher invent a truck that does not exist.
    render(<VehicleSelect vehicles={[]} vehicleId={null} onChange={vi.fn()} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/No vehicles are available for service/)).toBeInTheDocument();
  });
});
