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

  // GET /api/beers/search?q=X — autocomplete from catalog (ref_beers/beers), top 10 unique beers
  router.get('/search', (req, res) => {
    const q = (req.query.q || '').trim().replace(/[%*]/g, '');
    if (!q || q.length < 2) return res.json({ data: [] });

    const like = encodeURIComponent(`*${q}*`);
    const url = `/beers?or=(name.ilike.${like},brewery_name.ilike.${like})&select=id,name,brewery_name,style,abv,review_overall,review_count&order=review_count.desc.nullslast,name.asc&limit=50`;

    rest('GET', url, {})
      .then(({ status, body }) => {
        if (status >= 400) return res.json({ data: [] });

        let rows = [];
        if (Array.isArray(body)) {
          rows = body;
        } else if (body && Array.isArray(body.data)) {
          rows = body.data;
        }

        const seen = new Set();
        const deduped = [];
        for (const row of rows) {
          const name = (row.name || row.beer_name || '').trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push({
            id: row.id || null,
            beer_name: name,
            brewery: (row.brewery_name || row.brewery || '').trim(),
            style: (row.style || '').trim(),
            abv: row.abv != null ? Number(row.abv) : null,
            review_overall: row.review_overall != null ? Number(row.review_overall) : null,
            review_count: row.review_count != null ? Number(row.review_count) : 0,
            source: 'catalog',
          });
          if (deduped.length >= 10) break;
        }

        return res.json({ data: deduped });
      })
      .catch((err) => {
        console.error('Beer search error:', err.message);
        return res.json({ data: [] });
      });
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
