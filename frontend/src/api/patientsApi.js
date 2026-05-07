const API_BASE_URL = "http://127.0.0.1:5050";

// Fetch patients from the backend.
// Optional filters are sent as query parameters.
export async function getPatients(filters = {}) {
  const params = new URLSearchParams();

  if (filters.name) {
    params.append("name", filters.name);
  }

  if (filters.dob) {
    params.append("dob", filters.dob);
  }

  const queryString = params.toString();

  const url = queryString
    ? `${API_BASE_URL}/api/patients?${queryString}`
    : `${API_BASE_URL}/api/patients`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch patients");
  }

  return response.json();
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