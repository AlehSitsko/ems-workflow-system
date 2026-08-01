import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import ChangePasswordPage from "./ChangePasswordPage";
import * as api from "../api/authApi";

vi.mock("../api/authApi");

const user = { username: "dispatcher", passwordExpired: true };

function setup() {
  const onChanged = vi.fn();
  const onLogout = vi.fn();
  render(<ChangePasswordPage user={user} onChanged={onChanged} onLogout={onLogout} />);
  return { onChanged, onLogout };
}

function fill(current, next, confirm) {
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
}

describe("ChangePasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.changePassword.mockResolvedValue({ username: "dispatcher", passwordExpired: false });
  });

  it("rotates the password and hands the updated user back", async () => {
    const { onChanged } = setup();
    fill("OldPass1234", "NewPass5678", "NewPass5678");
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith("OldPass1234", "NewPass5678"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ passwordExpired: false }),
    ));
  });

  it("refuses to submit when the confirmation does not match", async () => {
    setup();
    fill("OldPass1234", "NewPass5678", "Mismatch9999");
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("surfaces the server's rejection message", async () => {
    api.changePassword.mockRejectedValue(new Error("Current password is incorrect"));
    const { onChanged } = setup();
    fill("wrong", "NewPass5678", "NewPass5678");
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    expect(await screen.findByText(/Current password is incorrect/i)).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("lets the user sign out instead", () => {
    const { onLogout } = setup();
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalled();
  });
});
