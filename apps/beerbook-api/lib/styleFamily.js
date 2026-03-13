/**
 * Canonical 9 style families for filter pills and style-counts.
 * Placement: Kölsch → Pale Ale; California Common / Steam → Lager; Porter separate from Stout.
 */
const CANONICAL_FAMILIES = [
  'IPA',
  'Pale Ale',
  'Lager',
  'Stout',
  'Porter',
  'Wheat',
  'Pilsner',
  'Sour',
  'Belgian',
];

/**
 * Maps a style name (e.g. from ratings.style or beers.style) to one of the 9 families, or 'Unknown'.
 * @param {string|null|undefined} style
 * @returns {string}
 */
function styleToFamily(style) {
  const s = style && String(style).trim();
  if (!s) return 'Unknown';
  const lower = s.toLowerCase();

  if (lower.includes('porter')) return 'Porter';
  if (lower.includes('stout')) return 'Stout';
  if (lower.includes('ipa') || lower.includes('india pale ale')) return 'IPA';
  if (lower.includes('pilsner') || lower === 'pils') return 'Pilsner';
  if (lower.includes('lager') || lower.includes('california common') || lower.includes('steam beer')) return 'Lager';
  if (lower.includes('sour') || lower.includes('gose') || lower.includes('lambic') || lower.includes('berliner')) return 'Sour';
  if (lower.includes('wheat') || lower.includes('hefeweizen') || lower.includes('weiss') || lower.includes('witbier')) return 'Wheat';
  if (lower.includes('belgian') || lower.includes('tripel') || lower.includes('saison') || lower.includes('dubbel') || lower.includes('abbey')) return 'Belgian';
  if (lower.includes('pale ale') || lower.includes('köln') || lower.includes('kolsch') || lower.includes('kölsch') ||
      lower.includes('blonde') || lower.includes('amber ale') || lower.includes('cream ale') || lower.includes('golden ale') ||
      lower.includes('english pale') || lower.includes('american pale')) return 'Pale Ale';

  // If it's already one of the 9, return as-is
  if (CANONICAL_FAMILIES.includes(s)) return s;
  return 'Unknown';
}

/**
 * Collapse a style_distribution (style name → count) to family → count and return the top family.
 * @param {Record<string, number>} styleDistribution
 * @returns {{ byFamily: Record<string, number>, topFamily: string|null }}
 */
function styleDistributionToFamilies(styleDistribution) {
  const byFamily = {};
  if (!styleDistribution || typeof styleDistribution !== 'object') {
    return { byFamily: {}, topFamily: null };
  }
  for (const [style, count] of Object.entries(styleDistribution)) {
    const family = styleToFamily(style);
    const n = Number(count) || 0;
    byFamily[family] = (byFamily[family] || 0) + n;
  }
  const top = Object.entries(byFamily).sort((a, b) => b[1] - a[1])[0];
  return { byFamily, topFamily: top ? top[0] : null };
}

module.exports = {
  CANONICAL_FAMILIES,
  styleToFamily,
  styleDistributionToFamilies,
};
