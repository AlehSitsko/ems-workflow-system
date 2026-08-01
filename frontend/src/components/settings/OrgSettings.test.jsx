import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import OrgSettings from "./OrgSettings";
import * as api from "../../api/tenantApi";

vi.mock("../../api/tenantApi");

describe("OrgSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getMyOrg.mockResolvedValue({
      id: 1, name: "Acme EMS", slug: "acme", settings: { timezone: "America/New_York" },
    });
    api.updateMyOrg.mockResolvedValue({
      id: 1, name: "Acme Medical", slug: "acme", settings: { timezone: "America/Chicago" },
    });
  });

  it("loads and shows the org, keeping the slug read-only", async () => {
    render(<OrgSettings />);
    expect(await screen.findByDisplayValue("Acme EMS")).toBeInTheDocument();
    expect(screen.getByText("acme")).toBeInTheDocument();               // slug shown, not editable
    expect(screen.getByDisplayValue("America/New_York")).toBeInTheDocument();
  });

  it("saves name and timezone", async () => {
    render(<OrgSettings />);
    await screen.findByDisplayValue("Acme EMS");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme Medical" } });
    fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "America/Chicago" } });
    fireEvent.click(screen.getByRole("button", { name: /save organisation/i }));

    await waitFor(() => expect(api.updateMyOrg).toHaveBeenCalledWith({
      name: "Acme Medical", settings: { timezone: "America/Chicago" },
    }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });
});
