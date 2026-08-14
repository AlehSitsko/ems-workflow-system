/**
 * Notification sounds, synthesised with the Web Audio API — no audio files, so it
 * works fully offline in the desktop build. A short, unobtrusive tone for a normal
 * event; a more insistent triple tone for urgent ones.
 */

let _ctx = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_ctx) _ctx = new AC();
  // Browsers start the context suspended until a user gesture; the user has
  // already interacted (login etc.), so resuming here is allowed.
  if (_ctx.state === "suspended" && _ctx.resume) _ctx.resume();
  return _ctx;
}

function beep(ac, freq, durationMs, volume, delaySec = 0) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ac.destination);
  const t = ac.currentTime + delaySec;
  const dur = durationMs / 1000;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function playNotificationSound(kind = "normal", volume = 0.5) {
  const ac = audioContext();
  if (!ac) return;
  const v = Math.max(0, Math.min(1, Number(volume) || 0));
  if (v === 0) return;
  if (kind === "urgent") {
    beep(ac, 880, 130, v, 0);
    beep(ac, 880, 130, v, 0.19);
    beep(ac, 1047, 220, v, 0.38);
  } else {
    beep(ac, 660, 120, v, 0);
    beep(ac, 880, 160, v, 0.14);
  }
}

export function testSound(volume = 0.5) {
  playNotificationSound("normal", volume);
}
