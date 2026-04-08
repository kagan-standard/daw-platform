/**
 * ELO trend helpers — shared by catalog browse, beer detail, and rankings endpoints.
 * Returns dual-window trends (3-day and 7-day) in every elo_trend object.
 */
const { getTierName } = require('./eloTiers');

const TREND_THRESHOLD = 10; // delta must exceed this to be 'up' or 'down'

/**
 * Classify a delta into a trend string.
 */
function classifyTrend(delta) {
  if (delta > TREND_THRESHOLD) return 'up';
  if (delta < -TREND_THRESHOLD) return 'down';
  return 'flat';
}

/**
 * Build a single trend window result.
 */
function buildWindowTrend(currentElo, referenceElo) {
  if (referenceElo == null) {
    return { trend: 'new', delta: 0, tier_changed: false };
  }
  const delta = currentElo - referenceElo;
  return {
    trend: classifyTrend(delta),
    delta,
    tier_changed: getTierName(currentElo) !== getTierName(referenceElo),
  };
}

/**
 * Pick the best reference snapshot from a list of candidate rows for a given window.
 * Primary window: (now - upperDays, now - lowerDays) — pick the most recent in that range.
 * Fallback: oldest snapshot that is at least 1 day old AND younger than upperDays.
 * @param {Array} rows - sorted by recorded_at ASC
 * @param {number} now - Date.now() timestamp
 * @param {number} lowerDays - inner bound (e.g. 2 for 3d window)
 * @param {number} upperDays - outer bound (e.g. 4 for 3d window)
 * @returns {object|null} snapshot row or null
 */
function pickReference(rows, now, lowerDays, upperDays) {
  const lowerMs = now - upperDays * 86400000; // older bound
  const upperMs = now - lowerDays * 86400000; // newer bound
  const oneDayAgo = now - 86400000;

  // Primary: most recent snapshot in [lowerMs, upperMs]
  let primary = null;
  for (const r of rows) {
    const t = new Date(r.recorded_at).getTime();
    if (t >= lowerMs && t <= upperMs) {
      primary = r; // rows are ASC, so last match = most recent
    }
  }
  if (primary) return primary;

  // Fallback: oldest snapshot that is >= 1 day old AND < upperDays old
  for (const r of rows) {
    const t = new Date(r.recorded_at).getTime();
    if (t <= oneDayAgo && t >= lowerMs) {
      return r; // first match = oldest (ASC order)
    }
  }
  return null;
}

/**
 * Fetch trend for a single beer via the RPC.
 * @returns {{ trend_3d, trend_7d }} or null
 */
async function fetchBeerTrend(rest, beerId) {
  try {
    const { status, body } = await rest('POST', '/rpc/get_beer_elo_trend', {
      body: JSON.stringify({ p_beer_id: beerId }),
    });
    if (status >= 400 || !body) return null;
    const row = Array.isArray(body) ? body[0] : body;
    if (!row) return null;
    return row; // RPC now returns { trend_3d: {...}, trend_7d: {...} } directly
  } catch {
    return null;
  }
}

/**
 * Batch-fetch trend data for a list of beer IDs.
 * Queries beer_elo_history directly and computes dual-window deltas in JS.
 * Single query fetches all snapshots within 9 days for all beers.
 * @param {Function} rest - route helper rest function
 * @param {string[]} beerIds - array of beer_id strings
 * @returns {Object<string, { trend_3d, trend_7d }>} keyed by beer_id
 */
async function fetchBeerTrendsBatch(rest, beerIds) {
  const result = {};
  if (!beerIds || beerIds.length === 0) return result;

  const uniqueIds = [...new Set(beerIds)];
  const filter = uniqueIds.map(id => encodeURIComponent(id)).join(',');
  const now = Date.now();
  // Fetch all snapshots within 9 days (covers the 7d window's outer bound of 8 days + margin)
  const cutoff = new Date(now - 9 * 86400000).toISOString();

  try {
    // Parallel: fetch history snapshots + current ELOs
    const [histRes, eloRes] = await Promise.all([
      rest('GET',
        `/beer_elo_history?beer_id=in.(${filter})&recorded_at=gte.${encodeURIComponent(cutoff)}&select=beer_id,elo_score,recorded_at&order=recorded_at.asc`
      ),
      rest('GET',
        `/beer_elo_ratings?beer_id=in.(${filter})&select=beer_id,global_elo`
      ),
    ]);

    // Build current ELO map — FIX C: treat 0 as 0, not 1500
    const currentEloMap = {};
    if (eloRes.status < 400 && Array.isArray(eloRes.body)) {
      for (const row of eloRes.body) {
        currentEloMap[row.beer_id] = row.global_elo != null ? Number(row.global_elo) : 0;
      }
    }

    // Group history rows by beer_id
    const historyByBeer = {};
    if (histRes.status < 400 && Array.isArray(histRes.body)) {
      for (const row of histRes.body) {
        if (!historyByBeer[row.beer_id]) historyByBeer[row.beer_id] = [];
        historyByBeer[row.beer_id].push(row);
      }
    }

    const newWindow = { trend: 'new', delta: 0, tier_changed: false };

    for (const beerId of uniqueIds) {
      const currentElo = currentEloMap[beerId] != null ? currentEloMap[beerId] : 0;
      const rows = historyByBeer[beerId] || [];

      // 3-day window: primary (2d–4d ago), fallback oldest >= 1d old within 4d
      const ref3d = pickReference(rows, now, 2, 4);
      // 7-day window: primary (6d–8d ago), fallback oldest >= 1d old within 8d
      const ref7d = pickReference(rows, now, 6, 8);

      const elo3d = ref3d ? (ref3d.elo_score != null ? Number(ref3d.elo_score) : null) : null;
      const elo7d = ref7d ? (ref7d.elo_score != null ? Number(ref7d.elo_score) : null) : null;

      result[beerId] = {
        trend_3d: elo3d != null ? buildWindowTrend(currentElo, elo3d) : { ...newWindow },
        trend_7d: elo7d != null ? buildWindowTrend(currentElo, elo7d) : { ...newWindow },
      };
    }
  } catch {
    // Non-fatal; return whatever we have
  }

  return result;
}

module.exports = { fetchBeerTrend, fetchBeerTrendsBatch };
