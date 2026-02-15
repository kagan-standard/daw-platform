/**
 * Beer endpoints: list, single, search autocomplete
 */
const express = require('express');

const BEER_SORT_WHITELIST = ['beer_name', 'avg_rating', 'review_count', 'last_reviewed', 'avg_yg_value'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

module.exports = function (opts) {
  const { rest, totalFromContentRange, parsePagination } = opts;
  const router = express.Router();

  function parseBeerPagination(req) {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    let offset = parseInt(req.query.offset, 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    const sort = BEER_SORT_WHITELIST.includes(req.query.sort) ? req.query.sort : 'avg_rating';
    const order = (req.query.order === 'asc' || req.query.order === 'desc') ? req.query.order : 'desc';
    return { limit, offset, sort, order };
  }

  // GET /api/beers — paginated from beer_averages
  router.get('/', (req, res, next) => {
    const { limit, offset, sort, order } = parseBeerPagination(req);
    const orderDir = order === 'asc' ? 'asc' : 'desc';
    rest('GET', `/beer_averages?limit=${limit}&offset=${offset}&order=${sort}.${orderDir}`, {
      headers: { Prefer: 'count=exact' },
    })
      .then(({ status, headers, body }) => {
        const total = totalFromContentRange(headers['content-range']) ?? (Array.isArray(body) ? body.length : 0);
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        res.json({ data: Array.isArray(body) ? body : [], pagination: { limit, offset, total } });
      })
      .catch(next);
  });

  // GET /api/beers/search?q=X — autocomplete, top 10
  router.get('/search', (req, res, next) => {
    const q = (req.query.q || '').trim().replace(/%/g, '');
    if (!q) return res.json({ data: [] });
    const encoded = encodeURIComponent(q);
    rest('GET', `/ratings?beer_name=ilike.${encoded}*&select=beer_name,brewery,style&limit=50`, {})
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        const rows = Array.isArray(body) ? body : [];
        const seen = new Set();
        const deduped = [];
        for (const r of rows) {
          const key = (r.beer_name || '').toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push({ beer_name: r.beer_name, brewery: r.brewery || '', style: r.style || '' });
          if (deduped.length >= 10) break;
        }
        res.json({ data: deduped });
      })
      .catch(next);
  });

  // GET /api/beers/:name — single beer: aggregated + all ratings + price history
  router.get('/:name', (req, res, next) => {
    const name = decodeURIComponent(req.params.name);
    const encoded = encodeURIComponent(name);
    Promise.all([
      rest('GET', `/beer_averages?beer_name=eq.${encoded}&limit=1`),
      rest('GET', `/ratings?beer_name=eq.${encoded}&order=created_at.desc`),
      rest('GET', `/price_logs?beer_name=eq.${encoded}&order=logged_at.desc&limit=100`),
    ])
      .then(([avgRes, ratingsRes, pricesRes]) => {
        if (avgRes.status >= 400) return res.status(avgRes.status).json(avgRes.body || { error: 'Upstream error' });
        const stats = Array.isArray(avgRes.body) && avgRes.body[0] ? avgRes.body[0] : null;
        const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
        const priceHistory = Array.isArray(pricesRes.body) ? pricesRes.body : [];
        res.json({
          beer_name: name,
          stats,
          ratings,
          price_history: priceHistory,
        });
      })
      .catch(next);
  });

  return router;
};
