import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CommandPalette from "./CommandPalette";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("../../api/patientsApi", () => ({
  getPatients: vi.fn(() => Promise.resolve({
    items: [{ id: 7, first_name: "Alla", last_name: "Alala", dob: "1991-03-01" }],
  })),
}));
vi.mock("../../api/vehiclesApi", () => ({
  getVehicles: vi.fn(() => Promise.resolve([
    { id: 1, unitName: "Ambu-1", unitNumber: "214", unitType: "ALS" },
  ])),
}));
vi.mock("../../api/employeesApi", () => ({
  getEmployees: vi.fn(() => Promise.resolve([
    { id: 3, firstName: "John", lastName: "Carter", employeeNumber: "EMP-101" },
  ])),
}));

import { getPatients } from "../../api/patientsApi";
import { getVehicles } from "../../api/vehiclesApi";

const admin = { id: 1, role: "admin", display_name: "Admin" };
const hr = { id: 4, role: "hr", display_name: "HR" };

function renderPalette(currentUser = admin) {
  return render(
    <MemoryRouter>
      <CommandPalette currentUser={currentUser} />
    </MemoryRouter>,
  );
}

const openAndType = (value) => {
  fireEvent.click(screen.getByRole("button", { name: /search and commands/i }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
};

beforeEach(() => { vi.clearAllMocks(); });

describe("CommandPalette navigation", () => {
  it("filters accessible pages by query and navigates on click", () => {
    renderPalette(admin);
    openAndType("dispatch");
    const option = screen.getByRole("option", { name: /Dispatch Board/ });
    fireEvent.click(option);
    expect(navigate).toHaveBeenCalledWith("/dispatch");
  });

  it("only offers pages the role may open", () => {
    // HR has no Dispatch access, so it is never offered as a destination.
    renderPalette(hr);
    openAndType("dispatch");
    expect(screen.queryByRole("option", { name: /Dispatch Board/ })).not.toBeInTheDocument();
  });
});

describe("CommandPalette record search", () => {
  it("searches patients, vehicles and employees for an admin", async () => {
    renderPalette(admin);
    openAndType("a");            // 1 char: below the record-search threshold
    expect(getPatients).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "am" } });
    await waitFor(() => expect(getPatients).toHaveBeenCalled());
    expect(await screen.findByText("Ambu-1")).toBeInTheDocument();
  });

  it("deep-links a vehicle to its workspace", async () => {
    renderPalette(admin);
    openAndType("ambu");
    const vehicle = await screen.findByRole("option", { name: /Ambu-1/ });
    fireEvent.click(vehicle);
    expect(navigate).toHaveBeenCalledWith("/fleet/vehicles/1");
  });

  it("opens a patient on the pre-filtered patients list (no per-patient route)", async () => {
    renderPalette(admin);
    openAndType("alala");
    const patient = await screen.findByRole("option", { name: /Alla Alala/ });
    fireEvent.click(patient);
    expect(navigate).toHaveBeenCalledWith("/patients", { state: { commandSearch: "Alala" } });
  });

  it("does not search sources the role cannot access", async () => {
    // HR cannot see patients or vehicles; those APIs must not be called.
    renderPalette(hr);
    openAndType("ambu");
    await waitFor(() => {
      expect(getVehicles).not.toHaveBeenCalled();
      expect(getPatients).not.toHaveBeenCalled();
    });
  });
});
