const API_BASE = "http://127.0.0.1:5050";

function authHeaders(currentUser) {
  return {
    "X-User-Role": currentUser?.role || "",
    "X-User-Id": String(currentUser?.id || ""),
  };
}

export async function getDocuments(employeeId, currentUser) {
  const res = await fetch(`${API_BASE}/api/employees/${employeeId}/documents`, {
    headers: authHeaders(currentUser),
  });
  if (!res.ok) throw new Error("Failed to load documents");
  return res.json();
}

export async function uploadDocument(employeeId, formData, currentUser) {
  const res = await fetch(`${API_BASE}/api/employees/${employeeId}/documents`, {
    method: "POST",
    headers: authHeaders(currentUser),
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to upload document");
  return data;
}

export async function updateDocument(docId, updates, currentUser) {
  const res = await fetch(`${API_BASE}/api/documents/${docId}`, {
    method: "PATCH",
    headers: { ...authHeaders(currentUser), "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update document");
  return data;
}

export async function deleteDocument(docId, currentUser) {
  const res = await fetch(`${API_BASE}/api/documents/${docId}`, {
    method: "DELETE",
    headers: authHeaders(currentUser),
  });
  if (!res.ok) throw new Error("Failed to delete document");
  return res.json();
}

export async function fetchDocumentBlob(docId, currentUser) {
  const res = await fetch(`${API_BASE}/api/documents/${docId}/file`, {
    headers: authHeaders(currentUser),
  });
  if (!res.ok) throw new Error("Failed to fetch file");
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), mimeType: blob.type };
}

export async function getComplianceSummary(currentUser) {
  const res = await fetch(`${API_BASE}/api/documents/compliance`, {
    headers: authHeaders(currentUser),
  });
  if (!res.ok) throw new Error("Failed to load compliance summary");
  return res.json();
}
