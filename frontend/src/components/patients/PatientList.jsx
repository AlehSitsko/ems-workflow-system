import { FaUserSecret, FaTrashRestore, FaEdit, FaArchive } from "react-icons/fa";

// Patient result list: summary badges, one card per patient (with the inline
// default-service select), and the "Load more" pager. Extracted from
// PatientsPage.jsx (decomposition phase 3). Presentational — all actions are
// passed in as handlers.
const PatientList = ({
  patients,
  paginationMeta,
  patientCalls,
  selectedPatient,
  loading,
  loadingMore,
  onSelectPatient,
  onEditPatient,
  onArchivePatient,
  onRestorePatient,
  onServiceLevelChange,
  onLoadMore,
}) => {
  const badges = [
    { label: "Total", value: paginationMeta.total || patients.length, color: "#0d6efd" },
    { label: "Loaded", value: patients.length, color: "#198754" },
    ...(patientCalls.length > 0 ? [{ label: "Calls", value: patientCalls.length, color: "#6f42c1" }] : []),
  ];

  return (
    <section className="content-panel">
      <div className="content-panel-header">
        <div>
          <h4>Patient List</h4>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {badges.map(s => (
              <span key={s.label} style={{
                fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
                background: `${s.color}14`, color: s.color, border: `1px solid ${s.color}30`,
              }}>
                {s.label}: {s.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="patient-list">
        {patients.map((patient) => {
          const isSelected = selectedPatient?.id === patient.id;

          return (
            <div
              className={`patient-list-card ${isSelected ? "selected" : ""}`}
              key={patient.id}
              style={{ cursor: "pointer", opacity: patient.is_archived ? 0.6 : 1 }}
              onClick={() => onSelectPatient(patient)}
            >
              {/* Name + avatar */}
              <div className="patient-list-main">
                <div className="patient-list-avatar">
                  {(patient.first_name?.[0] || "P").toUpperCase()}
                </div>
                <div>
                  <div className="patient-list-name d-flex align-items-center gap-2">
                    {patient.first_name} {patient.last_name}
                    {patient.is_sensitive && <FaUserSecret title="Sensitive patient" style={{ color: "#f59e0b", fontSize: 12 }} />}
                    {patient.is_archived && <span className="badge text-bg-secondary" style={{ fontSize: 10 }}>Archived</span>}
                  </div>
                  <div className="patient-list-muted" style={{ fontSize: 11 }}>
                    {patient.dob || "No DOB"}
                  </div>
                </div>
              </div>

              {/* Phone */}
              <div>
                <div className="compact-call-label">Phone</div>
                <div style={{ fontSize: 13, color: "var(--ems-text-primary)" }}>{patient.phone || "—"}</div>
                {patient.secondary_phone && (
                  <div style={{ fontSize: 11, color: "var(--ems-text-muted)" }}>{patient.secondary_phone}</div>
                )}
              </div>

              {/* Insurance */}
              <div>
                <div className="compact-call-label">Insurance</div>
                <div style={{ fontSize: 12, color: "var(--ems-text-secondary)" }}>{patient.insurance || "—"}</div>
              </div>

              {/* Home address */}
              <div>
                <div className="compact-call-label">Home Address</div>
                <div style={{ fontSize: 12, color: "var(--ems-text-secondary)" }}>
                  {patient.address
                    ? <>
                        {patient.address}
                        {(patient.city || patient.state) && (
                          <span style={{ color: "var(--ems-text-muted)" }}>
                            {", "}{[patient.city, patient.state].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </>
                    : "—"}
                </div>
              </div>

              {/* Default service — inline select */}
              <div onClick={e => e.stopPropagation()}>
                <div className="compact-call-label">Default Service</div>
                <select
                  className="form-select form-select-sm"
                  style={{ fontSize: 11, padding: "2px 6px", width: 120, borderRadius: 6 }}
                  value={patient.default_service_level || ""}
                  onChange={(e) => onServiceLevelChange(patient, e.target.value)}
                >
                  <option value="">— Not set —</option>
                  <option value="bls">BLS</option>
                  <option value="als">ALS</option>
                  <option value="emergency">Emergency</option>
                  <option value="stretcher">Stretcher</option>
                  <option value="wheelchair">Wheelchair</option>
                </select>
              </div>

              {/* Actions */}
              <div className="patient-list-actions" onClick={(e) => e.stopPropagation()}>
                {patient.is_archived ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1"
                    onClick={() => onRestorePatient(patient.id)}
                    disabled={loading}
                  >
                    <FaTrashRestore /> Restore
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-warning d-inline-flex align-items-center gap-1"
                      onClick={() => onEditPatient(patient)}
                      disabled={loading}
                    >
                      <FaEdit /> Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
                      onClick={() => onArchivePatient(patient.id)}
                      disabled={loading}
                    >
                      <FaArchive /> Archive
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {patients.length < paginationMeta.total && (
        <div className="text-center mt-3">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : `Load more (${patients.length} of ${paginationMeta.total})`}
          </button>
        </div>
      )}
    </section>
  );
};

export default PatientList;
