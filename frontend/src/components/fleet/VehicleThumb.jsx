import { describeLevel, normalizeVehicleCapability } from "../../utils/taxonomy";

/**
 * Vehicle thumbnail.
 *
 * The fleet has no photos, and inventing them (stock images, random URLs) would
 * put fiction in an operational list. This is a single inline placeholder — an
 * ambulance silhouette tinted by the vehicle's canonical capability colour — so
 * the card reads like the reference without pretending to show the real truck.
 *
 * Inline SVG: no extra network request and no bundle weight beyond the markup.
 * If real photos arrive, swap the <svg> for an <img> here and every card follows.
 */
export default function VehicleThumb({ capability, size = 56, alt }) {
  const d = describeLevel(capability, { normalizer: normalizeVehicleCapability });
  const rgb = `var(--ems-tax-${d.token}-rgb)`;

  return (
    <span
      className="vehicle-thumb"
      style={{
        width: size,
        height: size,
        background: `rgba(${rgb}, 0.10)`,
        borderColor: `rgba(${rgb}, 0.30)`,
      }}
      // Decorative next to the unit name; described only when a caller needs it.
      role={alt ? "img" : "presentation"}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : "true"}
    >
      <svg viewBox="0 0 64 40" width={size * 0.72} height={size * 0.45} focusable="false">
        {/* box body */}
        <rect x="20" y="8" width="34" height="20" rx="2.5"
              fill="var(--color-surface)" stroke={`rgb(${rgb})`} strokeWidth="2" />
        {/* cab */}
        <path d="M20 12 H10 L4 19 v9 h16 z"
              fill="var(--color-surface)" stroke={`rgb(${rgb})`} strokeWidth="2"
              strokeLinejoin="round" />
        {/* windscreen */}
        <path d="M11 14 h7 v5 h-11 z" fill={`rgba(${rgb}, 0.35)`} />
        {/* stripe */}
        <rect x="22" y="17" width="30" height="3" fill={`rgba(${rgb}, 0.55)`} />
        {/* star of life */}
        <circle cx="37" cy="13" r="3.2" fill={`rgb(${rgb})`} opacity="0.85" />
        {/* wheels */}
        <circle cx="15" cy="30" r="4.5" fill="var(--color-text-secondary)" />
        <circle cx="45" cy="30" r="4.5" fill="var(--color-text-secondary)" />
        <circle cx="15" cy="30" r="1.8" fill="var(--color-surface)" />
        <circle cx="45" cy="30" r="1.8" fill="var(--color-surface)" />
      </svg>
    </span>
  );
}
