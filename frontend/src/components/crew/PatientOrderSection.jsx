/**
 * Patient Order section for the unit form.
 * Works with patientOrder: [{name, time, callId}]
 */
function PatientOrderSection({
  patientOrder,
  noPatient,
  openCalls,
  onPatientOrderChange,
  onNoPatientChange,
  disabled,
}) {
  const calls = Array.isArray(openCalls) ? openCalls : [];
  const order = Array.isArray(patientOrder) ? patientOrder : [];

  const callLabel = (c) => {
    const patient = c.patient_name || "";
    const addr = c.pickup_address || "";
    const time = c.pickup_time || "";
    const svc = c.service_level || "";
    const parts = [patient || "Unknown", time, addr, svc ? svc.toUpperCase() : ""].filter(Boolean);
    return parts.join(" · ");
  };

  const updateEntry = (index, patch) => {
    const next = order.map((e, i) => i === index ? { ...e, ...patch } : e);
    onPatientOrderChange(next);
  };

  const addEntry = () => {
    onPatientOrderChange([...order, { name: "", time: "", callId: null }]);
  };

  const removeEntry = (index) => {
    onPatientOrderChange(order.filter((_, i) => i !== index));
  };

  const handleCallSelect = (index, callId) => {
    if (!callId || callId === "__manual__") {
      updateEntry(index, { callId: null, name: "", time: "" });
      return;
    }
    const call = calls.find((c) => String(c.id) === callId);
    if (call) {
      updateEntry(index, {
        callId: call.id,
        name: call.patient_name || "",
        time: call.pickup_time || "",
      });
    }
  };

  const inputStyle = {
    fontSize: 13,
    padding: "0.3rem 0.5rem",
    borderRadius: 7,
    border: "1px solid var(--ems-border)",
    background: "var(--ems-bg-surface)",
    color: "var(--ems-text-primary)",
    outline: "none",
  };

  return (
    <>
      <div className="col-12">
        <hr />
        <h5 className="mb-0">Patient Order</h5>
      </div>

      {/* No patient checkbox */}
      <div className="col-12">
        <div className="form-check" style={{ marginBottom: 8 }}>
          <input
            className="form-check-input"
            type="checkbox"
            id="noPatientCheck"
            checked={!!noPatient}
            onChange={(e) => onNoPatientChange(e.target.checked)}
            disabled={disabled}
          />
          <label className="form-check-label" htmlFor="noPatientCheck" style={{ fontWeight: 600, fontSize: 13 }}>
            No patient assigned
            <span style={{ fontSize: 11, color: "#6c757d", fontWeight: 400, marginLeft: 6 }}>
              (standby / unscheduled)
            </span>
          </label>
        </div>
      </div>

      {!noPatient && (
        <div className="col-12">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {order.map((entry, index) => (
              <div key={index} style={{
                display: "grid",
                gridTemplateColumns: "18px 1fr 80px auto",
                gap: 6,
                alignItems: "center",
                padding: "6px 10px",
                borderRadius: 8,
                background: "var(--ems-bg-surface-2)",
                border: "1px solid var(--ems-border-light)",
              }}>
                {/* Position number */}
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ems-text-muted)", textAlign: "center" }}>
                  {index + 1}
                </span>

                {/* Name — call picker or manual */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {calls.length > 0 ? (
                    <select
                      className="form-select form-select-sm"
                      style={{ fontSize: 12 }}
                      value={entry.callId ? String(entry.callId) : (entry.name ? "__manual__" : "")}
                      onChange={(e) => handleCallSelect(index, e.target.value)}
                      disabled={disabled}
                    >
                      <option value="">— Select call —</option>
                      {calls.map((c) => (
                        <option key={c.id} value={String(c.id)}>{callLabel(c)}</option>
                      ))}
                      <option value="__manual__">✏ Enter manually</option>
                    </select>
                  ) : null}
                  {/* Manual name input shown when no call selected or calls unavailable */}
                  {(!entry.callId) && (
                    <input
                      type="text"
                      placeholder="Patient name"
                      value={entry.name}
                      onChange={(e) => updateEntry(index, { name: e.target.value })}
                      disabled={disabled}
                      style={{ ...inputStyle, width: "100%" }}
                    />
                  )}
                  {entry.callId && (
                    <span style={{ fontSize: 11, color: "var(--ems-text-secondary)", fontWeight: 600 }}>
                      {entry.name}
                    </span>
                  )}
                </div>

                {/* Time */}
                <input
                  type="text"
                  placeholder="07:00"
                  value={entry.time}
                  onChange={(e) => updateEntry(index, { time: e.target.value })}
                  disabled={disabled || !!entry.callId}
                  title={entry.callId ? "Time auto-filled from call" : "Pickup time"}
                  style={{ ...inputStyle, textAlign: "center" }}
                />

                {/* Remove */}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  onClick={() => removeEntry(index)}
                  disabled={disabled}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-sm btn-outline-primary mt-2"
            onClick={addEntry}
            disabled={disabled}
          >
            + Add Patient
          </button>
        </div>
      )}
    </>
  );
}

export default PatientOrderSection;
