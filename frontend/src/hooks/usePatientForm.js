import { useRef, useState } from "react";

import { emptyPatient } from "../components/patients/patientConstants";

// Map a patient record from the API onto the flat form shape, coercing nulls to
// the empty-string / false defaults the inputs expect. Same field list the page
// has always used for edit mode.
function patientToForm(patient) {
  return {
    first_name: patient.first_name || "",
    last_name: patient.last_name || "",
    dob: patient.dob || "",
    gender: patient.gender || "",
    phone: patient.phone || "",
    secondary_phone: patient.secondary_phone || "",
    address: patient.address || "",
    city: patient.city || "",
    state: patient.state || "",
    zip_code: patient.zip_code || "",
    insurance: patient.insurance || "",
    member_id: patient.member_id || "",
    policy_number: patient.policy_number || "",
    requires_auth: patient.requires_auth || false,
    copay_required: patient.copay_required || false,
    insurance_notes: patient.insurance_notes || "",
    default_service_level: patient.default_service_level || "",
    weight: patient.weight || "",
    oxygen_required: patient.oxygen_required || false,
    stairs: patient.stairs || false,
    special_equipment_notes: patient.special_equipment_notes || "",
    facility_name: patient.facility_name || "",
    room_number: patient.room_number || "",
    emergency_contact_name: patient.emergency_contact_name || "",
    emergency_contact_phone: patient.emergency_contact_phone || "",
    notes: patient.notes || "",
    dispatch_comment: patient.dispatch_comment || "",
    default_mobility_level: patient.default_mobility_level || "",
    transport_instructions: patient.transport_instructions || "",
    access_instructions: patient.access_instructions || "",
    preferred_language: patient.preferred_language || "",
    requires_interpreter: patient.requires_interpreter || false,
    is_sensitive: patient.is_sensitive || false,
  };
}

// Add/edit patient form-field slice of PatientsPage (decomposition phase 2c).
// Owns only the form values, the edit-target id, and the baseline snapshot used
// for dirty detection — no orchestration. The page keeps create/edit/select/
// reset wiring (which coordinate the list, drawer, calls, alerts and contacts)
// and drive this hook's helpers. Behavior is unchanged.
export function usePatientForm() {
  const [newPatient, setNewPatient] = useState(emptyPatient);
  const [editingPatientId, setEditingPatientId] = useState(null);
  // Snapshot of the form's values when the drawer was opened, used to detect real
  // edits (comparing against emptyPatient would falsely flag an untouched existing
  // patient as dirty).
  const formBaselineRef = useRef(emptyPatient);

  const handleNewPatientChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewPatient((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const isPatientFormDirty = () => {
    const baseline = formBaselineRef.current;
    return Object.keys(emptyPatient).some((key) => newPatient[key] !== baseline[key]);
  };

  // Reset to a blank create form.
  const resetFormFields = () => {
    setNewPatient(emptyPatient);
    formBaselineRef.current = emptyPatient;
    setEditingPatientId(null);
  };

  // Load an existing patient's values into the form (edit mode) and mark it as
  // the current baseline so an untouched form isn't treated as dirty.
  const loadPatientIntoForm = (patient) => {
    const loaded = patientToForm(patient);
    setNewPatient(loaded);
    formBaselineRef.current = loaded;
    setEditingPatientId(patient.id);
  };

  return {
    newPatient,
    setNewPatient,
    editingPatientId,
    setEditingPatientId,
    formBaselineRef,
    handleNewPatientChange,
    isPatientFormDirty,
    resetFormFields,
    loadPatientIntoForm,
  };
}
