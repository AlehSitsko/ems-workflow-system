import { STATUS_BG, STATUS_COLORS, STATUS_LABELS } from "../../utils/dispatchBoardUtils";

export default function StatusPill({ status, size = "md" }) {
  const bg = STATUS_BG[status] || "#374151";
  const text = STATUS_COLORS[status] || "#e5e7eb";
  return (
    <span style={{
      display: "inline-block",
      padding: size === "sm" ? "1px 7px" : "3px 10px",
      borderRadius: 20,
      fontWeight: 700,
      fontSize: size === "sm" ? 10 : 12,
      background: bg,
      color: text,
      border: `1px solid ${text}44`,
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
