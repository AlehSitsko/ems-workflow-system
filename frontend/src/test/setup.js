// Vitest global setup: extends expect() with jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, etc.), clears the DOM between tests, and
// — importantly — fails a test if it logged an unexpected console.error or
// console.warn. Serious React problems (an update not wrapped in act(...), a bad
// prop type, a key warning, an error boundary catching) all surface through
// console.error, so this stops them from being silently ignored.
//
// Opting out for a test that *intentionally* exercises an error/log path: install
// your own spy inside that test — e.g.
//   vi.spyOn(console, "error").mockImplementation(() => {});
// which replaces the strict spy for that test only.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

let captured = [];

beforeEach(() => {
  captured = [];
  vi.spyOn(console, "error").mockImplementation((...args) => captured.push(["error", args]));
  vi.spyOn(console, "warn").mockImplementation((...args) => captured.push(["warn", args]));
});

afterEach(() => {
  cleanup();
  const problems = captured.slice();
  vi.restoreAllMocks();
  if (problems.length) {
    const detail = problems
      .map(([level, args]) => `  console.${level}: ${args.map((a) => (a && a.stack) || String(a)).join(" ")}`)
      .join("\n");
    throw new Error(
      `Test produced ${problems.length} unexpected console message(s):\n${detail}\n` +
        "Fix the warning, or (if intentional) spy on console in the test to opt out.",
    );
  }
});
