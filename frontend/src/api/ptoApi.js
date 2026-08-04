import API_BASE from "./config.js";

const BASE = `${API_BASE}/api/pto`;

async function handle(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || fallback);
  return data;
}

// An employee's PTO balance, annual allotment and ledger (HR).
export async function getEmployeePto(employeeId) {
  return handle(await fetch(`${BASE}/employees/${employeeId}`, { credentials: "include" }),
                "Failed to load PTO");
}

// Post monthly accruals through today (idempotent — safe to re-run).
export async function runAccrual() {
  return handle(await fetch(`${BASE}/run-accrual`, { method: "POST", credentials: "include" }),
                "Failed to run accrual");
}

// A manual balance correction (+/- days) with a note.
export async function adjustPto(employeeId, deltaDays, note) {
  return handle(
    await fetch(`${BASE}/employees/${employeeId}/adjust`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deltaDays, note }),
    }),
    "Failed to adjust the balance",
  );
}
