// Shared constants for the Patients feature — extracted from PatientsPage.jsx
// (decomposition phase 1). No behavior change: these are the same templates and
// enums the page has always used.

// Empty patient template used for create, reset, and cancel edit.
export const emptyPatient = {
  first_name: "",
  last_name: "",
  dob: "",
  gender: "",

  phone: "",
  secondary_phone: "",
  address: "",
  city: "",
  state: "",
  zip_code: "",

  insurance: "",
  member_id: "",
  policy_number: "",
  requires_auth: false,
  copay_required: false,
  insurance_notes: "",

  default_service_level: "",
  weight: "",
  oxygen_required: false,
  stairs: false,
  special_equipment_notes: "",

  facility_name: "",
  room_number: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",

  notes: "",

  dispatch_comment: "",
  default_mobility_level: "",
  transport_instructions: "",
  access_instructions: "",
  preferred_language: "",
  requires_interpreter: false,
  is_sensitive: false,
};

export const ALERT_CATEGORIES = ["transport", "safety", "contact", "facility", "billing", "equipment", "behavior", "language", "other"];
export const ALERT_SEVERITIES = ["info", "warning", "critical"];
export const SEVERITY_COLOR = { info: "#0d6efd", warning: "#f59e0b", critical: "#dc3545" };

export const emptyAlert = { category: "transport", severity: "warning", title: "", description: "", expires_at: "" };
export const emptyContact = { name: "", relationship: "", phone: "", email: "", is_primary: false, can_authorize_transport: false, notes: "" };
