import { describe, it, expect } from "vitest";
import {
  resolveDelivery, inQuietHours, CHANNELS, DEFAULT_NOTIFICATION_PREFS,
} from "./notificationRules";

const callCreated = (over = {}) => ({
  type: "call.created", actorUserId: 2,
  payload: { serviceLevel: "BLS", callType: "scheduled", ...over },
});

describe("resolveDelivery", () => {
  it("never notifies a user about their own action", () => {
    const ev = { ...callCreated(), actorUserId: 7 };
    expect(resolveDelivery(ev, DEFAULT_NOTIFICATION_PREFS, { currentUserId: 7 }))
      .toEqual({ visual: false, sound: "none" });
  });

  it("gives visual + normal sound for another user's new call by default", () => {
    const r = resolveDelivery(callCreated(), DEFAULT_NOTIFICATION_PREFS, { currentUserId: 1 });
    expect(r).toEqual({ visual: true, sound: "normal" });
  });

  it("uses the urgent sound for an emergency call", () => {
    const r = resolveDelivery(callCreated({ callType: "emergency" }), DEFAULT_NOTIFICATION_PREFS, { currentUserId: 1 });
    expect(r.sound).toBe("urgent");
  });

  it("off means no notification at all", () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, types: { newCall: CHANNELS.OFF } };
    expect(resolveDelivery(callCreated(), prefs, { currentUserId: 1 }))
      .toEqual({ visual: false, sound: "none" });
  });

  it("visual-only shows a toast without sound", () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, types: { newCall: CHANNELS.VISUAL } };
    expect(resolveDelivery(callCreated(), prefs, { currentUserId: 1 }))
      .toEqual({ visual: true, sound: "none" });
  });

  it("a disabled sound switch keeps the visual but silences it", () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, soundEnabled: false };
    expect(resolveDelivery(callCreated(), prefs, { currentUserId: 1 }))
      .toEqual({ visual: true, sound: "none" });
  });

  it("DND silences the sound but still shows the visual", () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, dnd: true };
    expect(resolveDelivery(callCreated(), prefs, { currentUserId: 1 }))
      .toEqual({ visual: true, sound: "none" });
  });

  it("quiet hours silence the sound", () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, quietHours: { enabled: true, start: "22:00", end: "07:00" } };
    const at2am = new Date(2026, 0, 1, 2, 0);
    expect(resolveDelivery(callCreated(), prefs, { currentUserId: 1, now: at2am }).sound).toBe("none");
    const atNoon = new Date(2026, 0, 1, 12, 0);
    expect(resolveDelivery(callCreated(), prefs, { currentUserId: 1, now: atNoon }).sound).toBe("normal");
  });

  it("ignores unknown event types", () => {
    expect(resolveDelivery({ type: "mystery.event", actorUserId: 2 }, DEFAULT_NOTIFICATION_PREFS, { currentUserId: 1 }))
      .toEqual({ visual: false, sound: "none" });
  });
});

describe("inQuietHours", () => {
  it("handles ranges that wrap past midnight", () => {
    const qh = { enabled: true, start: "22:00", end: "07:00" };
    expect(inQuietHours(new Date(2026, 0, 1, 23, 0), qh)).toBe(true);
    expect(inQuietHours(new Date(2026, 0, 1, 3, 0), qh)).toBe(true);
    expect(inQuietHours(new Date(2026, 0, 1, 12, 0), qh)).toBe(false);
  });
});
