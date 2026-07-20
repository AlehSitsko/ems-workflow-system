import { describe, it, expect } from "vitest";
import { describeConfirmation, CONFIRMATION_STATUSES } from "./taxonomy";

// The four states exist because "no answer" and "not called yet" mean opposite
// things to a dispatcher working the list; these pin that they stay distinct.

describe("describeConfirmation", () => {
  it("keeps 'no answer' and 'not called' apart", () => {
    const notCalled = describeConfirmation("not_called");
    const noAnswer = describeConfirmation("no_answer");

    expect(notCalled.label).toBe("Not called");
    expect(noAnswer.label).toBe("No answer");
    expect(notCalled.tone).not.toBe(noAnswer.tone);
  });

  it("tones each state for how it should read on a board", () => {
    expect(describeConfirmation("confirmed").tone).toBe("success");
    expect(describeConfirmation("no_answer").tone).toBe("warning");
    expect(describeConfirmation("declined").tone).toBe("danger");
    expect(describeConfirmation("not_called").tone).toBe("neutral");
  });

  it("explains that a decline cancelled the trip", () => {
    expect(describeConfirmation("declined").title).toMatch(/cancelled/i);
  });

  it("falls back to 'not called' for a missing value rather than showing a gap", () => {
    for (const value of [null, undefined, ""]) {
      const meta = describeConfirmation(value);
      expect(meta.label).toBe("Not called");
      expect(meta.known).toBe(false);
    }
  });

  it("covers every canonical status", () => {
    for (const status of CONFIRMATION_STATUSES) {
      expect(describeConfirmation(status).known).toBe(true);
    }
  });
});
