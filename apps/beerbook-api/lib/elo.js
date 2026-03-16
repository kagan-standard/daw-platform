/**
 * Phase 3: Elo engine. Update beer_elo_ratings on each head-to-head comparison.
 * Initial 1500; K by maturity (higher K for fewer comparisons).
 */

const ELO_INITIAL = Number(process.env.ELO_INITIAL) || 1500;
const ELO_K_MATURE = Number(process.env.ELO_K_MATURE) || 16;
const ELO_K_NEW = Number(process.env.ELO_K_NEW) || 32;
const ELO_MATURITY_CAP = Number(process.env.ELO_MATURITY_CAP) || 30;

/**
 * Expected score for player A vs B: E_a = 1 / (1 + 10^((R_b - R_a)/400))
 * @param {number} ratingA - Elo of A
 * @param {number} ratingB - Elo of B
 * @returns {number} expected score for A (0..1)
 */
function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * K-factor by maturity: use ELO_K_NEW until comparison_count >= ELO_MATURITY_CAP, else ELO_K_MATURE.
 * @param {number} comparisonCount - number of comparisons this beer has had
 * @returns {number} K value
 */
function kForMaturity(comparisonCount) {
  return comparisonCount < ELO_MATURITY_CAP ? ELO_K_NEW : ELO_K_MATURE;
}

/**
 * Compute new Elo for winner and loser. Standard: new = old + K * (score - expected).
 * Winner score = 1, loser score = 0.
 * @param {number} winnerElo - current Elo of winner
 * @param {number} loserElo - current Elo of loser
 * @param {number} winnerComparisonCount - comparison count for winner (for K)
 * @param {number} loserComparisonCount - comparison count for loser (for K)
 * @returns {{ winnerNewElo: number, loserNewElo: number, winnerK: number, loserK: number }}
 */
function computeNewElos(winnerElo, loserElo, winnerComparisonCount, loserComparisonCount) {
  const EWinner = expectedScore(winnerElo, loserElo);
  const ELoser = expectedScore(loserElo, winnerElo);
  const KWinner = kForMaturity(winnerComparisonCount);
  const KLoser = kForMaturity(loserComparisonCount);
  const winnerNewElo = Math.round(winnerElo + KWinner * (1 - EWinner));
  const loserNewElo = Math.round(loserElo + KLoser * (0 - ELoser));
  return {
    winnerNewElo: Math.max(0, Math.min(10000, winnerNewElo)),
    loserNewElo: Math.max(0, Math.min(10000, loserNewElo)),
    winnerK: KWinner,
    loserK: KLoser,
  };
}

/**
 * Fetch or create beer_elo_ratings row. Returns { global_elo, comparison_count } or null if fetch fails.
 * @param {function} rest - (method, path, opts) => Promise<{ status, body }>
 * @param {string} beerId - beer_id
 * @returns {Promise<{ global_elo: number, comparison_count: number }|null>}
 */
async function getOrCreateBeerElo(rest, beerId) {
  if (!beerId || !rest) return null;
  const path = `/beer_elo_ratings?beer_id=eq.${encodeURIComponent(beerId)}&limit=1`;
  const res = await rest('GET', path);
  if (res.status >= 400) return null;
  const rows = Array.isArray(res.body) ? res.body : [];
  const row = rows[0];
  if (row) {
    return {
      global_elo: Number(row.global_elo) || ELO_INITIAL,
      comparison_count: Number(row.comparison_count) || 0,
    };
  }
  // Insert new row at initial Elo
  const insertRes = await rest('POST', '/beer_elo_ratings', {
    headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify({
      beer_id: beerId,
      global_elo: ELO_INITIAL,
      comparison_count: 0,
      updated_at: new Date().toISOString(),
    }),
  });
  if (insertRes.status >= 400) return null;
  const inserted = Array.isArray(insertRes.body) ? insertRes.body[0] : insertRes.body;
  return {
    global_elo: Number(inserted?.global_elo) || ELO_INITIAL,
    comparison_count: Number(inserted?.comparison_count) || 0,
  };
}

/**
 * Update beer_elo_ratings after a comparison. Optionally write beer_elo_events.
 * Only updates when both winnerBeerId and loserBeerId are non-null; skips silently if either is null.
 * @param {function} rest - (method, path, opts) => Promise<{ status, body }>
 * @param {string} winnerBeerId - beer_id of winner (can be null for name-only rating)
 * @param {string} loserBeerId - beer_id of loser (can be null)
 * @param {string} [resultId] - head_to_head_results.id for beer_elo_events (optional)
 * @returns {Promise<boolean>} true if update succeeded (or both ids null), false on error
 */
async function updateEloAfterComparison(rest, winnerBeerId, loserBeerId, resultId = null) {
  if (!winnerBeerId || !loserBeerId) return true; // skip name-only ratings
  const winnerState = await getOrCreateBeerElo(rest, winnerBeerId);
  const loserState = await getOrCreateBeerElo(rest, loserBeerId);
  if (!winnerState || !loserState) return false;

  const { winnerNewElo, loserNewElo, winnerK, loserK } = computeNewElos(
    winnerState.global_elo,
    loserState.global_elo,
    winnerState.comparison_count,
    loserState.comparison_count,
  );
  const now = new Date().toISOString();

  const patchWinner = rest('PATCH', `/beer_elo_ratings?beer_id=eq.${encodeURIComponent(winnerBeerId)}`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      global_elo: winnerNewElo,
      comparison_count: winnerState.comparison_count + 1,
      updated_at: now,
    }),
  });
  const patchLoser = rest('PATCH', `/beer_elo_ratings?beer_id=eq.${encodeURIComponent(loserBeerId)}`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      global_elo: loserNewElo,
      comparison_count: loserState.comparison_count + 1,
      updated_at: now,
    }),
  });
  const [resWinner, resLoser] = await Promise.all([patchWinner, patchLoser]);
  if (resWinner.status >= 400 || resLoser.status >= 400) return false;

  if (resultId) {
    const eventWinner = rest('POST', '/beer_elo_events', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        result_id: resultId,
        beer_id: winnerBeerId,
        old_elo: winnerState.global_elo,
        new_elo: winnerNewElo,
        k_used: winnerK,
      }),
    });
    const eventLoser = rest('POST', '/beer_elo_events', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        result_id: resultId,
        beer_id: loserBeerId,
        old_elo: loserState.global_elo,
        new_elo: loserNewElo,
        k_used: loserK,
      }),
    });
    await Promise.all([eventWinner, eventLoser]);
    // non-blocking: don't fail the request if events fail
  }
  return true;
}

module.exports = {
  ELO_INITIAL,
  ELO_K_MATURE,
  ELO_K_NEW,
  ELO_MATURITY_CAP,
  expectedScore,
  kForMaturity,
  computeNewElos,
  getOrCreateBeerElo,
  updateEloAfterComparison,
};
