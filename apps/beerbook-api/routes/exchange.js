/**
 * YG Exchange: rate table, single beer cross-rates, portfolio
 */
const express = require('express');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

module.exports = function (opts) {
  const { rest, totalFromContentRange } = opts;
  const router = express.Router();

  function parsePag(req) {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    let offset = parseInt(req.query.offset, 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    return { limit, offset };
  }

  // GET /api/exchange — full rate table, paginated
  router.get('/', (req, res, next) => {
    const { limit, offset } = parsePag(req);
    rest('GET', `/yg_exchange?limit=${limit}&offset=${offset}`, { headers: { Prefer: 'count=exact' } })
      .then(({ status, headers, body }) => {
        const total = totalFromContentRange(headers['content-range']) ?? (Array.isArray(body) ? body.length : 0);
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        res.json({ data: Array.isArray(body) ? body : [], pagination: { limit, offset, total } });
      })
      .catch(next);
  });

  // GET /api/exchange/portfolio/:user_id
  router.get('/portfolio/:user_id', (req, res, next) => {
    const uid = encodeURIComponent(req.params.user_id);
    rest('GET', `/ratings?user_id=eq.${uid}&yg_value=not.is.null&select=id,beer_name,brewery,style,yg_value,rating,created_at`)
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        const ratings = Array.isArray(body) ? body : [];
        const totalPortfolioValue = ratings.reduce((sum, r) => sum + (Number(r.yg_value) || 0), 0);
        res.json({ ratings, total_portfolio_value: Math.round(totalPortfolioValue * 100) / 100 });
      })
      .catch(next);
  });

  // GET /api/exchange/:beer_name — single beer YG rate + cross-rates vs top 10
  router.get('/:beer_name', async (req, res, next) => {
    try {
      const beerName = decodeURIComponent(req.params.beer_name);
      const encoded = encodeURIComponent(beerName);
      const { status, body } = await rest('GET', `/yg_exchange?beer_name=eq.${encoded}&limit=1`);
      if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
      const beer = Array.isArray(body) && body[0] ? body[0] : null;
      if (!beer) return res.status(404).json({ error: 'Beer not found in YG exchange' });
      const topRes = await rest('GET', `/yg_exchange?order=yg_rate.desc&limit=11`);
      if (topRes.status >= 400) return res.status(topRes.status).json(topRes.body || { error: 'Upstream error' });
      const all = Array.isArray(topRes.body) ? topRes.body : [];
      const top10 = all.filter((b) => (b.beer_name || '').toString() !== beerName).slice(0, 10);
      const ygA = Number(beer.yg_rate) || 0;
      const crossRates = top10.map((b) => {
        const ygB = Number(b.yg_rate) || 0;
        const crossRate = ygB > 0 ? ygA / ygB : null;
        return { beer_name: b.beer_name, brewery: b.brewery, yg_rate: b.yg_rate, cross_rate: crossRate };
      });
      res.json({ beer, cross_rates: crossRates });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
