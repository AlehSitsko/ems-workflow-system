import { describe, it, expect } from "vitest";
import { buildReturnLegPayload } from "./callUtils";

// The classic CallForm and the guided CallFormPage both build the optional return
// leg from this single function, so these rules are pinned once.
const base = {
  dispatcherName: "Dana D.",
  callDate: "2026-08-25",
  tripDate: "2026-08-26",
  callerType: "facility",
  serviceLevel: "ALS",
  phoneNumber: "555-0100",
  returnPickup: "Springfield Memorial",
  returnDestination: "88 Riverside Ave",
  returnTime: "14:30",
};
const ctx = { patientId: 7, savedCallId: 42 };

describe("buildReturnLegPayload", () => {
  it("returns null when no return ride is requested", () => {
    expect(buildReturnLegPayload({ ...base, returnRideOption: "none" }, ctx)).toBeNull();
  });

  it("returns null when a return ride is chosen but no pickup is set", () => {
    expect(buildReturnLegPayload({ ...base, returnRideOption: "return", returnPickup: "" }, ctx)).toBeNull();
  });

  it("builds a Return leg with the given pickup time and call_type 'return'", () => {
    const p = buildReturnLegPayload({ ...base, returnRideOption: "return" }, ctx);
    expect(p).toMatchObject({
      patient_id: 7,
      call_type: "return",
      pickup_time: "14:30",
      pickup_address: "Springfield Memorial",
      dropoff_address: "88 Riverside Ave",
      service_level: "ALS",
      caller_phone: "555-0100",
      status: "new",
    });
    expect(p.notes).toContain("Return leg for call #42");
  });

  it("builds a Will-Call leg with no pickup time and call_type 'will_call'", () => {
    const p = buildReturnLegPayload({ ...base, returnRideOption: "will_call" }, ctx);
    expect(p.call_type).toBe("will_call");
    expect(p.pickup_time).toBe("");            // set later from the Dispatch Board
    expect(p.notes).toContain("Will Call leg for call #42");
  });

  it("nulls an empty caller phone", () => {
    const p = buildReturnLegPayload({ ...base, returnRideOption: "return", phoneNumber: "" }, ctx);
    expect(p.caller_phone).toBeNull();
  });
});
