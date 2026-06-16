const API_BASE_URL = "http://127.0.0.1:5050";

// Fetch all call records from the backend.
// Optional filters are sent as query parameters.
// Returns { items, total, page, per_page, pages }
export async function getCalls(filters = {}, page = 1, per_page = 25) {
  const params = new URLSearchParams();

  if (filters.date_of_call) params.append("date_of_call", filters.date_of_call);
  if (filters.dispatcher_name) params.append("dispatcher_name", filters.dispatcher_name);
  if (filters.min_quality_score) params.append("min_quality_score", filters.min_quality_score);
  if (filters.max_quality_score) params.append("max_quality_score", filters.max_quality_score);
  if (filters.status) params.append("status", filters.status);
  params.append("page", page);
  params.append("per_page", per_page);

  const response = await fetch(`${API_BASE_URL}/api/calls?${params.toString()}`);
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
  const response = await fetch(
    `${API_BASE_URL}/api/patient/${patientId}/calls`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch patient call history");
  }

  return data;
}

// Fetch dispatcher analytics for supervisor reporting.
export async function getDispatcherAnalytics() {
  const response = await fetch(`${API_BASE_URL}/api/analytics/dispatchers`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch dispatcher analytics");
  }

  return data;
}