import { FaArchive, FaTrashRestore, FaExclamationTriangle, FaEdit } from "react-icons/fa";

import DetailItem from "./DetailItem";
import { SEVERITY_COLOR } from "./patientConstants";

// Read-only overview of a patient: archive banner, active alerts, dispatch
// note, and the detail grid. Extracted from PatientsPage.jsx (decomposition
// phase 3). Presentational — all actions are passed in as handlers.
const PatientOverviewTab = ({
  selectedPatient,
  patientAlerts,
  onRestore,
  onEdit,
  onArchive,
}) => {
  const activeAlerts = patientAlerts.filter((a) => a.status === "active");

  return (
    <div>
      {selectedPatient.is_archived && (
        <div className="alert alert-secondary d-flex justify-content-between align-items-center mb-3">
          <span>
            <FaArchive style={{ marginRight: 6 }} />
            Archived{selectedPatient.archived_at ? ` on ${selectedPatient.archived_at.slice(0, 10)}` : ""}
            {selectedPatient.archived_reason ? ` — ${selectedPatient.archived_reason}` : ""}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-success"
            onClick={() => onRestore(selectedPatient.id)}
          >
            <FaTrashRestore style={{ marginRight: 4 }} /> Restore
          </button>
        </div>
      )}

      {activeAlerts.length > 0 && (
        <div className="mb-3 d-flex flex-wrap gap-2">
          {activeAlerts.map((a) => (
            <span
              key={a.id}
              className="badge"
              style={{ background: `${SEVERITY_COLOR[a.severity]}20`, color: SEVERITY_COLOR[a.severity], border: `1px solid ${SEVERITY_COLOR[a.severity]}50`, fontSize: 12, padding: "6px 10px" }}
            >
              <FaExclamationTriangle style={{ marginRight: 4 }} />
              {a.title}
            </span>
          ))}
        </div>
      )}

      {selectedPatient.dispatch_comment && (
        <div className="alert alert-info mb-3">
          <strong>Dispatch note:</strong> {selectedPatient.dispatch_comment}
        </div>
      )}

      <div className="patient-detail-grid">
        <DetailItem label="Name" value={`${selectedPatient.first_name || ""} ${selectedPatient.last_name || ""}`.trim()} />
        <DetailItem label="DOB" value={selectedPatient.dob} />
        <DetailItem label="Gender" value={selectedPatient.gender} />
        <DetailItem label="Phone" value={selectedPatient.phone} />
        <DetailItem label="Secondary Phone" value={selectedPatient.secondary_phone} />
        <DetailItem label="Address" value={`${selectedPatient.address || ""}, ${selectedPatient.city || ""} ${selectedPatient.state || ""} ${selectedPatient.zip_code || ""}`.trim()} />
        <DetailItem label="Insurance" value={selectedPatient.insurance} />
        <DetailItem label="Member ID" value={selectedPatient.member_id} />
        <DetailItem label="Policy Number" value={selectedPatient.policy_number} />
        <DetailItem label="Requires Auth" value={selectedPatient.requires_auth ? "Yes" : "No"} />
        <DetailItem label="Copay Required" value={selectedPatient.copay_required ? "Yes" : "No"} />
        <DetailItem label="Default Service" value={selectedPatient.default_service_level} />
        <DetailItem label="Default Mobility" value={selectedPatient.default_mobility_level} />
        <DetailItem label="Weight" value={selectedPatient.weight} />
        <DetailItem label="Oxygen Required" value={selectedPatient.oxygen_required ? "Yes" : "No"} />
        <DetailItem label="Stairs" value={selectedPatient.stairs ? "Yes" : "No"} />
        <DetailItem label="Preferred Language" value={selectedPatient.preferred_language} />
        <DetailItem label="Requires Interpreter" value={selectedPatient.requires_interpreter ? "Yes" : "No"} />
        <DetailItem label="Facility" value={selectedPatient.facility_name} />
        <DetailItem label="Room" value={selectedPatient.room_number} />
        <DetailItem label="Emergency Contact" value={`${selectedPatient.emergency_contact_name || ""} ${selectedPatient.emergency_contact_phone || ""}`.trim()} />
        <DetailItem label="Transport Instructions" value={selectedPatient.transport_instructions} />
        <DetailItem label="Access Instructions" value={selectedPatient.access_instructions} />
        <DetailItem label="Notes" value={selectedPatient.notes} />
        <div style={{ gridColumn: "1 / -1", marginTop: 8, display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn-sm btn-outline-warning"
            onClick={() => onEdit(selectedPatient)}
          >
            <FaEdit style={{ marginRight: 4 }} /> Edit Patient
          </button>
          {!selectedPatient.is_archived && (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => onArchive(selectedPatient.id)}
            >
              <FaArchive style={{ marginRight: 4 }} /> Archive
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PatientOverviewTab;
