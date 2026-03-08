/**
 * Venues, prices, happy hours
 */
const express = require('express');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_RADIUS = 5000;

module.exports = function (opts) {
  const { rest, totalFromContentRange } = opts;
  const router = express.Router({ mergeParams: true });

  function parsePag(req) {
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    let offset = parseInt(req.query.offset, 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    return { limit, offset };
  }

  // GET /api/venues — paginated; optional ?lat=&lng=&radius= (meters)
  router.get('/', (req, res, next) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseInt(req.query.radius, 10) || DEFAULT_RADIUS;
    const { limit, offset } = parsePag(req);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      rest('POST', '/rpc/venues_within_radius', {
        body: JSON.stringify({ lat, lng, radius_m: radius }),
      })
        .then(({ status, body }) => {
          if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
          const list = Array.isArray(body) ? body : [];
          const total = list.length;
          const paginated = list.slice(offset, offset + limit);
          res.json({ data: paginated, pagination: { limit, offset, total } });
        })
        .catch(next);
    } else {
      rest('GET', `/venues?limit=${limit}&offset=${offset}&order=name.asc`, { headers: { Prefer: 'count=exact' } })
        .then(({ status, headers, body }) => {
          const total = totalFromContentRange(headers['content-range']) ?? (Array.isArray(body) ? body.length : 0);
          if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
          res.json({ data: Array.isArray(body) ? body : [], pagination: { limit, offset, total } });
        })
        .catch(next);
    }
  });

  // POST /api/venues — auth required
  router.post('/', opts.authMiddleware, (req, res, next) => {
    const { sub } = req.claims;
    const b = req.body || {};
    const name = b.name || b.venueName;
    const latitude = b.latitude ?? b.lat;
    const longitude = b.longitude ?? b.lng;
    if (!name || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'name, latitude, and longitude required' });
    }
    const record = {
      name,
      address: b.address ?? null,
      latitude: Number(latitude),
      longitude: Number(longitude),
      created_by: sub,
    };
    rest('POST', '/venues', { headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) })
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Insert failed' });
        const row = Array.isArray(body) ? body[0] : body;
        res.status(201).json(row || record);
      })
      .catch(next);
  });

  // GET /api/venues/:id — detail: venue + latest prices + happy hours + ratings at venue
  router.get('/:id', (req, res, next) => {
    const id = encodeURIComponent(req.params.id);
    Promise.all([
      rest('GET', `/venues?id=eq.${id}&limit=1`),
      rest('GET', `/venue_menus?venue_id=eq.${id}`),
      rest('GET', `/happy_hours?venue_id=eq.${id}&order=day_of_week.asc`),
      rest('GET', `/ratings?venue_id=eq.${id}&order=created_at.desc&limit=50`),
    ])
      .then(([vRes, menusRes, hhRes, ratingsRes]) => {
        if (vRes.status >= 400) return res.status(vRes.status).json(vRes.body || { error: 'Upstream error' });
        const venue = Array.isArray(vRes.body) && vRes.body[0] ? vRes.body[0] : null;
        if (!venue) return res.status(404).json({ error: 'Venue not found' });
        const prices = Array.isArray(menusRes.body) ? menusRes.body : [];
        const happyHours = Array.isArray(hhRes.body) ? hhRes.body : [];
        const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
        res.json({
          ...venue,
          venue,
          prices,
          happy_hours: happyHours,
          ratings,
        });
      })
      .catch(next);
  });

  // GET /api/venues/:id/prices
  router.get('/:id/prices', (req, res, next) => {
    const id = encodeURIComponent(req.params.id);
    const { limit, offset } = parsePag(req);
    rest('GET', `/price_logs?venue_id=eq.${id}&order=logged_at.desc&limit=${limit}&offset=${offset}`, {
      headers: { Prefer: 'count=exact' },
    })
      .then(({ status, headers, body }) => {
        const total = totalFromContentRange(headers['content-range']) ?? (Array.isArray(body) ? body.length : 0);
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        res.json({ data: Array.isArray(body) ? body : [], pagination: { limit, offset, total } });
      })
      .catch(next);
  });

  // POST /api/venues/:id/prices
  router.post('/:id/prices', opts.authMiddleware, (req, res, next) => {
    const venueId = encodeURIComponent(req.params.id);
    const { sub } = req.claims;
    const b = req.body || {};
    const beer_name = b.beer_name || b.beerName;
    const price_cents = b.price_cents ?? b.priceCents;
    if (!beer_name || price_cents == null || isNaN(Number(price_cents)) || Number(price_cents) < 1) {
      return res.status(400).json({ error: 'beer_name and price_cents (positive) required' });
    }
    const record = {
      venue_id: req.params.id,
      beer_name,
      style: b.style ?? null,
      price_cents: Number(price_cents),
      is_happy_hour: !!b.is_happy_hour,
      logged_by: sub,
    };
    rest('POST', '/price_logs', { headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) })
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Insert failed' });
        const row = Array.isArray(body) ? body[0] : body;
        res.status(201).json(row || record);
      })
      .catch(next);
  });

  // POST /api/venues/:id/prices/:priceId/confirm (Phase 3.1: atomic RPC)
  router.post('/:id/prices/:priceId/confirm', opts.authMiddleware, (req, res, next) => {
    const priceId = req.params.priceId;
    const venueId = req.params.id;
    rest('POST', '/rpc/confirm_venue_price', {
      body: JSON.stringify({ p_price_id: priceId, p_venue_id: venueId }),
    })
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        const rows = Array.isArray(body) ? body : [];
        if (rows.length === 0) return res.status(404).json({ error: 'Price log not found' });
        res.json({ ok: true });
      })
      .catch(next);
  });

  // GET /api/venues/:id/happy-hours
  router.get('/:id/happy-hours', (req, res, next) => {
    const id = encodeURIComponent(req.params.id);
    rest('GET', `/happy_hours?venue_id=eq.${id}&order=day_of_week.asc`)
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        res.json({ data: Array.isArray(body) ? body : [] });
      })
      .catch(next);
  });

  // POST /api/venues/:id/happy-hours
  router.post('/:id/happy-hours', opts.authMiddleware, (req, res, next) => {
    const { sub } = req.claims;
    const b = req.body || {};
    const day_of_week = b.day_of_week ?? b.dayOfWeek;
    const start_time = b.start_time ?? b.startTime;
    const end_time = b.end_time ?? b.endTime;
    const description = b.description || '';
    if (day_of_week == null || day_of_week < 0 || day_of_week > 6 || !start_time || !end_time) {
      return res.status(400).json({ error: 'day_of_week (0-6), start_time, end_time, description required' });
    }
    const record = {
      venue_id: req.params.id,
      day_of_week: Number(day_of_week),
      start_time,
      end_time,
      description,
      reported_by: sub,
    };
    rest('POST', '/happy_hours', { headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) })
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Insert failed' });
        const row = Array.isArray(body) ? body[0] : body;
        res.status(201).json(row || record);
      })
      .catch(next);
  });

  // POST/PATCH /api/venues/:id/happy-hours/:hhId/confirm (Phase 3.1: atomic RPC)
  const confirmHappyHourHandler = (req, res, next) => {
    const hhId = req.params.hhId;
    const venueId = req.params.id;
    rest('POST', '/rpc/confirm_happy_hour', {
      body: JSON.stringify({ p_hh_id: hhId, p_venue_id: venueId }),
    })
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        const rows = Array.isArray(body) ? body : [];
        if (rows.length === 0) return res.status(404).json({ error: 'Happy hour not found' });
        res.json({ ok: true });
      })
      .catch(next);
  };
  router.post('/:id/happy-hours/:hhId/confirm', opts.authMiddleware, confirmHappyHourHandler);
  router.patch('/:id/happy-hours/:hhId/confirm', opts.authMiddleware, confirmHappyHourHandler);

  return router;
};
