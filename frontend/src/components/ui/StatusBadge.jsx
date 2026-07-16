import { describeOperationalStatus } from "../../utils/taxonomy";

/**
 * Semantic status pill.
 *
 * `tone` is a meaning, not a colour: the token layer decides what "danger"
 * looks like, so one canonical value renders identically everywhere and both
 * themes stay in step. The label is always rendered as text — colour is never
 * the only carrier of the status.
 */
const TONES = ["success", "warning", "danger", "info", "neutral", "purple"];

export default function StatusBadge({ tone = "neutral", label, icon, title, dot = true }) {
  const safeTone = TONES.includes(tone) ? tone : "neutral";
  return (
    <span className={`status-badge tone-${safeTone}`} title={title || label}>
      {icon
        ? <span className="status-badge-icon" aria-hidden="true">{icon}</span>
        : dot && <span className="status-badge-dot" aria-hidden="true" />}
      {label}
    </span>
  );
}

/**
 * A vehicle's operational status, straight from the canonical taxonomy so
 * Fleet, Dispatch and the Calendar cannot disagree about what "Out of Service"
 * looks like.
 */
export function OperationalStatusBadge({ status, isRetired }) {
  const d = describeOperationalStatus(status, { isRetired });
  return <StatusBadge tone={d.tone} label={d.label} title={d.title} />;
}
