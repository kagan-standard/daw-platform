/**
 * GET /api/leaderboard?period=weekly|monthly|alltime
 * Phase 4.1: DB-side aggregation via leaderboard_aggregate RPC; response includes truncated and pagination.
 */
const express = require('express');

const LEADERBOARD_TOP_LIMIT = 10;
const LEADERBOARD_MAX_RATINGS = 10000;

module.exports = function (opts) {
  const { rest } = opts;
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const VALID_PERIODS = ['weekly', 'monthly', 'alltime'];
      const period = req.query.period || 'alltime';
      if (!VALID_PERIODS.includes(period)) {
        return res.status(400).json({
          error: `Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`,
        });
      }
      const crewId = String(req.query.crew_id || '').trim() || null;

      const rpcRes = await rest('POST', '/rpc/leaderboard_aggregate', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_period: period,
          p_crew_id: crewId,
          p_limit: LEADERBOARD_TOP_LIMIT,
          p_max_ratings: LEADERBOARD_MAX_RATINGS,
        }),
      });
      if (rpcRes.status >= 400) return res.status(rpcRes.status).json(rpcRes.body || { error: 'Upstream error' });

      const result = rpcRes.body && typeof rpcRes.body === 'object' ? rpcRes.body : {};
      let topReviewers = Array.isArray(result.top_reviewers) ? result.top_reviewers : [];
      const topBeers = Array.isArray(result.top_beers) ? result.top_beers : [];
      const topYg = Array.isArray(result.top_yg_values) ? result.top_yg_values : [];
      const topVenues = Array.isArray(result.most_venues) ? result.most_venues : [];
      const truncated = result.truncated === true;

      if (topReviewers.length) {
        const idList = topReviewers.map((row) => row.user_id).filter(Boolean).map((id) => encodeURIComponent(id)).join(',');
        if (idList) {
          const profileRes = await rest('GET', `/profiles?id=in.(${idList})&select=id,display_name,avatar_url`);
          if (profileRes.status < 400 && Array.isArray(profileRes.body)) {
            const profilesById = Object.fromEntries(
              profileRes.body.map((p) => [p.id, { display_name: p.display_name || null, avatar_url: p.avatar_url || null }])
            );
            topReviewers = topReviewers.map((row) => ({
              ...row,
              display_name: profilesById[row.user_id]?.display_name || null,
              avatar_url: profilesById[row.user_id]?.avatar_url || null,
            }));
          }
        }
      }

      const mostVenuesShape = topVenues.map((v) => ({
        venue_id: v.venue_id,
        venue_name: v.venue_name ?? null,
        count: v.count,
      }));

      res.json({
        period,
        crew_id: crewId,
        top_reviewers: topReviewers,
        top_beers: topBeers,
        top_yg_values: topYg,
        most_venues: mostVenuesShape,
        truncated,
        pagination: { limit: LEADERBOARD_TOP_LIMIT },
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
