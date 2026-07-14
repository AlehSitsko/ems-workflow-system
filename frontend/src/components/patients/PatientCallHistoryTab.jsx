import { FaHistory } from "react-icons/fa";

import { formatTimeForDisplay } from "../../utils/timeUtils";

// Call history list for the selected patient. Extracted from PatientsPage.jsx
// (decomposition phase 3). Presentational.
const PatientCallHistoryTab = ({ patientCalls, timeFormat }) => {
  if (patientCalls.length === 0) {
    return (
      <div className="empty-state">
        <FaHistory />
        <h5>No calls found</h5>
        <p>No call records are currently linked to this patient.</p>
      </div>
    );
  }

  return (
    <div className="patient-call-list">
      {patientCalls.map((call) => (
        <div className="patient-call-card" key={call.id}>
          <div>
            <div className="patient-call-date">{call.date_of_call || "—"}</div>
            <div className="patient-call-muted">Trip: {call.trip_date || "—"} {call.pickup_time ? `at ${formatTimeForDisplay(call.pickup_time, timeFormat)}` : ""}</div>
          </div>
          <div>
            <div className="patient-call-label">Route</div>
            <div>{call.pickup_address || "—"} → {call.dropoff_address || "—"}</div>
          </div>
          <div>
            <div className="patient-call-label">Service</div>
            <div>{call.service_level || "—"}</div>
          </div>
          <div>
            <div className="patient-call-label">Notes</div>
            <div>{call.notes || "—"}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PatientCallHistoryTab;
