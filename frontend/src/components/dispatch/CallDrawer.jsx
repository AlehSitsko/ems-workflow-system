import React, { useEffect, useState } from "react";
import { FaSearch, FaUser, FaUserPlus, FaTimes, FaPhoneAlt } from "react-icons/fa";
import EntityDrawer from "../ui/EntityDrawer";
import TimeInput from "../ui/TimeInput";
import { useConfirm } from "../ui/useConfirm";
import { createCall, updateCall } from "../../api/callsApi";
import { createPatient, findDuplicatePatient, getPatients } from "../../api/patientsApi";
import { getTodayDate, getLoggedDispatcherName, localIsoNow } from "../../utils/callUtils";

const SERVICE_LEVELS = ["BLS", "ALS", "Stretcher", "Emergency"];
const CALL_TYPES = ["scheduled", "emergency", "return", "will_call"];
const CALLER_TYPES = ["patient", "family", "facility", "other"];

const emptyForm = (defaultDate) => ({
  patientId: null,
  patientName: "",
  dispatcherName: getLoggedDispatcherName(),
  tripDate: defaultDate || getTodayDate(),
  dateOfCall: getTodayDate(),
  pickupTime: "",
  appointmentTime: "",
  pickupAddress: "",
  dropoffAddress: "",
  callType: "scheduled",
  serviceLevel: "BLS",
  callerPhone: "",
  callerNote: "",
  callerType: "",
  notes: "",
});

const emptyNewPatient = () => ({
  firstName: "",
  lastName: "",
  dob: "",
  phone: "",
  address: "",
});

