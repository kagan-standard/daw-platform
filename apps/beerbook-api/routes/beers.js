/**
 * Beer endpoints: list, single, search autocomplete
 * IMPORTANT: Autocomplete must search ref_beers catalog. See bug history — do not change this without testing.
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

  // GET /api/beers — with q: catalog search via search_beer_catalog(); without q: paginated from beer_averages
  router.get('/', (req, res, next) => {
    const q = (req.query.q || '').trim();
    if (q) {
      let limit = parseInt(req.query.limit, 10);
      if (!Number.isFinite(limit) || limit < 1) limit = 10;
      if (limit > 50) limit = 50;
      rest('POST', '/rpc/search_beer_catalog', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_term: q, max_results: limit }),
      })
        .then(({ status, body }) => {
          if (status >= 400) return res.status(status >= 500 ? 502 : status).json(body || { error: 'Catalog search failed' });
          const data = Array.isArray(body) ? body : [];
          res.json({ data, pagination: { limit, offset: 0, total: data.length } });
        })
        .catch(next);
      return;
    }
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

  // GET /api/beers/search?q=X — autocomplete from catalog via search_beer_catalog() (trigram + prefix)
  router.get('/search', (req, res, next) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ data: [], pagination: { limit: 10, offset: 0, total: 0 } });

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    rest('POST', '/rpc/search_beer_catalog', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search_term: q, max_results: limit }),
    })
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status >= 500 ? 502 : status).json(body || { error: 'Catalog search failed' });
        const data = Array.isArray(body) ? body : [];
        res.json({ data, pagination: { limit, offset: 0, total: data.length } });
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
