import { useState, useEffect, useCallback } from "react";

const PREF_KEY = "ems_time_format";

function h24toH12(h24) {
  const per = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { h12: String(h12), period: per };
}

function h12toH24(h, period) {
  const n = parseInt(h, 10);
  if (isNaN(n)) return null;
  if (period === "AM") return n === 12 ? 0 : n;
  return n === 12 ? 12 : n + 12;
}

export default function TimeInput({ value, onChange, id, showFormatToggle = false }) {
  const [fmt, setFmt] = useState(() => {
    try { return localStorage.getItem(PREF_KEY) || "12"; } catch { return "12"; }
  });
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [period, setPeriod] = useState("AM");

  // Sync format when another TimeInput on the page switches it
  useEffect(() => {
    const handler = (e) => { if (e.detail && e.detail !== fmt) setFmt(e.detail); };
    window.addEventListener("ems-time-format", handler);
    return () => window.removeEventListener("ems-time-format", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync incoming HH:MM value into local state
  useEffect(() => {
    if (!value) { setHour(""); setMinute(""); setPeriod("AM"); return; }
    const [hStr, mStr] = value.split(":");
    const h24 = parseInt(hStr, 10);
    if (isNaN(h24)) return;
    const m = (mStr || "00").padStart(2, "0");
    setMinute(m);
    if (fmt === "24") {
      setHour(String(h24).padStart(2, "0"));
    } else {
      const { h12, period: per } = h24toH12(h24);
      setHour(h12);
      setPeriod(per);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, fmt]);

  const emit = useCallback((h, m, p) => {
    if (h === "" || m === "") { onChange(""); return; }
    let h24;
    if (fmt === "24") {
      h24 = parseInt(h, 10);
    } else {
      h24 = h12toH24(h, p);
    }
    const mNum = parseInt(m, 10);
    if (h24 === null || isNaN(h24) || h24 < 0 || h24 > 23 || isNaN(mNum) || mNum < 0 || mNum > 59) {
      onChange(""); return;
    }
    onChange(`${String(h24).padStart(2, "0")}:${String(mNum).padStart(2, "0")}`);
  }, [fmt, onChange]);

  const switchFmt = (f) => {
    if (f === fmt) return;
    // Convert current displayed hour when switching
    if (f === "24" && hour) {
      const h24 = h12toH24(hour, period);
      if (h24 !== null) setHour(String(h24).padStart(2, "0"));
    } else if (f === "12" && hour) {
      const h24 = parseInt(hour, 10);
      if (!isNaN(h24)) {
        const { h12, period: per } = h24toH12(h24);
        setHour(h12);
        setPeriod(per);
      }
    }
    setFmt(f);
    try { localStorage.setItem(PREF_KEY, f); } catch {}
    window.dispatchEvent(new CustomEvent("ems-time-format", { detail: f }));
  };

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
    background: "var(--ems-bg-surface)",
    color: "var(--ems-text-primary)",
    outline: "none",
    width: 46,
  };

  const pill = (label, active, onClick) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      style={{
        padding: "3px 9px",
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 6,
        border: `1px solid ${active ? "#0d6efd" : "var(--ems-border)"}`,
        background: active ? "#0d6efd" : "transparent",
        color: active ? "#fff" : "var(--ems-text-muted)",
        cursor: "pointer",
        lineHeight: 1.6,
        transition: "all 0.12s",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {/* Format toggle — rendered only when showFormatToggle=true */}
      {showFormatToggle && (
        <div style={{ display: "flex", gap: 3 }}>
          {pill("12h", fmt === "12", () => switchFmt("12"))}
          {pill("24h", fmt === "24", () => switchFmt("24"))}
        </div>
      )}
      {/* Inputs */}
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
