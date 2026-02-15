/**
 * GET /api/highlights/beer-of-the-week
 */
const express = require('express');

module.exports = function (opts) {
  const { rest } = opts;
  const router = express.Router();

  router.get('/beer-of-the-week', (req, res, next) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    rest('GET', `/ratings?created_at=gte.${since}&order=created_at.asc`)
      .then(({ status, body }) => {
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
          },
        });
      })
      .catch(next);
  });

  return router;
};
