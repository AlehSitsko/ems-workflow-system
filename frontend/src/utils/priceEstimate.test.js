import { describe, it, expect } from "vitest";
import { computeEstimate } from "./priceEstimate";

describe("computeEstimate", () => {
  const base = {
    basePrice: "100",
    crewSize: "2",
    mileage: "10",
    ratePerMile: "2",
    returnRide: false,
    waitingTimeRequested: false,
    waitingFee: "",
  };

  it("computes base + mileage×rate for a one-way trip", () => {
    const r = computeEstimate(base);
    // 100 + 10*2 = 120
    expect(r.total).toBe("120.00");
    expect(r.breakdown.mileageFee).toBe("20.00");
  });

  it("does NOT add the removed $25-per-extra-crew placeholder", () => {
    const two = computeEstimate({ ...base, crewSize: "2" }).total;
    const three = computeEstimate({ ...base, crewSize: "3" }).total;
    const four = computeEstimate({ ...base, crewSize: "4" }).total;
    // Crew size must not change the price at all.
    expect(three).toBe(two);
    expect(four).toBe(two);
    expect(three).toBe("120.00");
  });

  it("keeps crew size in the breakdown as operational info only", () => {
    expect(computeEstimate({ ...base, crewSize: "4" }).breakdown.crewSize).toBe(4);
  });

  it("adds the waiting fee exactly once and never multiplies it by return ride", () => {
    const r = computeEstimate({
      ...base,
      returnRide: true,
      waitingTimeRequested: true,
      waitingFee: "30",
    });
    // one-way trip = 120; round trip doubles trip charges = 240; + waiting 30 once = 270
    expect(r.total).toBe("270.00");
    expect(r.breakdown.waitingFee).toBe("30.00");
  });

  it("ignores the waiting fee when waiting time is not requested", () => {
    const r = computeEstimate({ ...base, waitingTimeRequested: false, waitingFee: "50" });
    expect(r.total).toBe("120.00");
  });

  it("doubles only trip charges for a return ride", () => {
    const r = computeEstimate({ ...base, returnRide: true });
    expect(r.total).toBe("240.00");
  });

  it("treats empty optional fields as zero predictably", () => {
    const r = computeEstimate({ crewSize: "2", basePrice: "", mileage: "", ratePerMile: "" });
    expect(r.total).toBe("0.00");
  });

  it("rejects negative values with a clear message", () => {
    expect(computeEstimate({ ...base, basePrice: "-5" }).error).toMatch(/cannot be negative/i);
    expect(computeEstimate({ ...base, mileage: "-1" }).error).toMatch(/cannot be negative/i);
    expect(computeEstimate({ ...base, waitingTimeRequested: true, waitingFee: "-3" }).error)
      .toMatch(/cannot be negative/i);
  });

  it("uses consistent 2-decimal rounding", () => {
    const r = computeEstimate({ ...base, basePrice: "100.005", mileage: "1", ratePerMile: "0.1" });
    // 100.005 + 0.1 = 100.105 → "100.11" (banker-agnostic toFixed, matches the UI)
    expect(r.total).toBe((100.005 + 0.1).toFixed(2));
  });
});
