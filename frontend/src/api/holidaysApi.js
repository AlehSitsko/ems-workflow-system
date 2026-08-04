import API_BASE from "./config.js";

const BASE = `${API_BASE}/api/holidays`;

async function handle(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || fallback);
  return data;
}

// Company-observed holidays for the org (any staff role may read).
export async function listHolidays() {
  return handle(await fetch(BASE, { credentials: "include" }), "Failed to load holidays");
}

export async function createHoliday(date, name) {
  return handle(
    await fetch(BASE, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name }),
    }),
    "Failed to add the holiday",
  );
}

export async function deleteHoliday(id) {
  return handle(await fetch(`${BASE}/${id}`, { method: "DELETE", credentials: "include" }),
                "Failed to delete the holiday");
}
