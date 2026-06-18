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

// Create a new patient record in the backend database.
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
    throw new Error(data.error || "Failed to create patient");
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

// Delete an existing patient record from the backend database.
export async function deletePatient(id) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${id}`, {
    method: "DELETE",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete patient");
  }

  return data;
}