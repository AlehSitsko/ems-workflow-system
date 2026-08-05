import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import ErrorBoundary from "./ErrorBoundary";

function Boom() {
  throw new Error("kaboom in render");
}

describe("ErrorBoundary", () => {
  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("catches a render error and shows a recovery UI instead of a blank page", () => {
    // React logs the caught error via console.error; opt out of the strict guard.
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload the app/i })).toBeInTheDocument();
    // The technical detail carries the real error message for a bug report.
    expect(screen.getByText(/kaboom in render/)).toBeInTheDocument();
  });

  it("reloads the page when the reload button is clicked", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    const original = window.location;
    // jsdom's location.reload is not implemented; replace it for the assertion.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: /reload the app/i }));
    expect(reload).toHaveBeenCalled();

    Object.defineProperty(window, "location", { configurable: true, value: original });
  });
});
