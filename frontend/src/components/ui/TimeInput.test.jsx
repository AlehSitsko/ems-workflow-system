import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeInput from "./TimeInput";

// The component reads the 12h/24h preference from the user-settings context.
// Mock it as a spy so each test can pick a format via mockReturnValue.
vi.mock("../../context/useUserSettings", () => ({ useUserSettings: vi.fn() }));
import { useUserSettings } from "../../context/useUserSettings";

const useFormat = (fmt) =>
  useUserSettings.mockReturnValue({ settings: { ui: { time_format: fmt } } });

const lastEmitted = (onChange) =>
  onChange.mock.calls.length ? onChange.mock.calls.at(-1)[0] : undefined;

describe("TimeInput", () => {
  beforeEach(() => { useUserSettings.mockReset(); useFormat("12h"); });

  it("emits a 24h HH:MM string from 12-hour entry + PM", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} id="t" />);

    await user.type(screen.getByPlaceholderText("H"), "8");
    await user.type(screen.getByPlaceholderText("MM"), "30");
    await user.click(screen.getByRole("button", { name: "PM" }));

    expect(lastEmitted(onChange)).toBe("20:30");
  });

  it("emits directly in 24-hour mode with no AM/PM pills", async () => {
    useFormat("24h");
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} id="t" />);

    expect(screen.queryByRole("button", { name: "PM" })).toBeNull();
    await user.type(screen.getByPlaceholderText("HH"), "14");
    await user.type(screen.getByPlaceholderText("MM"), "05");
    expect(lastEmitted(onChange)).toBe("14:05");
  });

  it("strips non-digits from typed input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} id="t" />);
    const hour = screen.getByPlaceholderText("H");
    await user.type(hour, "a9b");
    expect(hour).toHaveValue("9");
  });

  it("clears an out-of-range hour on blur (12h: 1–12)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} id="t" />);
    const hour = screen.getByPlaceholderText("H");
    await user.type(hour, "15");
    await user.tab();               // blur
    expect(hour).toHaveValue("");   // 15 > 12 -> rejected
  });

  it("hydrates local display from an incoming 24h value", () => {
    render(<TimeInput value="09:15" onChange={vi.fn()} id="t" />);
    expect(screen.getByPlaceholderText("H")).toHaveValue("9");
    expect(screen.getByPlaceholderText("MM")).toHaveValue("15");
    expect(screen.getByRole("button", { name: "AM" })).toBeInTheDocument();
  });

  it("respects the disabled prop", () => {
    render(<TimeInput value="" onChange={vi.fn()} id="t" disabled />);
    expect(screen.getByPlaceholderText("H")).toBeDisabled();
    expect(screen.getByRole("button", { name: "AM" })).toBeDisabled();
  });

  it("associates the id with the hour input for label targeting", () => {
    render(<TimeInput value="" onChange={vi.fn()} id="clock-in" />);
    expect(screen.getByPlaceholderText("H")).toHaveAttribute("id", "clock-in");
  });
});
