/**
 * Map: geotagged ratings for pins; user beer trail
 */
const express = require('express');

module.exports = function (opts) {
  const { rest, authMiddleware } = opts;
  const router = express.Router();

  function roundCoord(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 1000) / 1000;
  }

  // GET /api/map — all geotagged ratings with venue info (for Leaflet pins)
  router.get('/', (req, res, next) => {
    rest('GET', '/ratings?latitude=not.is.null&longitude=not.is.null&select=id,beer_name,brewery,user_id,user_name,latitude,longitude,location_name,venue_id,rating,created_at')
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        let list = (Array.isArray(body) ? body : []).map((r) => ({
          ...r,
          latitude: roundCoord(r.latitude),
          longitude: roundCoord(r.longitude),
        }));
        const venueIds = [...new Set(list.map((r) => r.venue_id).filter(Boolean))];
        if (venueIds.length === 0) return res.json({ data: list });
        const inList = venueIds.map((id) => encodeURIComponent(id)).join(',');
        return rest('GET', `/venues?id=in.(${inList})`).then((vRes) => {
          const venues = Array.isArray(vRes.body) ? vRes.body : [];
          const byId = Object.fromEntries(venues.map((v) => [v.id, v]));
          list = list.map((r) => ({ ...r, venue: r.venue_id ? byId[r.venue_id] : null }));
          res.json({ data: list });
        });
      })
      .catch(next);
  });

  // GET /api/map/user/:id — single user's beer trail (geotagged, chronological)
  router.get('/user/:id', authMiddleware, (req, res, next) => {
    const id = encodeURIComponent(req.params.id);
    rest('GET', `/ratings?user_id=eq.${id}&latitude=not.is.null&longitude=not.is.null&order=created_at.asc`)
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        res.json({ data: Array.isArray(body) ? body : [] });
      })
      .catch(next);
  });

  return router;
};
