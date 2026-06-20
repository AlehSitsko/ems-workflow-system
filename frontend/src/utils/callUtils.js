export const getLoggedDispatcherName = () => {
  const storedUser = localStorage.getItem("ems_current_user");
  if (!storedUser) return "";
  try {
    const user = JSON.parse(storedUser);
    return user.display_name || user.username || "";
  } catch (err) {
    console.error("Failed to read logged dispatcher:", err);
    return "";
  }
};

export const getTodayDate = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

// Local time ISO string without UTC offset — used for received_at and timestamps
// so the backend stores human-readable local time, not UTC.
export const localIsoNow = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
