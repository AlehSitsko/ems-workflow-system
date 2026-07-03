import { useState, useEffect, useCallback } from "react";
import { useUserSettings } from "../../context/useUserSettings";
import { normalizeTimeValue, convert12hTo24h, convert24hTo12h } from "../../utils/timeUtils";

// Time format is a per-user setting (Settings page), not a per-form switch —
// see useUserSettings() / settings.ui.time_format ("12h" | "24h").
export default function TimeInput({ value, onChange, id, disabled = false }) {
  const { settings } = useUserSettings();
  const fmt = settings?.ui?.time_format === "24h" ? "24" : "12";

  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [period, setPeriod] = useState("AM");

  // Sync incoming stored value (24h "HH:MM") into local display state
  useEffect(() => {
    const norm = normalizeTimeValue(value);
    if (!norm) { setHour(""); setMinute(""); setPeriod("AM"); return; }
    const [hStr, mStr] = norm.split(":");
    if (fmt === "24") {
      setHour(hStr);
      setMinute(mStr);
    } else {
      const parts = convert24hTo12h(norm);
      setHour(parts.hour);
      setMinute(parts.minute);
      setPeriod(parts.period);
    }
  }, [value, fmt]);

  const emit = useCallback((h, m, p) => {
    if (h === "" || m === "") { onChange(""); return; }
    let h24Str;
    if (fmt === "24") {
      const n = parseInt(h, 10);
      const mNum = parseInt(m, 10);
      h24Str = (isNaN(n) || n < 0 || n > 23 || isNaN(mNum) || mNum < 0 || mNum > 59)
        ? null
        : `${String(n).padStart(2, "0")}:${String(mNum).padStart(2, "0")}`;
    } else {
      h24Str = convert12hTo24h(h, m, p);
    }
    onChange(h24Str || "");
  }, [fmt, onChange]);

  const onHourChange = (v) => {
    const raw = v.replace(/\D/g, "").slice(0, 2);
    setHour(raw);
    emit(raw, minute, period);
  };

  const onMinuteChange = (v) => {
    const raw = v.replace(/\D/g, "").slice(0, 2);
    setMinute(raw);
    emit(hour, raw, period);
  };

  const onHourBlur = () => {
    if (!hour) return;
    const n = parseInt(hour, 10);
    if (fmt === "24") {
      if (n < 0 || n > 23) { setHour(""); return; }
      setHour(String(n).padStart(2, "0"));
    } else {
      if (n < 1 || n > 12) { setHour(""); return; }
      setHour(String(n));
    }
    emit(hour, minute, period);
  };

  const onMinuteBlur = () => {
    if (!minute) return;
    const n = parseInt(minute, 10);
    if (n < 0 || n > 59) { setMinute(""); return; }
    setMinute(String(n).padStart(2, "0"));
    emit(hour, minute, period);
  };

  const togglePeriod = (p) => {
    if (disabled) return;
    setPeriod(p);
    emit(hour, minute, p);
  };

  const inputBase = {
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    fontSize: "0.875rem",
    padding: "0.3rem 0.35rem",
    borderRadius: 7,
    border: "1px solid var(--ems-border)",
    background: disabled ? "var(--ems-bg-surface-2, rgba(255,255,255,0.05))" : "var(--ems-bg-surface)",
    color: "var(--ems-text-primary)",
    outline: "none",
    width: 46,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? "not-allowed" : "text",
  };

  const pill = (label, active, onClick) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "3px 9px",
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 6,
        border: `1px solid ${active ? "#0d6efd" : "var(--ems-border)"}`,
        background: active ? "#0d6efd" : "transparent",
        color: active ? "#fff" : "var(--ems-text-muted)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        lineHeight: 1.6,
        transition: "all 0.12s",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder={fmt === "24" ? "HH" : "H"}
          value={hour}
          onChange={e => onHourChange(e.target.value)}
          onBlur={onHourBlur}
          disabled={disabled}
          style={inputBase}
        />
        <span style={{ fontWeight: 800, color: "var(--ems-text-muted)", userSelect: "none" }}>:</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder="MM"
          value={minute}
          onChange={e => onMinuteChange(e.target.value)}
          onBlur={onMinuteBlur}
          disabled={disabled}
          style={inputBase}
        />
        {fmt === "12" && (
          <div style={{ display: "flex", gap: 3, marginLeft: 3 }}>
            {pill("AM", period === "AM", () => togglePeriod("AM"))}
            {pill("PM", period === "PM", () => togglePeriod("PM"))}
          </div>
        )}
      </div>
    </div>
  );
}
