/**
 * Shared Beer of the Week selection logic.
 *
 * Used by:
 *   - routes/highlights.js  (runtime fallback at request time)
 *   - workers/botw-weekly.js (Monday scheduled job that persists the pick)
 *
 * Fallback chain (admin-curated pick is handled separately by the route):
 *   1. Best beer from last 7 days  (1+ rating)  → source: 'recent_7d'
 *   2. Best beer from last 30 days (1+ rating)  → source: 'recent_30d'
 *   3. Highest-rated catalog beer (5+ reviews)  → source: 'historical_fallback'
 *   4. null if the database has no viable data
 */

/**
 * Pick the best beer from a ratings array.
 * Groups by beer_name|brewery|style, picks the group with the highest average rating.
 * Tie-break: more ratings first, then alphabetical beer_name for determinism.
 * @returns {{ beer_name, brewery, style, ratings: object[], first_at: string, first_user_id: string|null }} or null
 */
function pickBestFromRatings(ratings) {
  if (!Array.isArray(ratings) || ratings.length === 0) return null;
  const byBeer = {};
  ratings.forEach((r) => {
    const key = `${r.beer_name}|${r.brewery || ''}|${r.style || ''}`;
    if (!byBeer[key]) {
      byBeer[key] = { beer_name: r.beer_name, brewery: r.brewery, style: r.style, ratings: [], first_at: r.created_at, first_user_id: r.user_id || null };
    }
    byBeer[key].ratings.push(r);
    if (r.created_at < byBeer[key].first_at) {
      byBeer[key].first_at = r.created_at;
      byBeer[key].first_user_id = r.user_id || null;
    }
  });
  const candidates = Object.values(byBeer);
  if (candidates.length === 0) return null;
  const avg = (c) => c.ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / c.ratings.length;
  candidates.sort((a, b) => {
    const diff = avg(b) - avg(a);
    if (diff !== 0) return diff;
    if (b.ratings.length !== a.ratings.length) return b.ratings.length - a.ratings.length;
    return (a.beer_name || '').localeCompare(b.beer_name || '');
  });
  return candidates[0];
}

/**
 * Run the fallback selection chain against PostgREST.
 *
 * @param {Function} rest - PostgREST helper: rest(method, path) → { status, body } (route-style)
 *                          OR rest(method, path) → json (worker-style, throws on error)
 * @param {object}   [options]
 * @param {boolean}  [options.workerRest] - true when `rest` is the worker-style variant
 *                                          that returns raw JSON and throws on 4xx+
 * @returns {Promise<{ source: string, beer_name, brewery, style, review_count, avg_rating, first_user_id }|null>}
 */
async function selectBeerOfTheWeek(rest, options) {
  const workerRest = options && options.workerRest;

  // Normalize the two rest styles into a common interface returning { ok, rows }
  async function query(path) {
    if (workerRest) {
      try {
        const result = await rest('GET', path);
        return { ok: true, rows: Array.isArray(result) ? result : [] };
      } catch {
        return { ok: false, rows: [] };
      }
    }
    const res = await rest('GET', path);
    return { ok: res.status < 400, rows: Array.isArray(res.body) ? res.body : [] };
  }

  // ── Fallback 1: Best beer from last 7 days ──
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const r7d = await query(`/ratings?created_at=gte.${since7d}&order=created_at.asc`);
  if (r7d.ok) {
    const pick = pickBestFromRatings(r7d.rows);
    if (pick) {
      const avgRating = pick.ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / pick.ratings.length;
      return {
        source: 'recent_7d',
        beer_name: pick.beer_name,
        brewery: pick.brewery || null,
        style: pick.style || null,
        review_count: pick.ratings.length,
        avg_rating: Math.round(avgRating * 100) / 100,
        first_user_id: pick.first_user_id,
      };
    }
  }

  // ── Fallback 2: Best beer from last 30 days ──
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const r30d = await query(`/ratings?created_at=gte.${since30d}&order=created_at.asc`);
  if (r30d.ok) {
    const pick = pickBestFromRatings(r30d.rows);
    if (pick) {
      const avgRating = pick.ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / pick.ratings.length;
      return {
        source: 'recent_30d',
        beer_name: pick.beer_name,
        brewery: pick.brewery || null,
        style: pick.style || null,
        review_count: pick.ratings.length,
        avg_rating: Math.round(avgRating * 100) / 100,
        first_user_id: pick.first_user_id,
      };
    }
  }

  // ── Fallback 3: Historical fallback from catalog ──
  const catalogPath = '/beers?review_count=gte.5&review_overall=not.is.null&order=review_overall.desc,review_count.desc,name.asc&select=name,brewery_name,style,review_overall,review_count&limit=1';
  const catalog = await query(catalogPath);
  if (catalog.ok && catalog.rows.length > 0) {
    const row = catalog.rows[0];
    return {
      source: 'historical_fallback',
      beer_name: row.name,
      brewery: row.brewery_name || null,
      style: row.style || null,
      review_count: row.review_count != null ? Number(row.review_count) : null,
      avg_rating: row.review_overall != null ? Number(row.review_overall) : null,
      first_user_id: null,
    };
  }

  return null;
}

module.exports = { pickBestFromRatings, selectBeerOfTheWeek };
