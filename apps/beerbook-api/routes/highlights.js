/**
 * GET /api/highlights/beer-of-the-week
 * Prefers admin-curated featured_beers for the current week when present; otherwise auto-computed from ratings.
 */
const express = require('express');

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

module.exports = function (opts) {
  const { rest } = opts;
  const router = express.Router();

  router.get('/beer-of-the-week', async (req, res, next) => {
    try {
      const { week_start, week_end } = getCurrentWeekRange();
      const featuredPath = `/featured_beers?feature_type=eq.beer_of_the_week&week_start=eq.${encodeURIComponent(week_start)}&limit=1`;
      const featuredRes = await rest('GET', featuredPath);
      if (featuredRes.status < 400 && Array.isArray(featuredRes.body) && featuredRes.body.length > 0) {
        const pick = featuredRes.body[0];
        return res.json({
          beer: {
            beer_name: pick.beer_name,
            brewery: pick.brewery || null,
            style: pick.style || null,
            review_count: null,
            avg_rating: null,
            first_reviewed: null,
            headline: pick.headline || null,
            body: pick.body || null,
            photo_url: pick.photo_url || null,
            source: 'admin',
          },
        });
      }
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { status, body } = await rest('GET', `/ratings?created_at=gte.${since}&order=created_at.asc`);
      if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
      const ratings = Array.isArray(body) ? body : [];
      const byBeer = {};
      ratings.forEach((r) => {
        const key = `${r.beer_name}|${r.brewery || ''}|${r.style || ''}`;
        if (!byBeer[key]) byBeer[key] = { beer_name: r.beer_name, brewery: r.brewery, style: r.style, ratings: [], first_at: r.created_at };
        byBeer[key].ratings.push(r);
        if (r.created_at < byBeer[key].first_at) byBeer[key].first_at = r.created_at;
      });
      const withTwo = Object.values(byBeer).filter((x) => x.ratings.length >= 2);
      if (withTwo.length === 0) return res.json({ beer: null, message: 'No beer with 2+ ratings in the last 7 days' });
      const sorted = withTwo.sort((a, b) => {
        const avgA = a.ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / a.ratings.length;
        const avgB = b.ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / b.ratings.length;
        return avgB - avgA;
      });
      const top = sorted[0];
      const avgRating = top.ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / top.ratings.length;
      res.json({
        beer: {
          beer_name: top.beer_name,
          brewery: top.brewery,
          style: top.style,
          review_count: top.ratings.length,
          avg_rating: Math.round(avgRating * 100) / 100,
          first_reviewed: top.first_at,
          source: 'auto',
        },
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
