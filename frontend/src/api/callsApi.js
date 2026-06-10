const API_BASE_URL = "http://127.0.0.1:5050";

// Fetch all call records from the backend.
// Optional filters are sent as query parameters.
export async function getCalls(filters = {}) {
  const params = new URLSearchParams();

  // Filter by the date when the call was received.
  if (filters.date_of_call) {
    params.append("date_of_call", filters.date_of_call);
  }

  // Filter by dispatcher name.
  if (filters.dispatcher_name) {
    params.append("dispatcher_name", filters.dispatcher_name);
  }

  // Filter by minimum quality score.
  if (filters.min_quality_score) {
    params.append("min_quality_score", filters.min_quality_score);
  }

  // Filter by maximum quality score.
  if (filters.max_quality_score) {
    params.append("max_quality_score", filters.max_quality_score);
  }

  // Filter by call lifecycle status.
  if (filters.status) {
    params.append("status", filters.status);
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