import API_BASE from "./config.js";

export async function getAuditLog(params = {}, headers = {}) {
  const qs = new URLSearchParams();
  if (params.entity_type) qs.set("entity_type", params.entity_type);
  if (params.entity_id)   qs.set("entity_id",   params.entity_id);
  if (params.action)      qs.set("action",       params.action);
  if (params.date_from)   qs.set("date_from",    params.date_from);
  if (params.date_to)     qs.set("date_to",      params.date_to);
  if (params.page)        qs.set("page",         params.page);
  if (params.per_page)    qs.set("per_page",     params.per_page);

  const res = await fetch(`${API_BASE}/api/audit?${qs}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load audit log");
  return data;
}
