import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PriceCalculator from "./PriceCalculator";

async function fill(user, { base = "100", mileage = "10", rate = "2" } = {}) {
  await user.clear(screen.getByLabelText(/base price/i));
  await user.type(screen.getByLabelText(/base price/i), base);
  await user.clear(screen.getByLabelText(/^mileage$/i));
  await user.type(screen.getByLabelText(/^mileage$/i), mileage);
  await user.clear(screen.getByLabelText(/rate per mile/i));
  await user.type(screen.getByLabelText(/rate per mile/i), rate);
}

describe("PriceCalculator (component)", () => {
  it("shows the computed estimate the breakdown adds up to", async () => {
    const user = userEvent.setup();
    render(<PriceCalculator />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: /calculate price/i }));
    // 100 + 10*2 = 120
    expect(screen.getByText("$120.00")).toBeInTheDocument();
  });

  it("does not add $25 when crew size increases from 2 to 3", async () => {
    const user = userEvent.setup();
    render(<PriceCalculator />);
    await fill(user);
    await user.selectOptions(screen.getByLabelText(/crew size/i), "3");
    await user.click(screen.getByRole("button", { name: /calculate price/i }));
    // Still 120, not 145 — the placeholder charge is gone.
    expect(screen.getByText("$120.00")).toBeInTheDocument();
    expect(screen.queryByText(/crew adjustment/i)).not.toBeInTheDocument();
  });

  it("shows a clear error for a negative value and no price", async () => {
    const user = userEvent.setup();
    render(<PriceCalculator />);
    await user.type(screen.getByLabelText(/base price/i), "-5");
    await user.click(screen.getByRole("button", { name: /calculate price/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/cannot be negative/i);
    expect(screen.queryByText(/estimated price/i)).not.toBeInTheDocument();
  });

  it("clears the result and the form on reset", async () => {
    const user = userEvent.setup();
    render(<PriceCalculator />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: /calculate price/i }));
    expect(screen.getByText("$120.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear calculator/i }));
    expect(screen.queryByText(/estimated price/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/base price/i)).toHaveValue(null);
  });
});
