/**
 * YG Exchange: rate table, single beer cross-rates, portfolio
 */
const express = require('express');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const RATES_DEFAULT_LIMIT = 100;
const VALID_ORDER_COLUMNS = ['yg_rate', 'avg_stars', 'rating_count', 'beer_name'];

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

  // GET /api/exchange/rates — public, full rate table (array), optional order/search
  router.get('/rates', async (req, res, next) => {
    try {
      const orderBy = VALID_ORDER_COLUMNS.includes(req.query.order_by) ? req.query.order_by : 'yg_rate';
      const direction = req.query.direction === 'asc' ? 'asc' : 'desc';
      let limit = parseInt(req.query.limit, 10);
      if (!Number.isFinite(limit) || limit < 1) limit = RATES_DEFAULT_LIMIT;
      if (limit > MAX_LIMIT) limit = MAX_LIMIT;
      let offset = parseInt(req.query.offset, 10);
      if (!Number.isFinite(offset) || offset < 0) offset = 0;
      const q = (req.query.q || '').trim();

      let path = `/yg_exchange?order=${orderBy}.${direction}&limit=${limit}&offset=${offset}`;
      if (q) {
        const term = encodeURIComponent(`*${q}*`);
        path += `&or=(beer_name.ilike.${term},brewery.ilike.${term})`;
      }

      const { status, headers, body } = await rest('GET', path, { headers: { Prefer: 'count=exact' } });
      if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
      res.json(Array.isArray(body) ? body : []);
    } catch (e) {
      next(e);
    }
  });

  // GET /api/exchange — full rate table, paginated (legacy shape)
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

  // GET /api/exchange/portfolio/:user_id — public, user's YG-rated beers with community rate
  router.get('/portfolio/:user_id', async (req, res, next) => {
    try {
      const userId = req.params.user_id;
      const { status, body } = await rest('POST', '/rpc/exchange_portfolio', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: userId }),
      });
      if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
      res.json(Array.isArray(body) ? body : []);
    } catch (e) {
      next(e);
    }
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
