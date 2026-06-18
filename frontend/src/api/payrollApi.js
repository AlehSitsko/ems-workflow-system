import API_BASE from "./config.js";
const BASE = `${API_BASE}/api/payroll`;

async function req(url, opts = {}) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const getPeriods = () => req(`${BASE}/periods`);

export const createPeriod = (data) =>
  req(`${BASE}/periods`, { method: "POST", body: JSON.stringify(data) });

export const deletePeriod = (id) =>
  req(`${BASE}/periods/${id}`, { method: "DELETE" });

export const updatePeriod = (id, data) =>
  req(`${BASE}/periods/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const updatePeriodStatus = (id, status, exported_to) =>
  req(`${BASE}/periods/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, exported_to }),
  });

export const getPeriodSummary = (id) => req(`${BASE}/periods/${id}/summary`);

export const exportPayroll = (periodId, format) => {
  const url = `${BASE}/export?period_id=${periodId}&format=${format}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
