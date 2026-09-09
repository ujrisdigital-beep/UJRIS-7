/**
 * Illustrative Vento injury-to-feelings bands for discrimination claims.
 *
 * IMPORTANT: The Presidential Guidance bands are updated periodically for
 * inflation. The figures below are indicative placeholders for product
 * demonstration only and MUST be replaced with the current published
 * Presidential Guidance figures (and cited as such) before this feature is
 * relied on for anything beyond a rough illustration. UJRIS never presents
 * this as a guaranteed award — only as a starting range for discussion with
 * an adviser.
 */
export const VENTO_BANDS_ILLUSTRATIVE = {
  effectiveFrom: "illustrative — verify current Presidential Guidance",
  lower: { min: 1200, max: 12100, description: "Lower band — one-off or isolated act" },
  middle: { min: 12100, max: 36400, description: "Middle band — serious, not the most serious cases" },
  upper: { min: 36400, max: 60700, description: "Upper band — most serious cases" },
  exceptional: { min: 60700, max: null, description: "Exceptional cases — may exceed the upper band" },
} as const;

export function suggestVentoBand(severity: "low" | "medium" | "high" | "exceptional") {
  switch (severity) {
    case "low":
      return VENTO_BANDS_ILLUSTRATIVE.lower;
    case "medium":
      return VENTO_BANDS_ILLUSTRATIVE.middle;
    case "high":
      return VENTO_BANDS_ILLUSTRATIVE.upper;
    default:
      return VENTO_BANDS_ILLUSTRATIVE.exceptional;
  }
}
