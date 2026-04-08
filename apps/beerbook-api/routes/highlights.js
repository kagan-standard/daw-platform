/**
 * GET /api/highlights/beer-of-the-week
 * Prefers admin-curated featured_beers for the current week when present; otherwise auto-computed from ratings.
 * Optionally includes first_rated_by { user_id, display_name } when the first rater can be resolved.
 *
 * Fallback chain:
 *   1. Admin-curated featured beer for the current week
 *   2. Trending beer from the last 7 days (1+ rating, best avg, tie-break on count then name)
 *   3. Broader recent fallback from the last 30 days (same selection logic)
 *   4. Historical fallback from the beer catalog (highest review_overall with review_count >= 5)
 *   5. beer: null only when the database has no viable candidates at all
 */
const express = require('express');
const { getTierName } = require('../lib/eloTiers');
const { selectBeerOfTheWeek } = require('../lib/beerOfTheWeekSelection');

function getCurrentWeekRange() {
  const d = new Date();
  const utcDay = d.getUTCDay();
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 7);
  sunday.setUTCMilliseconds(-1);
  return { week_start: monday.toISOString(), week_end: sunday.toISOString() };
}

/** Resolve first_rated_by from a user_id; returns { user_id, display_name } or null. */
async function resolveFirstRater(rest, userId) {
  if (!userId || typeof userId !== 'string' || !userId.trim()) return null;
  const id = userId.trim();
  const { status, body } = await rest('GET', `/profiles?id=eq.${encodeURIComponent(id)}&select=id,display_name&limit=1`);
  if (status >= 400 || !Array.isArray(body) || body.length === 0) return null;
  const row = body[0];
  return { user_id: row.id, display_name: row.display_name || 'Beer Lover' };
}

/** Phase 5: Fetch power_score and comparison_count for a beer (by beer_id or by name/brewery/style). */
async function fetchPowerScore(rest, { beer_id, beer_name, brewery, style }) {
  let catalogId = beer_id && typeof beer_id === 'string' ? beer_id.trim() : null;
  if (!catalogId && beer_name) {
    const name = encodeURIComponent(String(beer_name).trim());
    const breweryName = encodeURIComponent(String(brewery || '').trim());
    const styleVal = encodeURIComponent(String(style || '').trim());
    const { status, body } = await rest('GET', `/beers?name=eq.${name}&brewery_name=eq.${breweryName}&style=eq.${styleVal}&select=id&limit=1`);
    if (status < 400 && Array.isArray(body) && body.length > 0) catalogId = body[0].id;
  }
  if (!catalogId) return null;
  const { status, body } = await rest('GET', `/beer_elo_ratings?beer_id=eq.${encodeURIComponent(catalogId)}&select=global_elo,comparison_count&limit=1`);
  if (status >= 400 || !Array.isArray(body) || body.length === 0) return null;
  const row = body[0];
  return {
    power_score: row.global_elo != null ? Number(row.global_elo) : null,
    comparison_count: row.comparison_count != null ? Number(row.comparison_count) : null,
  };
}

module.exports = function (opts) {
  const { rest } = opts;
  const router = express.Router();

  router.get('/beer-of-the-week', async (req, res, next) => {
    try {
      const { week_start, week_end } = getCurrentWeekRange();

      // ── Fallback 1: Admin-curated featured beer for the current week ──
      const featuredPath = `/featured_beers?feature_type=eq.beer_of_the_week&week_start=eq.${encodeURIComponent(week_start)}&limit=1`;
      const featuredRes = await rest('GET', featuredPath);
      if (featuredRes.status < 400 && Array.isArray(featuredRes.body) && featuredRes.body.length > 0) {
        const pick = featuredRes.body[0];
        let first_rated_by = null;
        const breweryParam = pick.brewery != null && pick.brewery !== '' ? `&brewery=eq.${encodeURIComponent(pick.brewery)}` : '&brewery=is.null';
        const styleParam = pick.style != null && pick.style !== '' ? `&style=eq.${encodeURIComponent(pick.style)}` : '&style=is.null';
        const firstRatingPath = `/ratings?beer_name=eq.${encodeURIComponent(pick.beer_name)}${breweryParam}${styleParam}&created_at=gte.${encodeURIComponent(week_start)}&created_at=lte.${encodeURIComponent(week_end)}&order=created_at.asc&limit=1&select=user_id`;
        const firstRatingRes = await rest('GET', firstRatingPath);
        if (firstRatingRes.status < 400 && Array.isArray(firstRatingRes.body) && firstRatingRes.body.length > 0) {
          const firstUserId = firstRatingRes.body[0].user_id;
          first_rated_by = await resolveFirstRater(rest, firstUserId);
        }
        const elo = await fetchPowerScore(rest, { beer_id: pick.beer_id, beer_name: pick.beer_name, brewery: pick.brewery, style: pick.style });
        return res.json({
          beer: {
            beer_name: pick.beer_name,
            brewery: pick.brewery || null,
            style: pick.style || null,
            review_count: null,
            avg_rating: null,
            first_reviewed: null,
            first_rated_by,
            headline: pick.headline || null,
            body: pick.body || null,
            photo_url: pick.photo_url || null,
            source: 'admin',
            power_score: elo ? elo.power_score : null,
            comparison_count: elo ? elo.comparison_count : null,
            elo_tier: elo && elo.power_score != null ? getTierName(elo.power_score) : null,
          },
        });
      }

      // ── Fallbacks 2–4: auto-selection via shared logic ─��
      const selection = await selectBeerOfTheWeek(rest);
      if (selection) {
        const first_rated_by = await resolveFirstRater(rest, selection.first_user_id);
        const elo = await fetchPowerScore(rest, { beer_name: selection.beer_name, brewery: selection.brewery, style: selection.style });
        return res.json({
          beer: {
            beer_name: selection.beer_name,
            brewery: selection.brewery,
            style: selection.style,
            review_count: selection.review_count,
            avg_rating: selection.avg_rating,
            first_reviewed: null,
            first_rated_by,
            source: selection.source,
            power_score: elo ? elo.power_score : null,
            comparison_count: elo ? elo.comparison_count : null,
            elo_tier: elo && elo.power_score != null ? getTierName(elo.power_score) : null,
          },
        });
      }

      // ── No viable beer data in the system ──
      res.json({ beer: null, message: 'No viable beer data in the system' });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
