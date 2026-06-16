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

export const getTodayDate = () => new Date().toISOString().split("T")[0];
