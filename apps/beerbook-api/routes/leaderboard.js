/**
 * GET /api/leaderboard?period=weekly|monthly|alltime
 */
const express = require('express');

module.exports = function (opts) {
  const { rest } = opts;
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const period = req.query.period || 'alltime';
      let since;
      if (period === 'weekly') since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      else if (period === 'monthly') since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sinceFilter = period === 'alltime' ? '' : `&created_at=gte.${since}`;
      const [ratingsRes, venuesRes] = await Promise.all([
        rest('GET', `/ratings?order=created_at.desc${sinceFilter}`),
        rest('GET', '/venues'),
      ]);
      if (ratingsRes.status >= 400) return res.status(ratingsRes.status).json(ratingsRes.body || { error: 'Upstream error' });
      const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
      const venues = Array.isArray(venuesRes.body) ? venuesRes.body : [];
      const userCount = {};
      const beerCount = {};
      const userYg = {};
      const venueCount = {};
      ratings.forEach((r) => {
        userCount[r.user_id] = (userCount[r.user_id] || 0) + 1;
        const key = `${r.beer_name}|${r.brewery || ''}`;
        beerCount[key] = (beerCount[key] || 0) + 1;
        if (r.yg_value != null) userYg[r.user_id] = (userYg[r.user_id] || 0) + Number(r.yg_value);
        if (r.venue_id) venueCount[r.venue_id] = (venueCount[r.venue_id] || 0) + 1;
      });
      const topReviewers = Object.entries(userCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([user_id, count]) => ({ user_id, count }));
      const topBeers = Object.entries(beerCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, count]) => {
        const [beer_name, brewery] = key.split('|');
        return { beer_name, brewery, count };
      });
      const topYg = Object.entries(userYg).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([user_id, total_yg]) => ({ user_id, total_yg }));
      const topVenues = Object.entries(venueCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([venue_id, count]) => {
        const v = venues.find((x) => x.id === venue_id);
        return { venue_id, venue_name: v ? v.name : null, count };
      });
      res.json({
        period,
        top_reviewers: topReviewers,
        top_beers: topBeers,
        top_yg_values: topYg,
        most_venues: topVenues,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
