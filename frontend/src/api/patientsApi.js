import API_BASE from "./config.js";
const API_BASE_URL = API_BASE;

// Normalize text values before comparing patient records.
// This helps avoid duplicates caused by different capitalization or extra spaces.
function normalizePatientText(value) {
  return String(value || "").trim().toLowerCase();
}

// Returns { items, total, page, per_page, pages }
export async function getPatients(filters = {}, page = 1, per_page = 25) {
  const params = new URLSearchParams();

  if (filters.name) params.append("name", filters.name);
  if (filters.dob) params.append("dob", filters.dob);
  if (filters.showArchived) params.append("show_archived", "1");
  params.append("page", page);
  params.append("per_page", per_page);

  const response = await fetch(`${API_BASE_URL}/api/patients?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch patients");
  }

  return response.json();
}

// Find an existing patient before creating a new one.
// MVP duplicate rule:
// first name + last name + DOB must match exactly after normalization.
export async function findDuplicatePatient(patientData) {
  const firstName = normalizePatientText(patientData.first_name);
  const lastName = normalizePatientText(patientData.last_name);
  const dob = String(patientData.dob || "").trim();

  if (!firstName || !lastName || !dob) {
    return null;
  }

  const result = await getPatients({ name: patientData.last_name, dob }, 1, 100);

  return (
    result.items.find((patient) => {
      const existingFirstName = normalizePatientText(patient.first_name);
      const existingLastName = normalizePatientText(patient.last_name);
      const existingDob = String(patient.dob || "").trim();

      return (
        existingFirstName === firstName &&
        existingLastName === lastName &&
        existingDob === dob
      );
    }) || null
  );
}

// Fetch a single patient record by ID.
export async function getPatient(id) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}`);

  if (!response.ok) {
    throw new Error("Failed to fetch patient");
  }

  return response.json();
}

// Create a new patient record in the backend database.
// On a 409 duplicate conflict, the thrown error carries `existingPatient` so the
// caller can offer "Restore existing patient" when that record is archived.
export async function createPatient(patientData) {
  const response = await fetch(`${API_BASE_URL}/api/patients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patientData),
  });

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(data.error || "Failed to create patient");
    err.existingPatient = data.existing_patient || null;
    err.status = response.status;
    throw err;
  }

  return data;
}

// Update an existing patient record in the backend database.
export async function updatePatient(id, patientData) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patientData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to update patient");
  }

  return data;
}

// Archive a patient (soft delete — call history keeps a valid reference).
export async function archivePatient(id, reason = "") {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to archive patient");
  }

  return data;
}

// Restore a previously archived patient.
export async function restorePatient(id) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}/restore`, {
    method: "POST",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to restore patient");
  }

  return data;
}

// Prefill a new call from a patient's most recent trip (pickup/dropoff/service level only).
export async function getLastTripTemplate(id) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}/last-trip-template`);

  if (!response.ok) {
    throw new Error("Failed to fetch last trip template");
  }

  return response.json();
}

// ── Patient alerts ───────────────────────────────────────────────────────────

export async function getPatientAlerts(id, { showAll = false } = {}) {
  const qs = showAll ? "?show_all=1" : "";
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}/alerts${qs}`);

  if (!response.ok) {
    throw new Error("Failed to fetch patient alerts");
  }

  return response.json();
}

export async function createPatientAlert(id, alertData) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(alertData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create alert");
  }

  return data;
}

export async function updatePatientAlert(id, alertId, alertData) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}/alerts/${alertId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(alertData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to update alert");
  }

  return data;
}

export async function resolvePatientAlert(id, alertId, reason = "") {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}/alerts/${alertId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to resolve alert");
  }

  return data;
}

// ── Patient contacts ─────────────────────────────────────────────────────────

export async function getPatientContacts(id) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}/contacts`);

  if (!response.ok) {
    throw new Error("Failed to fetch patient contacts");
  }

  return response.json();
}

export async function createPatientContact(id, contactData) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contactData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create contact");
  }

  return data;
}

export async function updatePatientContact(id, contactId, contactData) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}/contacts/${contactId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contactData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to update contact");
  }

  return data;
}

export async function deletePatientContact(id, contactId) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}/contacts/${contactId}`, {
    method: "DELETE",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete contact");
  }

  return data;
}