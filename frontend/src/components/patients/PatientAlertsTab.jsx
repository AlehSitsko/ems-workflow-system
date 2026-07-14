import { FaExclamationTriangle, FaPlus } from "react-icons/fa";

import { ALERT_CATEGORIES, ALERT_SEVERITIES, SEVERITY_COLOR } from "./patientConstants";

// Alerts tab: add-alert form plus the alert list with a show-resolved toggle.
// Extracted from PatientsPage.jsx (decomposition phase 3). Presentational — all
// state and handlers come from the usePatientAlerts hook via props.
const PatientAlertsTab = ({
  newAlert,
  setNewAlert,
  onAddAlert,
  showResolvedAlerts,
  setShowResolvedAlerts,
  patientAlerts,
  onResolveAlert,
}) => {
  const visible = showResolvedAlerts ? patientAlerts : patientAlerts.filter((a) => a.status !== "resolved");

  return (
    <div>
      <form onSubmit={onAddAlert} className="mb-4 patient-form-section">
        <div className="patient-form-section-header">
          <span className="patient-form-section-icon"><FaExclamationTriangle /></span>
          <h5>Add Alert</h5>
        </div>
        <div className="row g-3">
          <div className="col-md-3">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={newAlert.category}
              onChange={(e) => setNewAlert(p => ({ ...p, category: e.target.value }))}
            >
              {ALERT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Severity</label>
            <select
              className="form-select"
              value={newAlert.severity}
              onChange={(e) => setNewAlert(p => ({ ...p, severity: e.target.value }))}
            >
              {ALERT_SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Title *</label>
            <input
              className="form-control"
              value={newAlert.title}
              onChange={(e) => setNewAlert(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Requires stretcher"
              required
            />
          </div>
          <div className="col-md-8">
            <label className="form-label">Description</label>
            <input
              className="form-control"
              value={newAlert.description}
              onChange={(e) => setNewAlert(p => ({ ...p, description: e.target.value }))}
              placeholder="Optional details"
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Expires</label>
            <input
              type="date"
              className="form-control"
              value={newAlert.expires_at}
              onChange={(e) => setNewAlert(p => ({ ...p, expires_at: e.target.value }))}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-sm btn-primary mt-3">
          <FaPlus style={{ marginRight: 4 }} /> Add Alert
        </button>
      </form>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <h5 className="mb-0">Alerts</h5>
        <div className="form-check form-switch mb-0">
          <input
            type="checkbox"
            className="form-check-input"
            role="switch"
            id="show-resolved-alerts"
            checked={showResolvedAlerts}
            onChange={(e) => setShowResolvedAlerts(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="show-resolved-alerts" style={{ fontSize: 13 }}>
            Show resolved
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <FaExclamationTriangle />
          <h5>No alerts</h5>
          <p>No active alerts for this patient.</p>
        </div>
      ) : (
        <div className="patient-call-list">
          {visible.map((a) => (
            <div className="patient-call-card" key={a.id}>
              <div>
                <span
                  className="badge"
                  style={{ background: `${SEVERITY_COLOR[a.severity]}20`, color: SEVERITY_COLOR[a.severity], border: `1px solid ${SEVERITY_COLOR[a.severity]}50` }}
                >
                  {a.severity}
                </span>
                <div className="patient-call-muted" style={{ marginTop: 4 }}>{a.category} · {a.status}</div>
              </div>
              <div>
                <div className="patient-call-label">Title</div>
                <div>{a.title}</div>
              </div>
              <div>
                <div className="patient-call-label">Description</div>
                <div>{a.description || "—"}</div>
              </div>
              <div>
                <div className="patient-call-label">Expires</div>
                <div>{a.expires_at || "No expiration"}</div>
              </div>
              {a.status === "active" && (
                <div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => onResolveAlert(a.id)}
                  >
                    Resolve
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PatientAlertsTab;
