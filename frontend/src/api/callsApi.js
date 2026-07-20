import API_BASE from "./config.js";
const API_BASE_URL = API_BASE;

// Fetch all call records from the backend.
// Optional filters are sent as query parameters.
// Returns { items, total, page, per_page, pages }
export async function getCalls(filters = {}, page = 1, per_page = 25) {
  const params = new URLSearchParams();

  if (filters.date_of_call) params.append("date_of_call", filters.date_of_call);
  if (filters.trip_date) params.append("trip_date", filters.trip_date);
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

export async function updateCall(callId, callData, headers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/calls/${callId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(callData),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to update call");
  return data;
}

export async function cancelCall(callId, cancelReason, headers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/calls/${callId}/cancel`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ cancel_reason: cancelReason }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to cancel call");
  return data;
}

export async function uncancelCall(callId, headers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/calls/${callId}/uncancel`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to uncancel call");
  return data;
}

// One call with its patient label — backs the call detail page.
export async function getCall(callId, headers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/calls/${callId}`, { headers });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Failed to load call");
    error.status = response.status;
    throw error;
  }
  return data;
}

// Record the outcome of a confirmation call. A "declined" outcome cancels the
// call server-side and says so in the response.
export async function setCallConfirmation(callId, status, note = "", headers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/calls/${callId}/confirmation`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ confirmation_status: status, confirmation_note: note }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to record the confirmation");
  return data;
}

// One day's trips as a call list, with a tally of what is left to ring.
export async function getConfirmationRound(dateIso, headers = {}) {
  const response = await fetch(
    `${API_BASE_URL}/api/calls/confirmation-round?date=${encodeURIComponent(dateIso)}`,
    { headers },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load the confirmation round");
  return data;
}

// The scheduling inbox: calls taken without a trip date. They appear on no
// board and in no calendar until they get one, which is the point of the queue.
export async function getUnscheduledCalls(headers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/calls/unscheduled`, { headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load the scheduling inbox");
  return data;
}

// Give an inbox call its trip date (and optionally a pickup time).
export async function scheduleCall(callId, tripDate, pickupTime = "", headers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/calls/${callId}/schedule`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ trip_date: tripDate, pickup_time: pickupTime }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to schedule call");
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