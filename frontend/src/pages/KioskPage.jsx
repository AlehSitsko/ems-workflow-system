import React, { useState, useEffect } from "react";
import { kioskEmployees, kioskStatus, kioskClockIn, kioskClockOut } from "../api/timeApi";

function formatTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
}

function formatDuration(clockIn) {
  if (!clockIn) return "";
  const diff = Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function KioskPage() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [pin, setPin] = useState("");
  const [selected, setSelected] = useState(null);   // employee object
  const [status, setStatus] = useState(null);        // { clocked_in, clock_in, entry_id }
  const [message, setMessage] = useState(null);      // { text, type: "success"|"error" }
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("select");        // "select" | "pin" | "action" | "done"
  const [tick, setTick] = useState(0);

  // Clock tick for live duration
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Load employee list
  useEffect(() => {
    kioskEmployees().then(setEmployees).catch(() => {});
  }, []);

  // Auto-return to select after 15s on done screen
  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(() => { setStep("select"); setSelected(null); setStatus(null); setMessage(null); setPin(""); setSearch(""); }, 15000);
    return () => clearTimeout(t);
  }, [step]);

  const filtered = employees.filter(e =>
    search === "" || e.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = async (emp) => {
    setSelected(emp);
    if (emp.pin) {
      setStep("pin");
    } else {
      await loadStatus(emp.id);
      setStep("action");
    }
  };

  const loadStatus = async (id) => {
    const s = await kioskStatus(id);
    setStatus(s);
  };

  const handlePinSubmit = async () => {
    if (pin !== selected.pin) {
      setMessage({ text: "Incorrect PIN. Try again.", type: "error" });
      setPin("");
      return;
    }
    setMessage(null);
    setPin("");
    await loadStatus(selected.id);
    setStep("action");
  };

  const handleClockIn = async () => {
    setLoading(true);
    try {
      await kioskClockIn(selected.id);
      setMessage({ text: `Clocked in at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, type: "success" });
      setStep("done");
    } catch (e) {
      setMessage({ text: e.message, type: "error" });
    }
    setLoading(false);
  };

  const handleClockOut = async () => {
    setLoading(true);
    try {
      await kioskClockOut(selected.id);
      setMessage({ text: `Clocked out at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, type: "success" });
      setStep("done");
    } catch (e) {
      setMessage({ text: e.message, type: "error" });
    }
    setLoading(false);
  };

  const reset = () => {
    setStep("select"); setSelected(null); setStatus(null);
    setMessage(null); setPin(""); setSearch("");
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const page = {
    minHeight: "100vh",
    background: "#0d1117",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem 1rem",
    color: "#e9ecef",
  };
  const card = {
    background: "#1a2236",
    borderRadius: 16,
    padding: "2rem",
    width: "100%",
    maxWidth: 480,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  };
  const bigBtn = (color, bg) => ({
    width: "100%", padding: "1.2rem", fontSize: 22, fontWeight: 700,
    borderRadius: 12, border: "none", cursor: "pointer",
    background: bg, color: color,
  });

  return (
    <div style={page}>
      <div style={{ marginBottom: "1.5rem", textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#6ea8fe", letterSpacing: 1 }}>🚑 EMS Kiosk</div>
        <div style={{ color: "#6c757d", fontSize: 14 }}>Clock In / Clock Out</div>
      </div>

      <div style={card}>
        {/* ── STEP: select ── */}
        {step === "select" && (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#adb5bd" }}>Select your name</div>
            <input
              autoFocus
              className="form-control mb-3"
              placeholder="Search by name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ background: "#151b27", border: "1px solid #2a3347", color: "#e9ecef" }}
            />
            <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.length === 0 && <p className="text-muted">No employees found.</p>}
              {filtered.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => handleSelect(emp)}
                  style={{
                    background: "#151b27", border: "1px solid #2a3347",
                    borderRadius: 8, padding: "12px 16px", color: "#e9ecef",
                    fontSize: 16, cursor: "pointer", textAlign: "left",
                    fontWeight: 500, transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#1e2d45"}
                  onMouseLeave={e => e.currentTarget.style.background = "#151b27"}
                >
                  {emp.name}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── STEP: pin ── */}
        {step === "pin" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>{selected?.name}</div>
            <div style={{ color: "#6c757d", marginBottom: 20 }}>Enter your PIN</div>
            {message && (
              <div style={{ background: message.type === "error" ? "rgba(220,53,69,0.15)" : "rgba(25,135,84,0.15)", color: message.type === "error" ? "#ea868f" : "#75b798", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 14 }}>
                {message.text}
              </div>
            )}
            <input
              autoFocus
              type="password"
              className="form-control mb-3"
              value={pin}
              onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
              maxLength={6}
              placeholder="PIN"
              style={{ background: "#151b27", border: "1px solid #2a3347", color: "#e9ecef", fontSize: 24, letterSpacing: 8, textAlign: "center" }}
            />
            <div className="d-flex gap-2">
              <button className="btn btn-primary flex-fill" style={{ fontSize: 16 }} onClick={handlePinSubmit}>Continue</button>
              <button className="btn btn-outline-secondary" onClick={reset}>Back</button>
            </div>
          </>
        )}

        {/* ── STEP: action ── */}
        {step === "action" && status && (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{selected?.name}</div>
            {status.clocked_in ? (
              <>
                <div style={{ color: "#75b798", marginBottom: 4 }}>
                  ● Clocked in since {formatTime(status.clock_in)}
                </div>
                <div style={{ color: "#6c757d", fontSize: 13, marginBottom: 24 }}>
                  Duration: {formatDuration(status.clock_in)}
                </div>
                <button
                  style={bigBtn("#fff", "#dc3545")}
                  disabled={loading}
                  onClick={handleClockOut}
                >
                  {loading ? "Please wait…" : "CLOCK OUT"}
                </button>
              </>
            ) : (
              <>
                <div style={{ color: "#6c757d", marginBottom: 24 }}>Not currently clocked in</div>
                <button
                  style={bigBtn("#fff", "#198754")}
                  disabled={loading}
                  onClick={handleClockIn}
                >
                  {loading ? "Please wait…" : "CLOCK IN"}
                </button>
              </>
            )}
            <button className="btn btn-outline-secondary w-100 mt-3" onClick={reset}>Cancel</button>
          </>
        )}

        {/* ── STEP: done ── */}
        {step === "done" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>
              {message?.type === "success" ? "✅" : "❌"}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{selected?.name}</div>
            <div style={{ fontSize: 18, color: message?.type === "success" ? "#75b798" : "#ea868f", marginBottom: 24 }}>
              {message?.text}
            </div>
            <div style={{ color: "#6c757d", fontSize: 13, marginBottom: 20 }}>Returning to main screen in 15 seconds…</div>
            <button className="btn btn-outline-secondary" onClick={reset}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
