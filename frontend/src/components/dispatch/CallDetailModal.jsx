import { useState, useEffect } from "react";
import {
  FaMapMarkerAlt,
  FaClock,
  FaUser,
  FaPhoneAlt,
  FaClipboardList,
  FaArrowRight,
  FaIdBadge,
  FaExclamationTriangle,
  FaUserSecret,
} from "react-icons/fa";
import { updateCall, repeatCall, getCallNotes, addCallNote } from "../../api/callsApi";
import { getPatient, getPatientAlerts } from "../../api/patientsApi";
import { useUserSettings } from "../../context/useUserSettings";
import { formatTimeForDisplay } from "../../utils/timeUtils";
import {
  isEmergencyCall,
  parseReturnInfo,
  isoToLocalTime,
  isoToLocalDate,
  setIsoTime,
  TS_FIELDS,
  ALERT_SEVERITY_STYLE,
} from "../../utils/dispatchBoardUtils";

export default function CallDetailModal({ call, isCompleted, onClose, onUnassign, onComplete, onReopen, onCancel, onUncancel, onEdit, onTimestampsUpdated }) {
  const { settings } = useUserSettings();
  const timeFormat = settings?.ui?.time_format || "12h";
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Timestamps editing
  const [showTs, setShowTs] = useState(false);
  const [tsValues, setTsValues] = useState({});
  const [tsSaving, setTsSaving] = useState(false);
  const [tsError, setTsError] = useState("");

  // Patient safety context — active alerts, dispatch note, sensitive flag.
  const [patientAlerts, setPatientAlerts] = useState([]);
  const [patientExtra, setPatientExtra] = useState(null);

  const [notes, setNotes] = useState([]);
  const [noteInput, setNoteInput] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteErr, setNoteErr] = useState("");
  const [repeating, setRepeating] = useState(false);

  useEffect(() => {
    if (!call.patient_id) { setPatientAlerts([]); setPatientExtra(null); return; }
    getPatientAlerts(call.patient_id).then(setPatientAlerts).catch(() => setPatientAlerts([]));
    getPatient(call.patient_id).then(setPatientExtra).catch(() => setPatientExtra(null));
  }, [call.patient_id]);

  useEffect(() => {
    getCallNotes(call.id).then(setNotes).catch(() => setNotes([]));
  }, [call.id]);

  async function handleAddNote(e) {
    e.preventDefault();
    const content = noteInput.trim();
    if (!content) return;
    setNoteBusy(true);
    setNoteErr("");
    try {
      const note = await addCallNote(call.id, content);
      setNotes((prev) => [...prev, note]);
      setNoteInput("");
    } catch (err) {
      setNoteErr(err.message || "Failed to add note.");
    } finally {
      setNoteBusy(false);
    }
  }

  async function handleRepeat() {
    setRepeating(true);
    try {
      await repeatCall(call.id);
      onClose();
    } catch (err) {
      setRepeating(false);
      setNoteErr(err.message || "Failed to repeat call.");
    }
  }

  useEffect(() => {
    const init = {};
    TS_FIELDS.forEach(f => { init[f.key] = isoToLocalTime(call[f.key]); });
    setTsValues(init);
  }, [call]);

  const handleTsSave = async () => {
    setTsSaving(true);
    setTsError("");
    try {
      const payload = {};
      TS_FIELDS.forEach(f => {
        const t = (tsValues[f.key] || "").trim();
        if (t) payload[f.key] = setIsoTime(call[f.key], call.trip_date, t);
        else payload[f.key] = null;
      });
      await updateCall(call.id, payload);
      if (onTimestampsUpdated) onTimestampsUpdated();
      setShowTs(false);
    } catch (e) {
      setTsError(e.message || "Save failed");
    } finally {
      setTsSaving(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancelReason.trim()) { setCancelError("Reason is required."); return; }
    setCancelling(true);
    try {
      await onCancel(call.id, cancelReason.trim());
      onClose();
    } catch (err) {
      setCancelError(err.message || "Failed to cancel call.");
    } finally {
      setCancelling(false);
    }
  };

  const ret = parseReturnInfo(call.notes);
  const isReturnCall = (call.call_type || "").toLowerCase() === "return";
  const emergency = isEmergencyCall(call);

  const dispatcher = call.dispatcher_name;
  const phone = call.caller_phone || call.patient_phone;
  const dob = call.patient_dob;
  const callerNote = call.caller_note;
  const cleanNotes = (call.notes || "").trim();

  const accentColor = emergency ? "var(--color-danger)" : isReturnCall ? "var(--color-primary)" : isCompleted ? "var(--color-text-muted)" : "var(--color-primary)";
  // The rgb triple behind the accent, so tinted backgrounds/borders can be built
  // with rgba() instead of the old hex-suffix concatenation.
  const accentRgb = emergency ? "var(--color-danger-rgb)" : isReturnCall ? "var(--color-primary-rgb)" : isCompleted ? "var(--ems-tax-unknown-rgb)" : "var(--color-primary-rgb)";
  const slColor = { bls: "var(--color-success)", als: "var(--color-primary)", emergency: "var(--color-danger)", stretcher: "var(--color-purple)" }[call.service_level?.toLowerCase()] || "var(--color-text-muted)";
  const slRgb = { bls: "var(--color-success-rgb)", als: "var(--color-primary-rgb)", emergency: "var(--color-danger-rgb)", stretcher: "var(--color-purple-rgb)" }[call.service_level?.toLowerCase()] || "var(--ems-tax-unknown-rgb)";

  const Section = ({ icon: Icon, title, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div className="d-flex align-items-center gap-2 mb-2">
        <span style={{ color: "var(--ems-board-text-muted)", fontSize: 12 }}><Icon /></span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--ems-board-text-muted)", textTransform: "uppercase" }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: "var(--ems-board-border)" }} />
      </div>
      {children}
    </div>
  );

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,0.78)", zIndex: 1060 }} tabIndex={-1} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content" style={{ background: "var(--ems-board-bg-card-alt)", border: `1px solid rgba(${accentRgb}, 0.27)`, borderRadius: 14, overflow: "hidden" }}>

          {/* Color bar + header */}
          <div style={{ background: `linear-gradient(135deg, rgba(${accentRgb}, 0.13) 0%, var(--color-surface) 100%)`, borderBottom: `1px solid rgba(${accentRgb}, 0.2)`, padding: "14px 18px" }}>
            <div className="d-flex align-items-start justify-content-between">
              <div>
                <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                  <span className="fw-bold" style={{ color: "var(--ems-board-text)", fontSize: 17 }}>
                    {call.patient_name || `Call #${call.id}`}
                  </span>
                  {isReturnCall && (
                    <span style={{ fontSize: 11, color: "var(--color-primary)", background: "rgba(var(--color-primary-rgb),0.18)", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>RETURN</span>
                  )}
                  {emergency && (
                    <span style={{ fontSize: 11, background: "rgba(var(--color-danger-rgb),0.2)", color: "var(--color-danger)", padding: "2px 8px", borderRadius: 20, fontWeight: 700, border: "1px solid rgba(var(--color-danger-rgb), 0.33)" }}>⚡ EMERGENCY</span>
                  )}
                </div>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span style={{ fontSize: 12, color: slColor, background: `rgba(${slRgb}, 0.09)`, padding: "2px 10px", borderRadius: 20, fontWeight: 700, border: `1px solid rgba(${slRgb}, 0.27)` }}>
                    {(call.service_level || "—").toUpperCase()}
                  </span>
                  {isCompleted ? (
                    <span style={{ fontSize: 11, color: "var(--ems-board-text-muted)", background: "rgba(var(--ems-tax-unknown-rgb),0.2)", padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(var(--ems-tax-unknown-rgb), 0.27)" }}>✓ Completed</span>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--color-success)", background: "rgba(var(--color-success-rgb),0.15)", padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(var(--color-success-rgb), 0.27)" }}>● Active</span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--ems-board-text-muted)" }}>#{call.id}</span>
                </div>
              </div>
              <button className="btn-close btn-close-white" style={{ fontSize: 11, opacity: 0.6 }} onClick={onClose} />
            </div>
          </div>

          <div style={{ padding: "16px 18px", maxHeight: "65vh", overflowY: "auto" }}>

            {/* Trip route */}
            <Section icon={FaMapMarkerAlt} title="Route">
              <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 10, padding: "10px 14px" }}>
                <div className="d-flex align-items-start gap-3">
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-success)", border: "2px solid var(--color-success)" }} />
                    <div style={{ width: 1, height: 28, background: "var(--ems-board-border)", margin: "3px 0" }} />
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor, border: `2px solid ${accentColor}` }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 2 }}>PICKUP</div>
                      <div style={{ fontSize: 13, color: "var(--ems-board-text)", fontWeight: 500 }}>{call.pickup_address || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 2 }}>DROP-OFF</div>
                      <div style={{ fontSize: 13, color: "var(--ems-board-text)", fontWeight: 500 }}>{call.dropoff_address || "—"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Time */}
            <Section icon={FaClock} title="Schedule">
              <div className="d-flex gap-2">
                <div style={{ flex: 1, background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 3 }}>PICKUP TIME</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ems-board-text)" }}>{formatTimeForDisplay(call.pickup_time, timeFormat) || "—"}</div>
                </div>
                <div style={{ flex: 1, background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 3 }}>APPT TIME</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ems-board-text)" }}>{formatTimeForDisplay(call.appointment_time, timeFormat) || "—"}</div>
                </div>
                <div style={{ flex: 1, background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 3 }}>TRIP DATE</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ems-board-text-muted)" }}>{call.trip_date || "—"}</div>
                </div>
              </div>
            </Section>

            {/* Timestamps */}
            <Section icon={FaClock} title="Dispatch Timestamps">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: showTs ? 10 : 0 }}>
                {TS_FIELDS.map(f => {
                  const ts = call[f.key];
                  return (
                    <div key={f.key} style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "5px 10px", minWidth: 90, opacity: ts ? 1 : 0.45 }}>
                      <div style={{ fontSize: 9, color: f.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{f.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: ts ? "var(--ems-board-text)" : "var(--ems-board-text-muted)" }}>
                        {ts ? isoToLocalTime(ts) : "—"}
                      </div>
                      {ts && <div style={{ fontSize: 9, color: "var(--ems-board-text-muted)" }}>{isoToLocalDate(ts)}</div>}
                    </div>
                  );
                })}
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11, padding: "4px 10px", background: showTs ? "rgba(var(--color-primary-rgb),0.18)" : "transparent", color: showTs ? "var(--color-primary)" : "var(--ems-board-text-muted)", border: `1px solid ${showTs ? "rgba(var(--color-primary-rgb), 0.33)" : "var(--ems-board-border)"}`, borderRadius: 7, marginLeft: "auto" }}
                  onClick={() => { setShowTs(v => !v); setTsError(""); }}
                >
                  {showTs ? "Cancel" : "✏ Edit"}
                </button>
              </div>
              {showTs && (
                <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--ems-board-border)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 10 }}>
                    {TS_FIELDS.map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: 10, fontWeight: 700, color: f.color, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>{f.label}</label>
                        <input
                          type="time"
                          value={tsValues[f.key] || ""}
                          onChange={e => setTsValues(p => ({ ...p, [f.key]: e.target.value }))}
                          style={{ width: "100%", fontSize: 13, padding: "4px 8px", borderRadius: 7, border: "1px solid var(--ems-board-border)", background: "var(--ems-board-bg)", color: "var(--ems-board-text)", outline: "none" }}
                        />
                      </div>
                    ))}
                  </div>
                  {tsError && <div style={{ fontSize: 12, color: "var(--color-danger)", marginBottom: 6 }}>{tsError}</div>}
                  <button
                    className="btn btn-sm"
                    style={{ fontSize: 12, padding: "5px 16px", background: "rgba(var(--color-primary-rgb),0.18)", color: "var(--color-primary)", border: "1px solid rgba(var(--color-primary-rgb), 0.33)", fontWeight: 600 }}
                    onClick={handleTsSave}
                    disabled={tsSaving}
                  >
                    {tsSaving ? "Saving…" : "Save Timestamps"}
                  </button>
                </div>
              )}
            </Section>

            {/* Patient alerts + dispatch note */}
            {(patientAlerts.length > 0 || patientExtra?.dispatch_comment) && (
              <Section icon={FaExclamationTriangle} title="Patient Alerts">
                {patientExtra?.is_sensitive && (
                  <div style={{ fontSize: 11, color: "var(--color-warning)", marginBottom: 8 }}>
                    <FaUserSecret style={{ marginRight: 4 }} /> Sensitive patient
                  </div>
                )}
                {patientAlerts.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    {patientAlerts.map((a) => (
                      <span
                        key={a.id}
                        className="badge"
                        style={{ background: ALERT_SEVERITY_STYLE[a.severity]?.bg, color: ALERT_SEVERITY_STYLE[a.severity]?.fg, border: `1px solid ${ALERT_SEVERITY_STYLE[a.severity]?.border}`, fontSize: 11 }}
                        title={a.description || ""}
                      >
                        {a.title}
                      </span>
                    ))}
                  </div>
                )}
                {patientExtra?.dispatch_comment && (
                  <div style={{ background: "rgba(var(--color-primary-rgb),0.08)", border: "1px solid rgba(var(--color-primary-rgb),0.2)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--ems-board-text)" }}>
                    {patientExtra.dispatch_comment}
                  </div>
                )}
              </Section>
            )}

            {/* Patient / contact */}
            {(dob || phone || dispatcher) && (
              <Section icon={FaUser} title="Patient & Contact">
                <div className="d-flex gap-2 flex-wrap">
                  {dob && (
                    <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "7px 12px", minWidth: 120 }}>
                      <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 2 }}>DATE OF BIRTH</div>
                      <div style={{ fontSize: 13, color: "var(--ems-board-text)" }}>{dob}</div>
                    </div>
                  )}
                  {phone && (
                    <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "7px 12px", minWidth: 140 }}>
                      <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 2 }}>PHONE</div>
                      <div style={{ fontSize: 13, color: "var(--ems-board-text)" }}><FaPhoneAlt style={{ fontSize: 10, marginRight: 4 }} />{phone}</div>
                    </div>
                  )}
                  {dispatcher && (
                    <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "7px 12px", minWidth: 120 }}>
                      <div style={{ fontSize: 10, color: "var(--ems-board-text-muted)", marginBottom: 2 }}>DISPATCHER</div>
                      <div style={{ fontSize: 13, color: "var(--ems-board-text)" }}><FaIdBadge style={{ fontSize: 10, marginRight: 4 }} />{dispatcher}</div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Caller note */}
            {callerNote && (
              <Section icon={FaPhoneAlt} title="Caller Note">
                <div style={{ background: "rgba(var(--color-warning-rgb),0.08)", border: "1px solid rgba(var(--color-warning-rgb),0.2)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--color-warning)" }}>
                  {callerNote}
                </div>
              </Section>
            )}

            {/* Return leg (legacy embedded) */}
            {ret && (
              <Section icon={FaArrowRight} title="Return Leg">
                <div style={{ background: "rgba(var(--color-primary-rgb),0.08)", border: "1px solid rgba(var(--color-primary-rgb),0.2)", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 12, color: "var(--color-primary)" }}>
                    {ret.returnPickup} <FaArrowRight style={{ fontSize: 9 }} /> {ret.returnDestination}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ems-board-text-muted)", marginTop: 3 }}>
                    {ret.returnTime ? `@ ${ret.returnTime}` : "Will Call"}
                  </div>
                </div>
              </Section>
            )}

            {/* Additional notes */}
            {cleanNotes && (
              <Section icon={FaClipboardList} title="Notes">
                <div style={{ background: "var(--ems-board-bg-card-alt)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--ems-board-text-muted)", whiteSpace: "pre-wrap", maxHeight: 80, overflowY: "auto" }}>
                  {cleanNotes}
                </div>
              </Section>
            )}
          </div>

          {/* Cancel form */}
          {showCancelForm && (
            <div style={{ background: "var(--ems-board-bg-header)", borderTop: "1px solid rgba(var(--color-danger-rgb), 0.27)", padding: "12px 18px" }}>
              <div style={{ fontSize: 12, color: "var(--color-danger)", fontWeight: 600, marginBottom: 6 }}>Cancel Call — Reason Required</div>
              <textarea
                className="form-control form-control-sm mb-2"
                style={{ background: "var(--ems-board-bg)", color: "var(--ems-board-text)", border: "1px solid rgba(var(--color-danger-rgb), 0.33)", resize: "vertical", fontSize: 13 }}
                rows={2}
                placeholder="State the reason for cancellation..."
                value={cancelReason}
                onChange={(e) => { setCancelReason(e.target.value); setCancelError(""); }}
              />
              {cancelError && <div style={{ fontSize: 12, color: "var(--color-danger)", marginBottom: 6 }}>{cancelError}</div>}
              <div className="d-flex gap-2">
                <button
                  className="btn btn-sm"
                  style={{ background: "rgba(var(--color-danger-rgb),0.2)", color: "var(--color-danger)", border: "1px solid rgba(var(--color-danger-rgb), 0.33)", fontWeight: 600, fontSize: 13 }}
                  onClick={handleCancelSubmit}
                  disabled={cancelling}
                >
                  {cancelling ? "Cancelling..." : "Confirm Cancel"}
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: "transparent", color: "var(--ems-board-text-muted)", border: "1px solid var(--ems-board-border)", fontSize: 13 }}
                  onClick={() => { setShowCancelForm(false); setCancelReason(""); setCancelError(""); }}
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {/* Communication log (append-only) */}
          <div style={{ borderTop: "1px solid var(--ems-board-border)", padding: "12px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ems-board-text-muted)", textTransform: "uppercase", marginBottom: 8 }}>
              Communication log
            </div>
            {notes.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ems-board-text-muted)", marginBottom: 8 }}>No notes yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8, maxHeight: 160, overflowY: "auto" }}>
                {notes.map((n) => (
                  <div key={n.id} style={{ fontSize: 13, color: "var(--ems-board-text)" }}>
                    <span style={{ color: "var(--ems-board-text-muted)", fontSize: 11 }}>
                      {(n.createdAt || "").replace("T", " ")} · {n.userName}
                    </span>
                    <div style={{ whiteSpace: "pre-wrap" }}>{n.content}</div>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddNote} style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Add a note…"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                disabled={noteBusy}
                maxLength={2000}
              />
              <button type="submit" className="btn btn-sm btn-primary" disabled={noteBusy || !noteInput.trim()}>
                {noteBusy ? "…" : "Add"}
              </button>
            </form>
            {noteErr && <div style={{ fontSize: 12, color: "var(--color-danger)", marginTop: 4 }}>{noteErr}</div>}
          </div>

          {/* Footer actions */}
          <div style={{ background: "var(--ems-board-bg-header)", borderTop: "1px solid var(--ems-board-border)", padding: "12px 18px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {call.status !== "cancelled" && !showCancelForm && (
              <>
                {!isCompleted && (
                  <>
                    <button
                      className="btn btn-sm"
                      style={{ background: "rgba(var(--color-success-rgb),0.15)", color: "var(--color-success)", border: "1px solid rgba(var(--color-success-rgb), 0.33)", fontWeight: 600, fontSize: 13, padding: "6px 16px" }}
                      onClick={() => { onComplete(call.assignment_id); onClose(); }}
                    >
                      ✓ Mark Complete
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{ background: "rgba(var(--ems-tax-unknown-rgb),0.12)", color: "var(--ems-board-text-muted)", border: "1px solid rgba(var(--ems-tax-unknown-rgb), 0.33)", fontSize: 13, padding: "6px 14px" }}
                      onClick={() => { onUnassign(call.assignment_id); onClose(); }}
                    >
                      ↩ Unassign
                    </button>
                  </>
                )}
                {isCompleted && (
                  <button
                    className="btn btn-sm"
                    style={{ background: "rgba(var(--color-warning-rgb),0.12)", color: "var(--color-warning)", border: "1px solid rgba(var(--color-warning-rgb), 0.33)", fontWeight: 600, fontSize: 13, padding: "6px 16px" }}
                    onClick={() => { onReopen(call.assignment_id); onClose(); }}
                  >
                    ↩ Reopen Call
                  </button>
                )}
                <button
                  className="btn btn-sm"
                  style={{ background: "rgba(var(--color-danger-rgb),0.1)", color: "var(--color-danger)", border: "1px solid rgba(var(--color-danger-rgb), 0.2)", fontSize: 13, padding: "6px 14px" }}
                  onClick={() => setShowCancelForm(true)}
                >
                  ✕ Cancel Call
                </button>
              </>
            )}
            {call.status === "cancelled" && (
              <div className="d-flex align-items-center gap-3">
                <span style={{ fontSize: 12, color: "var(--color-danger)", fontWeight: 600 }}>
                  ✕ Cancelled{call.cancel_reason ? ` — ${call.cancel_reason}` : ""}
                </span>
                <button
                  className="btn btn-sm"
                  style={{ background: "rgba(var(--color-warning-rgb),0.12)", color: "var(--color-warning)", border: "1px solid rgba(var(--color-warning-rgb), 0.27)", fontSize: 12, padding: "4px 12px" }}
                  onClick={() => { onUncancel(call.id); onClose(); }}
                >
                  ↩ Uncancel
                </button>
              </div>
            )}
            {onEdit && (
              <button
                className="btn btn-sm"
                style={{ background: "rgba(var(--color-primary-rgb),0.1)", color: "var(--color-primary)", border: "1px solid rgba(var(--color-primary-rgb), 0.27)", fontSize: 13, padding: "6px 14px" }}
                onClick={() => { onEdit(call); onClose(); }}
              >
                ✏ Edit Call
              </button>
            )}
            <button
              className="btn btn-sm"
              style={{ background: "rgba(var(--color-primary-rgb),0.1)", color: "var(--color-primary)", border: "1px solid rgba(var(--color-primary-rgb), 0.27)", fontSize: 13, padding: "6px 14px" }}
              onClick={handleRepeat}
              disabled={repeating}
              title="Create a new call for today with the same trip details"
            >
              {repeating ? "…" : "⟳ Repeat"}
            </button>
            <button
              className="btn btn-sm ms-auto"
              style={{ background: "transparent", color: "var(--ems-board-text-muted)", border: "1px solid var(--color-border)", fontSize: 13, padding: "6px 14px" }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
