import { STATUS_BG, STATUS_COLORS, STATUS_RGB, STATUS_LABELS } from "../../utils/dispatchBoardUtils";

export default function StatusPill({ status, size = "md" }) {
  const bg = STATUS_BG[status] || "var(--color-surface-subtle)";
  const text = STATUS_COLORS[status] || "var(--color-text)";
  const rgb = STATUS_RGB[status] || "var(--ems-tax-unknown-rgb)";
  return (
    <span style={{
      display: "inline-block",
      padding: size === "sm" ? "1px 7px" : "3px 10px",
      borderRadius: 20,
      fontWeight: 700,
      fontSize: size === "sm" ? 10 : 12,
      background: bg,
      color: text,
      border: `1px solid rgba(${rgb}, 0.27)`,
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
