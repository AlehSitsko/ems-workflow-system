const API_BASE_URL = "http://127.0.0.1:5050";

// Fetch all call records from the backend.
// Optional filters are sent as query parameters.
export async function getCalls(filters = {}) {
  const params = new URLSearchParams();

  // Filter by the date when the call was received.
  if (filters.date_of_call) {
    params.append("date_of_call", filters.date_of_call);
  }

  const queryString = params.toString();

  const url = queryString
    ? `${API_BASE_URL}/api/calls?${queryString}`
    : `${API_BASE_URL}/api/calls`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch calls");
  }

  return data;
}

// Create a new call record in the backend database.
export async function createCall(callData) {
  const response = await fetch(`${API_BASE_URL}/api/calls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(callData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create call");
  }

  return data;
}

// Fetch all call records linked to a specific patient.
export async function getPatientCalls(patientId) {
  const response = await fetch(`${API_BASE_URL}/api/patient/${patientId}/calls`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch patient call history");
  }

  return data;
}