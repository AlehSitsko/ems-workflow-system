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

// Single source of truth for the optional "return leg" of a trip. Both the classic
// CallForm and the guided CallFormPage build this identical payload, so the rules
// (when a return leg is created, and Will-Call vs Return semantics) live here once.
// `data` is either form's state object (same field names); returns null when no
// return leg is requested. A Will-Call leg carries no pickup time — the Dispatch
// Board sets it later.
export const buildReturnLegPayload = (data, { patientId, savedCallId }) => {
  if (data.returnRideOption === "none" || !data.returnPickup) return null;
  const isWillCall = data.returnRideOption === "will_call";
  return {
    patient_id: patientId,
    dispatcher_name: data.dispatcherName,
    received_at: localIsoNow(),
    status: "new",
    date_of_call: data.callDate,
    trip_date: data.tripDate,
    pickup_time: isWillCall ? "" : (data.returnTime || ""),
    appointment_time: "",
    pickup_address: data.returnPickup,
    dropoff_address: data.returnDestination,
    caller_type: data.callerType,
    call_type: isWillCall ? "will_call" : "return",
    service_level: data.serviceLevel,
    caller_phone: data.phoneNumber || null,
    caller_note: null,
    quality_score: 0,
    missing_critical_fields: "",
    missing_optional_fields: "",
    missing_info_explanation: "",
    notes: `${isWillCall ? "Will Call" : "Return"} leg for call #${savedCallId}`,
  };
};
