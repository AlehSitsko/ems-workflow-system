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

  if (!response.ok) {
    throw new Error("Failed to create patient");
  }

  return response.json();
}