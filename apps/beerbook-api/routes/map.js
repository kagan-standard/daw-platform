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
    rest('GET', '/ratings?latitude=not.is.null&longitude=not.is.null&select=id,beer_name,brewery,style,user_id,user_name,latitude,longitude,location_name,venue_id,rating,created_at')
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

  // GET /api/map/venues — venue-centric map data with aggregated rating stats
  router.get('/venues', async (req, res, next) => {
    try {
      const [venuesRes, ratingsRes] = await Promise.all([
        rest('GET', '/venues?select=id,name,latitude,longitude,created_by,created_at'),
        rest('GET', '/ratings?venue_id=not.is.null&select=id,beer_name,rating,venue_id,created_at'),
      ]);
      if (venuesRes.status >= 400) {
        return res.status(venuesRes.status).json(venuesRes.body || { error: 'Upstream error' });
      }
      if (ratingsRes.status >= 400) {
        return res.status(ratingsRes.status).json(ratingsRes.body || { error: 'Upstream error' });
      }

      const venues = Array.isArray(venuesRes.body) ? venuesRes.body : [];
      const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
      const aggByVenue = new Map();

      ratings.forEach((r) => {
        const venueId = r?.venue_id ? String(r.venue_id) : null;
        if (!venueId) return;
        if (!aggByVenue.has(venueId)) {
          aggByVenue.set(venueId, {
            rating_count: 0,
            rating_sum: 0,
            last_rated_at: null,
            beers: new Map(),
          });
        }
        const agg = aggByVenue.get(venueId);
        agg.rating_count += 1;
        const ratingNum = Number(r.rating);
        if (Number.isFinite(ratingNum)) agg.rating_sum += ratingNum;
        if (r.created_at && (!agg.last_rated_at || new Date(r.created_at).getTime() > new Date(agg.last_rated_at).getTime())) {
          agg.last_rated_at = r.created_at;
        }
        const beerName = (r.beer_name || '').trim();
        if (beerName) {
          const key = beerName.toLowerCase();
          const prev = agg.beers.get(key) || { name: beerName, count: 0 };
          prev.count += 1;
          agg.beers.set(key, prev);
        }
      });

      const data = venues
        .filter((v) => Number.isFinite(Number(v.latitude)) && Number.isFinite(Number(v.longitude)))
        .map((v) => {
          const agg = aggByVenue.get(String(v.id));
          const ratingCount = agg ? agg.rating_count : 0;
          const avgRating = ratingCount > 0 ? Number((agg.rating_sum / ratingCount).toFixed(2)) : null;
          const beersList = agg ? [...agg.beers.values()] : [];
          beersList.sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
          return {
            id: v.id,
            name: v.name,
            latitude: Number(v.latitude),
            longitude: Number(v.longitude),
            rating_count: ratingCount,
            avg_rating: avgRating,
            unique_beers: beersList.length,
            last_rated_at: agg ? agg.last_rated_at : null,
            top_beer: beersList[0] ? beersList[0].name : null,
            created_by: v.created_by ?? null,
            created_at: v.created_at ?? null,
          };
        });

      res.json({ data });
    } catch (err) {
      next(err);
    }
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
