import { useEffect, useState } from "react";
import { getSettings, patchSettings } from "../../api/settingsApi";
import { useToast } from "../ui/useToast";
import {
  CHANNELS, NOTIFICATION_TYPES, DEFAULT_NOTIFICATION_PREFS,
} from "../../utils/notificationRules";
import { testSound } from "../../utils/notificationSound";
import { PREFS_CHANGED_EVENT } from "../NotificationsListener";

const CHANNEL_LABELS = [
  [CHANNELS.OFF, "Off"],
  [CHANNELS.VISUAL, "Visual only"],
  [CHANNELS.SOUND, "Sound + Visual"],
];

// Per-user realtime notification preferences (settings.realtimeNotifications):
// per-type channel, sound + volume, Do Not Disturb and quiet hours.
export default function NotificationRules() {
  const toast = useToast();
  const [prefs, setPrefs] = useState(DEFAULT_NOTIFICATION_PREFS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => { if (s?.realtimeNotifications) setPrefs({ ...DEFAULT_NOTIFICATION_PREFS, ...s.realtimeNotifications }); })
      .catch(() => {});
  }, []);

  const setType = (key, value) => setPrefs((p) => ({ ...p, types: { ...p.types, [key]: value } }));
  const setQuiet = (patch) => setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, ...patch } }));

  async function save() {
    setSaving(true);
    try {
      await patchSettings({ realtimeNotifications: prefs });
      window.dispatchEvent(new Event(PREFS_CHANGED_EVENT)); // live-apply
      toast.success("Notifications saved");
    } catch (e) {
      toast.error("Could not save", e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-body">
        <h2 className="h5">Notifications</h2>
        <p className="text-muted small">Choose how you're alerted when others change things in real time.</p>

        <div className="mb-3">
          <div className="text-muted small text-uppercase mb-1">Calls</div>
          {Object.values(NOTIFICATION_TYPES).map((meta) => (
            <div key={meta.key} className="row align-items-center g-2 mb-1">
              <label className="col-sm-7 col-form-label py-1" htmlFor={`nt-${meta.key}`}>{meta.label}</label>
              <div className="col-sm-5">
                <select id={`nt-${meta.key}`} className="form-select form-select-sm"
                  value={prefs.types[meta.key] ?? meta.default}
                  onChange={(e) => setType(meta.key, e.target.value)}>
                  {CHANNEL_LABELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-3">
          <div className="text-muted small text-uppercase mb-1">Sound</div>
          <div className="form-check">
            <input id="nt-sound" type="checkbox" className="form-check-input"
              checked={prefs.soundEnabled} onChange={(e) => setPrefs((p) => ({ ...p, soundEnabled: e.target.checked }))} />
            <label className="form-check-label" htmlFor="nt-sound">Play sounds</label>
          </div>
          <div className="d-flex align-items-center gap-2 mt-2" style={{ maxWidth: 340 }}>
            <label htmlFor="nt-volume" className="form-label mb-0 small">Volume</label>
            <input id="nt-volume" type="range" min="0" max="1" step="0.05" className="form-range"
              value={prefs.volume} onChange={(e) => setPrefs((p) => ({ ...p, volume: Number(e.target.value) }))} />
            <button type="button" className="btn btn-sm btn-outline-secondary"
              onClick={() => testSound(prefs.volume)}>Test</button>
          </div>
        </div>

        <div className="mb-3">
          <div className="text-muted small text-uppercase mb-1">Quiet time</div>
          <div className="form-check">
            <input id="nt-dnd" type="checkbox" className="form-check-input"
              checked={prefs.dnd} onChange={(e) => setPrefs((p) => ({ ...p, dnd: e.target.checked }))} />
            <label className="form-check-label" htmlFor="nt-dnd">Do Not Disturb (silence sounds; still show alerts)</label>
          </div>
          <div className="form-check mt-1">
            <input id="nt-qh" type="checkbox" className="form-check-input"
              checked={prefs.quietHours.enabled} onChange={(e) => setQuiet({ enabled: e.target.checked })} />
            <label className="form-check-label" htmlFor="nt-qh">Quiet hours</label>
          </div>
          {prefs.quietHours.enabled && (
            <div className="d-flex align-items-center gap-2 mt-1 ms-4">
              <input type="time" className="form-control form-control-sm" style={{ width: 130 }}
                value={prefs.quietHours.start} onChange={(e) => setQuiet({ start: e.target.value })} />
              <span className="text-muted">to</span>
              <input type="time" className="form-control form-control-sm" style={{ width: 130 }}
                value={prefs.quietHours.end} onChange={(e) => setQuiet({ end: e.target.value })} />
            </div>
          )}
        </div>

        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save notification settings"}
        </button>
      </div>
    </div>
  );
}