export default function CallDrawer({ open, onClose, onSaved, callToEdit, defaultTripDate }) {
  const confirm = useConfirm();
  const [form, setForm] = useState(emptyForm(defaultTripDate));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [isDirty, setIsDirty] = useState(false);

  // Patient search
  const [patientMode, setPatientMode] = useState("search"); // "search" | "create"
  const [searchName, setSearchName] = useState("");
  const [searchDob, setSearchDob] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResults, setSearchResults] = useState(null); // null = not searched
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // New patient form
  const [newPatient, setNewPatient] = useState(emptyNewPatient());
  const [patientSaving, setPatientSaving] = useState(false);
  const [patientError, setPatientError] = useState("");
  const [dupWarning, setDupWarning] = useState(null);

  // Populate form when editing
  useEffect(() => {
    if (open && callToEdit) {
      setForm({
        patientId: callToEdit.patient_id || null,
        patientName: callToEdit.patient_name || "",
        dispatcherName: callToEdit.dispatcher_name || getLoggedDispatcherName(),
        tripDate: callToEdit.trip_date || defaultTripDate || getTodayDate(),
        dateOfCall: callToEdit.date_of_call || getTodayDate(),
        pickupTime: callToEdit.pickup_time || "",
        appointmentTime: callToEdit.appointment_time || "",
        pickupAddress: callToEdit.pickup_address || "",
        dropoffAddress: callToEdit.dropoff_address || "",
        callType: callToEdit.call_type || "scheduled",
        serviceLevel: callToEdit.service_level || "BLS",
        callerPhone: callToEdit.caller_phone || "",
        callerNote: callToEdit.caller_note || "",
        callerType: callToEdit.caller_type || "",
        notes: callToEdit.notes || "",
      });
      setPatientMode("search");
      setSearchResults(null);
      setErrors([]);
    } else if (open && !callToEdit) {
      setForm(emptyForm(defaultTripDate));
      setPatientMode("search");
      setSearchResults(null);
      setErrors([]);
    }
    setNewPatient(emptyNewPatient());
    setPatientError("");
    setDupWarning(null);
    setSearchName("");
    setSearchDob("");
    setSearchPhone("");
    setIsDirty(false);
  }, [open, callToEdit, defaultTripDate]);

  const setFormDirty = (updater) => { setForm(updater); setIsDirty(true); };
  const field = (key) => (e) => setFormDirty(p => ({ ...p, [key]: e.target.value }));

  const handleCloseRequest = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "Unsaved changes",
        message: "You have unsaved changes. Close without saving?",
        variant: "warning",
        confirmLabel: "Close without saving",
      });
      if (!ok) return;
    }
    onClose();
  };

  const handleSearch = async () => {
    const name = searchName.trim();
    const dob = searchDob.trim();
    const phone = searchPhone.trim();
    if (!name && !dob && !phone) { setSearchError("Enter a name, DOB, or phone to search."); return; }
    setSearching(true);
    setSearchError("");
    try {
      const data = await getPatients({ name: name || undefined, dob: dob || undefined }, 1, 50);
      let items = Array.isArray(data.items) ? data.items : [];
      if (phone) items = items.filter(p => String(p.phone || "").replace(/\D/g, "").includes(phone.replace(/\D/g, "")));
      setSearchResults(items);
    } catch (e) {
      setSearchError(e.message);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectPatient = (p) => {
    setFormDirty(prev => ({
      ...prev,
      patientId: p.id,
      patientName: `${p.first_name} ${p.last_name}`,
      pickupAddress: prev.pickupAddress.trim() ? prev.pickupAddress : (p.address || ""),
    }));
    setSearchResults(null);
    setSearchName("");
  };

  const handleClearPatient = () => {
    setFormDirty(prev => ({ ...prev, patientId: null, patientName: "" }));
  };

  const handleCreatePatient = async () => {
    const { firstName, lastName, dob, phone, address } = newPatient;
    if (!firstName.trim() || !lastName.trim()) {
      setPatientError("First name and last name are required.");
      return;
    }
    setPatientSaving(true);
    setPatientError("");
    setDupWarning(null);
    try {
      const dup = await findDuplicatePatient({ first_name: firstName.trim(), last_name: lastName.trim(), dob: dob.trim() });
      if (dup) {
        setDupWarning(dup);
        setPatientSaving(false);
        return;
      }
      const created = await createPatient({ first_name: firstName.trim(), last_name: lastName.trim(), dob: dob.trim() || null, phone: phone.trim() || null, address: address.trim() || null });
      setFormDirty(prev => ({ ...prev, patientId: created.id, patientName: `${created.first_name} ${created.last_name}` }));
      setPatientMode("search");
      setNewPatient(emptyNewPatient());
    } catch (e) {
      setPatientError(e.message);
    } finally {
      setPatientSaving(false);
    }
  };

  const validate = () => {
    const errs = [];
    if (!form.tripDate.trim()) errs.push("Trip date is required.");
    if (!form.pickupAddress.trim()) errs.push("Pickup address is required.");
    if (!form.dropoffAddress.trim()) errs.push("Dropoff address is required.");
    if (!form.serviceLevel) errs.push("Service level is required.");
    return errs;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }
    setSaving(true);
    setErrors([]);
    try {
      const payload = {
        patient_id: form.patientId || null,
        dispatcher_name: form.dispatcherName,
        date_of_call: form.dateOfCall,
        trip_date: form.tripDate,
        pickup_time: form.pickupTime || null,
        appointment_time: form.appointmentTime || null,
        pickup_address: form.pickupAddress.trim(),
        dropoff_address: form.dropoffAddress.trim(),
        call_type: form.callType,
        service_level: form.serviceLevel,
        caller_phone: form.callerPhone.trim() || null,
        caller_note: form.callerNote.trim() || null,
        caller_type: form.callerType || null,
        notes: form.notes.trim() || null,
      };
      if (callToEdit) {
        await updateCall(callToEdit.id, payload);
      } else {
        payload.received_at = localIsoNow ? localIsoNow() : new Date().toISOString();
        await createCall(payload);
      }
      onSaved?.();
    } catch (err) {
      setErrors([err.message]);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    background: "var(--ems-bg-surface)",
    color: "var(--ems-text-primary)",
    border: "1px solid var(--ems-border)",
    borderRadius: 7,
    fontSize: 13,
    padding: "0.375rem 0.65rem",
    width: "100%",
    outline: "none",
  };

  const SectionHeader = ({ children }) => (
    <div className="col-12">
      <hr style={{ borderColor: "var(--ems-border)", marginBottom: 12 }} />
      <h6 style={{ fontSize: 12, fontWeight: 700, color: "var(--ems-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>{children}</h6>
    </div>
  );

  return (
    <EntityDrawer
      open={open}
      onClose={onClose}
      onCloseRequested={handleCloseRequest}
      title={callToEdit ? `Edit Call #${callToEdit.id}` : "New Call"}
      subtitle={callToEdit ? `Patient: ${form.patientName || "—"}` : "Create a new transport call"}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={handleCloseRequest} disabled={saving}>Cancel</button>
          <button type="submit" form="call-drawer-form" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : callToEdit ? "Update Call" : "Create Call"}
          </button>
        </>
      }
    >
      <form id="call-drawer-form" onSubmit={handleSave}>
        {errors.length > 0 && (
          <div className="alert alert-danger mb-3">
            <ul className="mb-0">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}

        <div className="row g-3">
          {/* ── Patient ── */}
          <SectionHeader>Patient</SectionHeader>

          {form.patientId ? (
            <div className="col-12">
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                borderRadius: 8, background: "rgba(13,110,253,0.08)", border: "1px solid rgba(13,110,253,0.25)",
              }}>
                <FaUser style={{ color: "#6ea8fe", fontSize: 14 }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ems-text-primary)", flex: 1 }}>{form.patientName}</span>
                <button type="button" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11, padding: "2px 8px" }} onClick={handleClearPatient}>
                  <FaTimes /> Change
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Patient mode toggle */}
              <div className="col-12">
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[{ key: "search", label: "Find patient", icon: <FaSearch /> }, { key: "create", label: "New patient", icon: <FaUserPlus /> }].map(({ key, label, icon }) => (
                    <button key={key} type="button"
                      className={`btn btn-sm ${patientMode === key ? "btn-primary" : "btn-outline-secondary"}`}
                      style={{ fontSize: 12 }}
                      onClick={() => { setPatientMode(key); setPatientError(""); setDupWarning(null); }}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </div>

              {patientMode === "search" && (
                <div className="col-12">
                  <div className="row g-2 mb-2">
                    <div className="col-md-5">
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ems-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Last Name</label>
                      <input
                        type="text"
                        placeholder="Smith…"
                        value={searchName}
                        onChange={e => setSearchName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && (e.preventDefault(), handleSearch())}
                        style={inputStyle}
                      />
                    </div>
                    <div className="col-md-4">
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--ems-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Date of Birth</label>
                      <input
                        type="date"
                        value={searchDob}
                        onChange={e => setSearchDob(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div className="col-md-3 d-flex align-items-end">
                      <button type="button" className="btn btn-primary btn-sm w-100 d-flex align-items-center justify-content-center gap-1" onClick={handleSearch} disabled={searching}>
                        <FaSearch style={{ fontSize: 11 }} /> {searching ? "…" : "Search"}
                      </button>
                    </div>
                  </div>
                  {searchError && <div className="text-danger mb-1" style={{ fontSize: 12 }}>{searchError}</div>}
                  {searchResults !== null && (
                    <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--ems-border)", borderRadius: 8 }}>
                      {searchResults.length === 0 ? (
                        <div style={{ padding: "12px", textAlign: "center", color: "var(--ems-text-muted)", fontSize: 13 }}>No patients found</div>
                      ) : searchResults.map(p => (
                        <button key={p.id} type="button"
                          onClick={() => handleSelectPatient(p)}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "8px 12px", background: "transparent", border: "none",
                            borderBottom: "1px solid var(--ems-border)", cursor: "pointer",
                            color: "var(--ems-text-primary)", fontSize: 13,
                          }}
                          onMouseOver={e => e.currentTarget.style.background = "var(--ems-bg-surface-2)"}
                          onMouseOut={e => e.currentTarget.style.background = "transparent"}
                        >
                          <strong>{p.first_name} {p.last_name}</strong>
                          {p.dob && <span style={{ marginLeft: 8, color: "var(--ems-text-muted)", fontSize: 12 }}>DOB: {p.dob}</span>}
                          {p.phone && <span style={{ marginLeft: 8, color: "var(--ems-text-muted)", fontSize: 12 }}><FaPhoneAlt style={{ fontSize: 10 }} /> {p.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--ems-text-muted)" }}>
                    Or leave empty to create a call without a patient record.
                  </div>
                </div>
              )}

              {patientMode === "create" && (
                <div className="col-12">
                  {patientError && <div className="alert alert-danger py-2 mb-2" style={{ fontSize: 13 }}>{patientError}</div>}
                  {dupWarning && (
                    <div className="alert alert-warning py-2 mb-2" style={{ fontSize: 13 }}>
                      Duplicate found: <strong>{dupWarning.first_name} {dupWarning.last_name}</strong> (DOB: {dupWarning.dob}).{" "}
                      <button type="button" className="btn btn-sm btn-warning ms-2" style={{ fontSize: 11 }} onClick={() => handleSelectPatient(dupWarning)}>Use existing</button>
                    </div>
                  )}
                  <div className="row g-2">
                    <div className="col-6">
                      <label style={{ fontSize: 12, fontWeight: 600 }}>First Name <span style={{ color: "#dc3545" }}>*</span></label>
                      <input style={inputStyle} value={newPatient.firstName} onChange={e => setNewPatient(p => ({ ...p, firstName: e.target.value }))} />
                    </div>
                    <div className="col-6">
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Last Name <span style={{ color: "#dc3545" }}>*</span></label>
                      <input style={inputStyle} value={newPatient.lastName} onChange={e => setNewPatient(p => ({ ...p, lastName: e.target.value }))} />
                    </div>
                    <div className="col-6">
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Date of Birth</label>
                      <input type="date" style={inputStyle} value={newPatient.dob} onChange={e => setNewPatient(p => ({ ...p, dob: e.target.value }))} />
                    </div>
                    <div className="col-6">
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Phone</label>
                      <input style={inputStyle} value={newPatient.phone} onChange={e => setNewPatient(p => ({ ...p, phone: e.target.value }))} />
                    </div>
                    <div className="col-12">
                      <label style={{ fontSize: 12, fontWeight: 600 }}>Address</label>
                      <input style={inputStyle} placeholder="Home address" value={newPatient.address} onChange={e => setNewPatient(p => ({ ...p, address: e.target.value }))} />
                    </div>
                    <div className="col-12">
                      <button type="button" className="btn btn-sm btn-success" onClick={handleCreatePatient} disabled={patientSaving}>
                        <FaUserPlus style={{ marginRight: 4 }} />{patientSaving ? "Creating…" : "Create & Link Patient"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Trip Details ── */}
          <SectionHeader>Trip Details</SectionHeader>

          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Trip Date <span style={{ color: "#dc3545" }}>*</span></label>
            <input type="date" className="form-control" value={form.tripDate} onChange={field("tripDate")} disabled={saving} />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Service Level <span style={{ color: "#dc3545" }}>*</span></label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {SERVICE_LEVELS.map(sl => (
                <button key={sl} type="button"
                  className={`btn btn-sm ${form.serviceLevel === sl.toLowerCase() ? "btn-primary" : "btn-outline-secondary"}`}
                  style={{ fontSize: 11 }}
                  onClick={() => setFormDirty(p => ({ ...p, serviceLevel: sl.toLowerCase() }))}
                >
                  {sl}
                </button>
              ))}
            </div>
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Call Type</label>
            <select className="form-select form-select-sm" value={form.callType} onChange={field("callType")} disabled={saving}>
              {CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Pickup Time</label>
            <TimeInput value={form.pickupTime} onChange={v => setFormDirty(p => ({ ...p, pickupTime: v }))} disabled={saving} />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Appt. Time (optional)</label>
            <TimeInput value={form.appointmentTime} onChange={v => setFormDirty(p => ({ ...p, appointmentTime: v }))} disabled={saving} />
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Date of Call</label>
            <input type="date" className="form-control" value={form.dateOfCall} onChange={field("dateOfCall")} disabled={saving} />
          </div>
          <div className="col-12">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Pickup Address <span style={{ color: "#dc3545" }}>*</span></label>
            <input type="text" className="form-control" placeholder="123 Main St, City, State" value={form.pickupAddress} onChange={field("pickupAddress")} disabled={saving} />
          </div>
          <div className="col-12">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Dropoff Address <span style={{ color: "#dc3545" }}>*</span></label>
            <input type="text" className="form-control" placeholder="Hospital / Facility name + address" value={form.dropoffAddress} onChange={field("dropoffAddress")} disabled={saving} />
          </div>

          {/* ── Caller Info ── */}
          <SectionHeader>Caller Info</SectionHeader>

          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Caller Type</label>
            <select className="form-select form-select-sm" value={form.callerType} onChange={field("callerType")} disabled={saving}>
              <option value="">— optional —</option>
              {CALLER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Caller Phone</label>
            <input type="text" className="form-control" placeholder="+1 (555) 000-0000" value={form.callerPhone} onChange={field("callerPhone")} disabled={saving} />
          </div>
          <div className="col-12">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Caller Note</label>
            <textarea className="form-control" rows={2} placeholder="Any information from the caller…" value={form.callerNote} onChange={field("callerNote")} disabled={saving} />
          </div>

          {/* ── Dispatcher ── */}
          <SectionHeader>Dispatcher</SectionHeader>
          <div className="col-md-6">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Dispatcher Name</label>
            <input type="text" className="form-control" value={form.dispatcherName} onChange={field("dispatcherName")} disabled={saving} />
          </div>
          <div className="col-12">
            <label className="form-label fw-semibold" style={{ fontSize: 13 }}>Internal Notes</label>
            <textarea className="form-control" rows={2} placeholder="Dispatcher notes (not shared with crew)…" value={form.notes} onChange={field("notes")} disabled={saving} />
          </div>
        </div>
      </form>
    </EntityDrawer>
  );
}
