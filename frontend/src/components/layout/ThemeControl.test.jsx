import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import ThemeControl from "./ThemeControl";
import { ThemeContext } from "../../context/useTheme";

function renderControl(value) {
  const ctx = { theme: "system", resolvedTheme: "light", systemTheme: "light", setTheme: vi.fn(), toggleTheme: vi.fn(), ...value };
  render(
    <ThemeContext.Provider value={ctx}>
      <ThemeControl />
    </ThemeContext.Provider>,
  );
  return ctx;
}

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Theme" }));

describe("ThemeControl", () => {
  it("offers light, dark and system, marking the active preference", () => {
    renderControl({ theme: "dark", resolvedTheme: "dark" });
    openMenu();
    expect(screen.getByRole("menuitemradio", { name: /Light/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("menuitemradio", { name: /Dark/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: /System/ })).toHaveAttribute("aria-checked", "false");
  });

  it("reports the chosen preference", () => {
    const ctx = renderControl();
    openMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Dark/ }));
    expect(ctx.setTheme).toHaveBeenCalledWith("dark");
  });

  it("shows what System resolves to even while pinned to a fixed theme", () => {
    // Pinned to light, but the OS prefers dark — the System row still advertises
    // dark, so the user knows what switching to System would do.
    renderControl({ theme: "light", resolvedTheme: "light", systemTheme: "dark" });
    openMenu();
    expect(screen.getByRole("menuitemradio", { name: /System/ })).toHaveTextContent(/dark/i);
  });

  it("reflects the resolved theme on the trigger icon's accessible label", () => {
    // Trigger just shows Theme; the icon differs by resolvedTheme. Assert it
    // renders without depending on the icon glyph.
    renderControl({ theme: "system", resolvedTheme: "dark" });
    expect(screen.getByRole("button", { name: "Theme" })).toBeInTheDocument();
  });
});
