import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import ActiveSessions from "./ActiveSessions";
import * as api from "../../api/authApi";

vi.mock("../../api/authApi");

const rows = [
  { id: 1, current: true, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120", createdAt: "2026-08-01T09:00:00", lastSeenAt: "2026-08-01T10:00:00" },
  { id: 2, current: false, userAgent: "Mozilla/5.0 (iPhone; iOS 17) Safari/605", createdAt: "2026-07-30T08:00:00", lastSeenAt: "2026-07-31T08:00:00" },
];

describe("ActiveSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSessions.mockResolvedValue(rows);
    api.revokeSession.mockResolvedValue({ current: false });
    api.revokeOtherSessions.mockResolvedValue({ revoked: 1 });
  });

  it("lists devices and flags the current one", async () => {
    render(<ActiveSessions />);
    expect(await screen.findByText(/Chrome on Windows/)).toBeInTheDocument();
    expect(screen.getByText(/Safari on iOS/)).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
  });

  it("revokes a specific device", async () => {
    render(<ActiveSessions />);
    await screen.findByText(/Safari on iOS/);
    // The non-current row's action reads "Revoke".
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith(2));
  });

  it("offers to sign out other devices and calls the endpoint", async () => {
    render(<ActiveSessions />);
    const btn = await screen.findByRole("button", { name: /Sign out other devices \(1\)/ });
    fireEvent.click(btn);
    await waitFor(() => expect(api.revokeOtherSessions).toHaveBeenCalled());
  });

  it("shows an error when loading fails", async () => {
    api.getSessions.mockRejectedValue(new Error("Failed to load sessions"));
    render(<ActiveSessions />);
    expect(await screen.findByText(/Failed to load sessions/)).toBeInTheDocument();
  });
});
