// A titled section wrapper (icon + heading + children) used throughout the
// patient create/edit form — extracted from PatientsPage.jsx (decomposition
// phase 1). Presentational only.
const PatientFormSection = ({ title, icon: Icon, children }) => (
  <div className="patient-form-section">
    <div className="patient-form-section-header">
      <span className="patient-form-section-icon">
        <Icon />
      </span>

      <h5>{title}</h5>
    </div>

    {children}
  </div>
);

export default PatientFormSection;
