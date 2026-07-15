import { UnitTypeBadge as CanonicalUnitTypeBadge } from "../taxonomy/TaxonomyBadges";

// Dispatch Board unit-type badge.
//
// This used to be binary — ALS was blue and *everything else* was rendered as
// BLS green, so a Bariatric or CCT unit was silently mislabelled. It now
// delegates to the canonical taxonomy badge, which resolves the real unit type,
// gives each one its own semantic colour, and degrades an unrecognised value to
// a neutral "Unknown" badge instead of a confident wrong one.
export default function UnitTypeBadge({ unitType }) {
  return <CanonicalUnitTypeBadge value={unitType} />;
}
