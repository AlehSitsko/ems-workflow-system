import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import PlatformConsolePage from "./PlatformConsolePage";
import * as api from "../../api/platformApi";

vi.mock("../../api/platformApi");

const orgs = [
  { id: 1, name: "Acme EMS", slug: "acme", userCount: 3, is_active: true },
  { id: 2, name: "Beta EMS", slug: "beta", userCount: 1, is_active: false },
];

describe("PlatformConsolePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listOrgs.mockResolvedValue(orgs);
    api.createOrg.mockResolvedValue({ org: {} });
    api.updateOrg.mockResolvedValue({});
  });

  it("lists organisations with their status", async () => {
    render(<PlatformConsolePage currentUser={{ username: "root" }} onLogout={() => {}} />);
    expect(await screen.findByText("Acme EMS")).toBeInTheDocument();
    expect(screen.getByText("Suspended")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("creates an organisation from the form", async () => {
    render(<PlatformConsolePage currentUser={{ username: "root" }} onLogout={() => {}} />);
    await screen.findByText("Acme EMS");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gamma EMS" } });
    fireEvent.change(screen.getByLabelText("Subdomain"), { target: { value: "Gamma" } });
    fireEvent.change(screen.getByLabelText("First admin username"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("First admin password"), { target: { value: "GammaPass123" } });
    fireEvent.click(screen.getByRole("button", { name: /create organisation/i }));

    await waitFor(() => expect(api.createOrg).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Gamma EMS", slug: "gamma", adminUsername: "admin" }),
    ));
  });

  it("suspends an active org", async () => {
    render(<PlatformConsolePage currentUser={{ username: "root" }} onLogout={() => {}} />);
    await screen.findByText("Acme EMS");
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(api.updateOrg).toHaveBeenCalledWith(1, { isActive: false }));
  });

  it("reactivates a suspended org", async () => {
    render(<PlatformConsolePage currentUser={{ username: "root" }} onLogout={() => {}} />);
    await screen.findByText("Beta EMS");
    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
    await waitFor(() => expect(api.updateOrg).toHaveBeenCalledWith(2, { isActive: true }));
  });
});
