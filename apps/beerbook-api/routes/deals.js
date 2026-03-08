/**
 * GET /api/deals?lat=&lng=&radius= — best beers near me right now (value by yg_per_dollar)
 * Phase 4.1: response includes truncated and pagination when results are capped.
 */
const express = require('express');

const DEFAULT_RADIUS = 5000;
const DEALS_RESPONSE_LIMIT = 100;

module.exports = function (opts) {
  const { rest } = opts;
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      const radius = parseInt(req.query.radius, 10) || DEFAULT_RADIUS;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: 'lat and lng query parameters required' });
      }
      const [venuesRes, menusRes, exchangeRes, hhRes] = await Promise.all([
        rest('POST', '/rpc/venues_within_radius', {
          body: JSON.stringify({ lat, lng, radius_m: radius }),
        }),
        rest('GET', '/venue_menus'),
        rest('GET', '/yg_exchange?limit=500'),
        rest('GET', '/happy_hours'),
      ]);
      if (venuesRes.status >= 400) return res.status(venuesRes.status).json(venuesRes.body || { error: 'Upstream error' });
      const venues = Array.isArray(venuesRes.body) ? venuesRes.body : [];
      const venueIds = new Set(venues.map((v) => v.id));
      const menus = Array.isArray(menusRes.body) ? menusRes.body : [];
      const exchange = Array.isArray(exchangeRes.body) ? exchangeRes.body : [];
      const happyHours = Array.isArray(hhRes.body) ? hhRes.body : [];
      const ygByBeer = new Map();
      exchange.forEach((row) => {
        const key = (row.beer_name || '').trim().toLowerCase();
        if (!key) return;
        ygByBeer.set(key, { yg_rate: Number(row.yg_rate) || 0, avg_stars: Number(row.avg_stars) || 0 });
      });
      const now = new Date();
      const dayOfWeek = now.getDay();
      const currentTime = now.toTimeString().slice(0, 5);
      const activeHHByVenue = new Map();
      happyHours.forEach((hh) => {
        if (Number(hh.day_of_week) !== dayOfWeek) return;
        const start = String(hh.start_time).slice(0, 5);
        const end = String(hh.end_time).slice(0, 5);
        if (currentTime >= start && currentTime <= end) {
          if (!activeHHByVenue.has(hh.venue_id)) activeHHByVenue.set(hh.venue_id, hh);
        }
      });
      function haversineMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      }
      const deals = [];
      for (const menuRow of menus) {
        if (!venueIds.has(menuRow.venue_id)) continue;
        const venue = venues.find((v) => v.id === menuRow.venue_id);
        if (!venue) continue;
        const distance_m = Math.round(haversineMeters(lat, lng, Number(venue.latitude), Number(venue.longitude)));
        const priceCents = Number(menuRow.price_cents) || 0;
        if (priceCents <= 0) continue;
        const priceDollars = priceCents / 100;
        const beerKey = (menuRow.beer_name || '').trim().toLowerCase();
        const ygInfo = ygByBeer.get(beerKey) || { yg_rate: 0, avg_stars: 0 };
        const ygRate = ygInfo.yg_rate;
        const ygPerDollar = ygRate > 0 ? ygRate / priceDollars : 0;
        const hh = activeHHByVenue.get(menuRow.venue_id);
        deals.push({
          beer_name: menuRow.beer_name,
          venue: {
            id: venue.id,
            name: venue.name,
            distance_m: distance_m,
          },
          price_cents: priceCents,
          is_happy_hour: !!hh,
          happy_hour_ends_at: hh ? String(hh.end_time).slice(0, 5) : null,
          yg_rate: ygRate,
          avg_stars: ygInfo.avg_stars,
          yg_per_dollar: Math.round(ygPerDollar * 100) / 100,
        });
      }
      deals.sort((a, b) => (b.yg_per_dollar || 0) - (a.yg_per_dollar || 0));
      const truncated = deals.length > DEALS_RESPONSE_LIMIT;
      const data = deals.slice(0, DEALS_RESPONSE_LIMIT);
      res.json({
        data,
        truncated,
        pagination: { limit: DEALS_RESPONSE_LIMIT, offset: 0, total: data.length },
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
