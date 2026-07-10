// A labelled read-only value cell in the patient overview — extracted from
// PatientsPage.jsx (decomposition phase 1). Presentational only.
const DetailItem = ({ label, value }) => (
  <div className="patient-detail-item">
    <div className="patient-detail-label">{label}</div>
    <div className="patient-detail-value">{value || "—"}</div>
  </div>
);

export default DetailItem;
