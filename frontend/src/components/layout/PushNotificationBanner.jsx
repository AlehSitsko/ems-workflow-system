import { FaBell, FaTimes } from "react-icons/fa";

export default function PushNotificationBanner({ onEnable, onDismiss }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.25rem",
        right: "1.25rem",
        zIndex: 1060,
        background: "var(--bs-dark, #1e2330)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "0.5rem",
        padding: "0.85rem 1rem",
        boxShadow: "0 4px 18px rgba(0,0,0,0.45)",
        maxWidth: "320px",
        color: "#e0e6f0",
        display: "flex",
        gap: "0.75rem",
        alignItems: "flex-start",
      }}
    >
      <FaBell style={{ marginTop: "2px", color: "#6ea8fe", flexShrink: 0, fontSize: "1rem" }} />
      <div style={{ flex: 1, fontSize: "0.86rem", lineHeight: 1.45 }}>
        <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Enable browser notifications?</div>
        <div style={{ color: "#a0aec0", marginBottom: "0.6rem" }}>
          Get alerts for unassigned calls, cert expirations, and more — even when this tab is in the background.
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn btn-sm btn-primary"
            style={{ fontSize: "0.8rem", padding: "0.25rem 0.75rem" }}
            onClick={onEnable}
          >
            Enable
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            style={{ fontSize: "0.8rem", padding: "0.25rem 0.75rem" }}
            onClick={onDismiss}
          >
            Not now
          </button>
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{ background: "none", border: "none", color: "#a0aec0", cursor: "pointer", padding: 0, lineHeight: 1 }}
      >
        <FaTimes />
      </button>
    </div>
  );
}
