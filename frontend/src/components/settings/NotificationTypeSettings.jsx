import { FaBell } from "react-icons/fa";

const GROUPS = [
  {
    label: "Calls",
    types: ["call_new_today", "call_unassigned_soon", "call_als_on_bls"],
  },
  {
    label: "Units",
    types: ["unit_stuck_status", "unit_understaffed"],
  },
  {
    label: "HR & Employees",
    types: ["cert_expiring", "employee_added", "doc_expiring", "cert_no_scan"],
  },
];

// Per-type toggles for in-app/bell notifications. availableTypes comes from
// GET /api/notifications/prefs — role-filtered on the backend, each entry
// carrying { enabled, label }.
function NotificationTypeSettings({ availableTypes, localNotifs, onToggle }) {
  if (Object.keys(availableTypes).length === 0) {
    return <p className="text-muted">No notification types available for your role.</p>;
  }

  return (
    <>
      {GROUPS.map((group) => {
        const visible = group.types.filter((t) => availableTypes[t]);
        if (visible.length === 0) return null;
        return (
          <div key={group.label} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6c757d", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
              {group.label}
            </div>
            {visible.map((type) => (
              <div
                key={type}
                className="d-flex align-items-center justify-content-between"
                style={{ padding: "10px 0", borderBottom: "1px solid #2a3347" }}
              >
                <div className="d-flex align-items-center gap-3">
                  <FaBell style={{ color: localNotifs[type] ? "#6ea8fe" : "#495057", fontSize: 14 }} />
                  <span style={{ fontSize: 14, color: localNotifs[type] ? "var(--ems-text-primary)" : "#6c757d" }}>
                    {availableTypes[type]?.label || type}
                  </span>
                </div>
                <div className="form-check form-switch mb-0">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    role="switch"
                    checked={!!localNotifs[type]}
                    onChange={() => onToggle(type)}
                    style={{ cursor: "pointer" }}
                  />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

export default NotificationTypeSettings;
