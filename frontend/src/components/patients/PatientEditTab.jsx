import {
  FaIdCard,
  FaAddressCard,
  FaFileMedical,
  FaAmbulance,
  FaEdit,
  FaUserSecret,
} from "react-icons/fa";

import PatientFormSection from "./PatientFormSection";
import { SERVICE_LEVELS } from "../../utils/taxonomy";

// The full create/edit patient form (drawer "Edit" tab). Extracted from
// PatientsPage.jsx (decomposition phase 3). Presentational — form field state,
// the change handler, and submit come from usePatientForm via props. The
// submit/cancel buttons live in the drawer footer, wired via form id below.
const PatientEditTab = ({ error, newPatient, onChange, onSubmit, loading }) => (
  <form id="patient-drawer-form" onSubmit={onSubmit}>
    {error && <div className="alert alert-danger">{error}</div>}
    <PatientFormSection title="Basic Information" icon={FaIdCard}>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label">First Name *</label>

          <input
            name="first_name"
            className="form-control"
            value={newPatient.first_name}
            onChange={onChange}
            disabled={loading}
            required
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">Last Name *</label>

          <input
            name="last_name"
            className="form-control"
            value={newPatient.last_name}
            onChange={onChange}
            disabled={loading}
            required
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">DOB</label>

          <input
            type="date"
            name="dob"
            className="form-control"
            value={newPatient.dob}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">Gender</label>

          <select
            name="gender"
            className="form-select"
            value={newPatient.gender}
            onChange={onChange}
            disabled={loading}
          >
            <option value="">Select</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
            <option value="Unknown">Unknown</option>
          </select>
        </div>
      </div>
    </PatientFormSection>

    <PatientFormSection title="Contact / Address" icon={FaAddressCard}>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label">Primary Phone</label>

          <input
            name="phone"
            className="form-control"
            value={newPatient.phone}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">Secondary Phone</label>

          <input
            name="secondary_phone"
            className="form-control"
            value={newPatient.secondary_phone}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-12">
          <label className="form-label">Street Address</label>

          <input
            name="address"
            className="form-control"
            value={newPatient.address}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-md-4">
          <label className="form-label">City</label>

          <input
            name="city"
            className="form-control"
            value={newPatient.city}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-md-4">
          <label className="form-label">State</label>

          <input
            name="state"
            className="form-control"
            value={newPatient.state}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-md-4">
          <label className="form-label">ZIP Code</label>

          <input
            name="zip_code"
            className="form-control"
            value={newPatient.zip_code}
            onChange={onChange}
            disabled={loading}
          />
        </div>
      </div>
    </PatientFormSection>

    <PatientFormSection title="Insurance" icon={FaFileMedical}>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label">Insurance Company</label>

          <input
            name="insurance"
            className="form-control"
            value={newPatient.insurance}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">Member ID</label>

          <input
            name="member_id"
            className="form-control"
            value={newPatient.member_id}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">Policy Number</label>

          <input
            name="policy_number"
            className="form-control"
            value={newPatient.policy_number}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-md-6 d-flex flex-column justify-content-end gap-2">
          <div className="form-check">
            <input
              type="checkbox"
              name="requires_auth"
              className="form-check-input"
              checked={newPatient.requires_auth}
              onChange={onChange}
              disabled={loading}
            />

            <label className="form-check-label">
              Requires Authorization
            </label>
          </div>

          <div className="form-check">
            <input
              type="checkbox"
              name="copay_required"
              className="form-check-input"
              checked={newPatient.copay_required}
              onChange={onChange}
              disabled={loading}
            />

            <label className="form-check-label">
              Copay Required
            </label>
          </div>
        </div>

        <div className="col-12">
          <label className="form-label">Insurance Notes</label>

          <textarea
            name="insurance_notes"
            className="form-control"
            value={newPatient.insurance_notes}
            onChange={onChange}
            disabled={loading}
          />
        </div>
      </div>
    </PatientFormSection>

    <PatientFormSection title="EMS Details" icon={FaAmbulance}>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label">Default Service Level</label>

          <select
            name="default_service_level"
            className="form-select"
            value={newPatient.default_service_level}
            onChange={onChange}
            disabled={loading}
          >
            <option value="">Select</option>
            {SERVICE_LEVELS.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
            {/* Preserve an unrecognised legacy value so editing the patient
                cannot silently blank it — it stays selectable until cleaned up. */}
            {newPatient.default_service_level
              && !SERVICE_LEVELS.includes(newPatient.default_service_level) && (
              <option value={newPatient.default_service_level}>
                {newPatient.default_service_level} (unrecognised)
              </option>
            )}
          </select>
          <div className="form-text">
            Default preference only — each call keeps its own service level.
          </div>
        </div>

        <div className="col-md-6">
          <label className="form-label">Weight</label>

          <input
            name="weight"
            className="form-control"
            value={newPatient.weight}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-12 d-flex flex-wrap gap-3">
          <div className="form-check">
            <input
              type="checkbox"
              name="oxygen_required"
              className="form-check-input"
              checked={newPatient.oxygen_required}
              onChange={onChange}
              disabled={loading}
            />

            <label className="form-check-label">
              Oxygen Required
            </label>
          </div>

          <div className="form-check">
            <input
              type="checkbox"
              name="stairs"
              className="form-check-input"
              checked={newPatient.stairs}
              onChange={onChange}
              disabled={loading}
            />

            <label className="form-check-label">Stairs</label>
          </div>
        </div>

        <div className="col-12">
          <label className="form-label">Special Equipment Notes</label>

          <textarea
            name="special_equipment_notes"
            className="form-control"
            value={newPatient.special_equipment_notes}
            onChange={onChange}
            disabled={loading}
          />
        </div>
      </div>
    </PatientFormSection>

    <PatientFormSection
      title="Facility / Emergency Contact"
      icon={FaAddressCard}
    >
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label">Facility Name</label>

          <input
            name="facility_name"
            className="form-control"
            value={newPatient.facility_name}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">Room Number</label>

          <input
            name="room_number"
            className="form-control"
            value={newPatient.room_number}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">
            Emergency Contact Name
          </label>

          <input
            name="emergency_contact_name"
            className="form-control"
            value={newPatient.emergency_contact_name}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">
            Emergency Contact Phone
          </label>

          <input
            name="emergency_contact_phone"
            className="form-control"
            value={newPatient.emergency_contact_phone}
            onChange={onChange}
            disabled={loading}
          />
        </div>
      </div>
    </PatientFormSection>

    <PatientFormSection title="Dispatch & Transport" icon={FaAmbulance}>
      <div className="row g-3">
        <div className="col-12">
          <label className="form-label">Dispatch Note</label>
          <textarea
            name="dispatch_comment"
            className="form-control"
            value={newPatient.dispatch_comment}
            onChange={onChange}
            disabled={loading}
            placeholder="Short, practical note for dispatch — e.g. 'Call daughter before pickup. Use side entrance.'"
            rows={2}
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">Default Mobility Level</label>
          <input
            name="default_mobility_level"
            className="form-control"
            value={newPatient.default_mobility_level}
            onChange={onChange}
            disabled={loading}
            placeholder="Ambulatory, Wheelchair, Stretcher..."
          />
        </div>

        <div className="col-md-6">
          <label className="form-label">Preferred Language</label>
          <input
            name="preferred_language"
            className="form-control"
            value={newPatient.preferred_language}
            onChange={onChange}
            disabled={loading}
          />
        </div>

        <div className="col-12">
          <label className="form-label">Transport Instructions</label>
          <textarea
            name="transport_instructions"
            className="form-control"
            value={newPatient.transport_instructions}
            onChange={onChange}
            disabled={loading}
            rows={2}
          />
        </div>

        <div className="col-12">
          <label className="form-label">Access Instructions</label>
          <textarea
            name="access_instructions"
            className="form-control"
            value={newPatient.access_instructions}
            onChange={onChange}
            disabled={loading}
            placeholder="Gate code, elevator status, parking..."
            rows={2}
          />
        </div>

        <div className="col-md-6">
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id="requires_interpreter"
              name="requires_interpreter"
              checked={newPatient.requires_interpreter}
              onChange={onChange}
              disabled={loading}
            />
            <label className="form-check-label" htmlFor="requires_interpreter">Requires interpreter</label>
          </div>
        </div>

        <div className="col-md-6">
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id="is_sensitive"
              name="is_sensitive"
              checked={newPatient.is_sensitive}
              onChange={onChange}
              disabled={loading}
            />
            <label className="form-check-label" htmlFor="is_sensitive">
              <FaUserSecret style={{ marginRight: 4 }} />
              Sensitive patient
            </label>
          </div>
        </div>
      </div>
    </PatientFormSection>

    <PatientFormSection title="General Notes" icon={FaEdit}>
      <textarea
        name="notes"
        className="form-control"
        value={newPatient.notes}
        onChange={onChange}
        disabled={loading}
      />
    </PatientFormSection>
  </form>
);

export default PatientEditTab;
