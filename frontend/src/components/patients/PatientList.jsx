import { FaUserSecret, FaTrashRestore, FaEdit, FaArchive, FaExclamationTriangle } from "react-icons/fa";

import { PageSection } from "../ui/Page";
import StatusBadge from "../ui/StatusBadge";
import { LoadMore } from "../ui/Entity";
import { SERVICE_LEVELS, describeLevel } from "../../utils/taxonomy";

// Active-alert severity → badge tone. Highest severity is reported by the API.
const ALERT_TONE = { critical: "danger", warning: "warning", info: "info" };

// Patient result list: count badges, one card per patient (with the inline
// default-service select), and the "Load more" pager. Presentational — all
// actions are passed in as handlers.
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
  const total = paginationMeta.total || patients.length;

  return (
    <PageSection
      title="Patient List"
      actions={(
        <div className="stat-chip-row">
          <StatusBadge tone="info" label={`${total} total`} />
          <StatusBadge tone="success" label={`${patients.length} loaded`} />
          {patientCalls.length > 0 && (
            <StatusBadge tone="purple" label={`${patientCalls.length} calls`} />
          )}
        </div>
      )}
    >
      <div className="patient-list">
        {patients.map((patient) => {
          const isSelected = selectedPatient?.id === patient.id;
          // The stored value is canonical (BLS/ALS/…). Options are built from the
          // same canonical list, so the select displays what is stored instead of
          // silently falling back to "Not set" on a casing mismatch. A legacy or
          // unrecognised value is kept as its own option rather than hidden.
          const level = patient.default_service_level || "";
          const known = SERVICE_LEVELS.includes(level);

          return (
            <div
              className={`patient-list-card ${isSelected ? "selected" : ""} ${patient.is_archived ? "is-archived" : ""}`}
              key={patient.id}
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
                    {patient.is_sensitive && (
                      <FaUserSecret title="Sensitive patient" className="patient-list-sensitive" />
                    )}
                    {patient.active_alert_count > 0 && (
                      <StatusBadge
                        tone={ALERT_TONE[patient.active_alert_severity] || "danger"}
                        icon={<FaExclamationTriangle />}
                        label={String(patient.active_alert_count)}
                        title={`${patient.active_alert_count} active alert${patient.active_alert_count === 1 ? "" : "s"} (${patient.active_alert_severity})`}
                      />
                    )}
                    {patient.is_archived && <StatusBadge tone="neutral" label="Archived" />}
                  </div>
                  <div className="patient-list-muted">{patient.dob || "No DOB"}</div>
                </div>
              </div>

              {/* Phone */}
              <div>
                <div className="compact-call-label">Phone</div>
                <div className="patient-list-value">{patient.phone || "—"}</div>
                {patient.secondary_phone && (
                  <div className="patient-list-muted">{patient.secondary_phone}</div>
                )}
              </div>

              {/* Insurance */}
              <div>
                <div className="compact-call-label">Insurance</div>
                <div className="patient-list-value-secondary">{patient.insurance || "—"}</div>
              </div>

              {/* Home address */}
              <div>
                <div className="compact-call-label">Home Address</div>
                <div className="patient-list-value-secondary">
                  {patient.address
                    ? <>
                        {patient.address}
                        {(patient.city || patient.state) && (
                          <span className="patient-list-muted">
                            {", "}{[patient.city, patient.state].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </>
                    : "—"}
                </div>
              </div>

              {/* Default service — inline select, options from the canonical taxonomy */}
              <div onClick={(e) => e.stopPropagation()}>
                <div className="compact-call-label">Default Service</div>
                <select
                  className="form-select form-select-sm patient-service-select"
                  value={level}
                  onChange={(e) => onServiceLevelChange(patient, e.target.value)}
                >
                  <option value="">— Not set —</option>
                  {SERVICE_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                  {level && !known && (
                    // Keep an unrecognised legacy value visible and selected
                    // rather than blanking it — bad data stays findable.
                    <option value={level}>{describeLevel(level).label}: {level}</option>
                  )}
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
                      className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
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

      <LoadMore
        loaded={patients.length}
        total={total}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
    </PageSection>
  );
};

export default PatientList;
