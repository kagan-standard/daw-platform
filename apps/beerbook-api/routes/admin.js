const express = require('express');

const USER_SORT_WHITELIST = new Set(['last_active', 'total_ratings', 'created_at']);
const ORDER_WHITELIST = new Set(['asc', 'desc']);

function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseWindow(req) {
  const to = toIsoDate(req.query.to) || new Date().toISOString();
  const from = toIsoDate(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function uniqueCount(list, selector) {
  return new Set((list || []).map(selector).filter(Boolean)).size;
}

module.exports = function adminRoutes(opts) {
  const router = express.Router();
  const { rest, authMiddleware, adminMiddleware, totalFromContentRange } = opts;

  router.use(authMiddleware, adminMiddleware);

  // GET /api/admin/users
  router.get('/users', async (req, res, next) => {
    try {
      const sort = USER_SORT_WHITELIST.has(req.query.sort) ? req.query.sort : 'last_active';
      const order = ORDER_WHITELIST.has(req.query.order) ? req.query.order : 'desc';
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const search = String(req.query.search || '').trim();

      let profilePath = '/profiles?select=id,display_name,email,created_at&limit=5000&order=created_at.desc';
      if (search) {
        const term = encodeURIComponent(`*${search.replace(/%/g, '')}*`);
        profilePath += `&or=(display_name.ilike.${term},email.ilike.${term})`;
      }

      const [profilesRes, ratingsRes] = await Promise.all([
        rest('GET', profilePath),
        rest('GET', '/ratings?select=id,user_id,style,venue_id,rating,created_at&limit=20000'),
      ]);

      if (profilesRes.status >= 400) {
        return res.status(profilesRes.status).json(profilesRes.body || { error: 'Failed to fetch profiles' });
      }
      if (ratingsRes.status >= 400) {
        return res.status(ratingsRes.status).json(ratingsRes.body || { error: 'Failed to fetch ratings' });
      }

      const profiles = Array.isArray(profilesRes.body) ? profilesRes.body : [];
      const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];

      const byUser = new Map();
      ratings.forEach((r) => {
        if (!r.user_id) return;
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
        byUser.get(r.user_id).push(r);
      });

      const rows = profiles.map((p) => {
        const mine = byUser.get(p.id) || [];
        const avg = mine.length ? mine.reduce((sum, r) => sum + numberOrZero(r.rating), 0) / mine.length : null;
        const lastActive = mine.reduce((max, r) => {
          if (!r.created_at) return max;
          const ts = new Date(r.created_at).getTime();
          return Number.isFinite(ts) && ts > max ? ts : max;
        }, 0);

        return {
          id: p.id,
          display_name: p.display_name || '',
          email: p.email || null,
          created_at: p.created_at || null,
          total_ratings: mine.length,
          unique_styles: uniqueCount(mine, (r) => r.style),
          unique_venues: uniqueCount(mine, (r) => r.venue_id),
          last_active: lastActive ? new Date(lastActive).toISOString() : null,
          avg_rating: avg == null ? null : Math.round(avg * 100) / 100,
        };
      });

      rows.sort((a, b) => {
        const dir = order === 'asc' ? 1 : -1;
        if (sort === 'created_at') {
          return dir * (new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
        }
        if (sort === 'total_ratings') {
          return dir * (numberOrZero(a.total_ratings) - numberOrZero(b.total_ratings));
        }
        return dir * (new Date(a.last_active || 0).getTime() - new Date(b.last_active || 0).getTime());
      });

      const paged = rows.slice(offset, offset + limit);
      res.json({
        data: paged,
        pagination: { limit, offset, total: rows.length },
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/admin/users/:id
  router.get('/users/:id', async (req, res, next) => {
    try {
      const id = encodeURIComponent(req.params.id);
      const [profileRes, ratingsRes, clicksRes, viewsRes, givenRes] = await Promise.all([
        rest('GET', `/profiles?id=eq.${id}&limit=1`),
        rest('GET', `/ratings?user_id=eq.${id}&order=created_at.desc&limit=1000`),
        rest('GET', `/referral_clicks?user_id=eq.${id}&order=created_at.desc&limit=500`),
        rest('GET', `/page_views?user_id=eq.${id}&order=created_at.desc&limit=1`, { headers: { Prefer: 'count=exact' } }),
        rest('GET', `/reactions?user_id=eq.${id}&reaction_type=eq.cheers&limit=1`, { headers: { Prefer: 'count=exact' } }),
      ]);

      if (profileRes.status >= 400) return res.status(profileRes.status).json(profileRes.body || { error: 'Failed to fetch user' });
      if (ratingsRes.status >= 400) return res.status(ratingsRes.status).json(ratingsRes.body || { error: 'Failed to fetch ratings' });
      if (clicksRes.status >= 400) return res.status(clicksRes.status).json(clicksRes.body || { error: 'Failed to fetch referrals' });
      if (viewsRes.status >= 400) return res.status(viewsRes.status).json(viewsRes.body || { error: 'Failed to fetch page views' });
      if (givenRes.status >= 400) return res.status(givenRes.status).json(givenRes.body || { error: 'Failed to fetch reactions' });

      const profile = Array.isArray(profileRes.body) ? profileRes.body[0] : null;
      if (!profile) return res.status(404).json({ error: 'User not found' });

      const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
      const ratingIds = ratings.map((r) => r.id).filter(Boolean);
      let cheersReceived = 0;

      if (ratingIds.length > 0) {
        const idList = ratingIds.join(',');
        const receivedRes = await rest(
          'GET',
          `/reactions?rating_id=in.(${idList})&reaction_type=eq.cheers&limit=1`,
          { headers: { Prefer: 'count=exact' } }
        );
        if (receivedRes.status < 400) {
          cheersReceived = totalFromContentRange(receivedRes.headers['content-range']) ?? 0;
        }
      }

      res.json({
        profile,
        ratings,
        reaction_counts: {
          cheers_given: totalFromContentRange(givenRes.headers['content-range']) ?? 0,
          cheers_received: cheersReceived,
        },
        referral_clicks: Array.isArray(clicksRes.body) ? clicksRes.body : [],
        total_page_views: totalFromContentRange(viewsRes.headers['content-range']) ?? 0,
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/admin/stats
  router.get('/stats', async (req, res, next) => {
    try {
      const now = Date.now();
      const oneDay = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const sevenDays = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDays = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        usersRes,
        ratingsRes,
        venuesRes,
        clicksRes,
        ratingsWeekRes,
        ratingsMonthRes,
        ratingsDayRes,
        usersWeekRes,
        usersMonthRes,
      ] = await Promise.all([
        rest('GET', '/profiles?select=id&limit=1', { headers: { Prefer: 'count=exact' } }),
        rest('GET', '/ratings?select=id,beer_name,venue_id,user_id,created_at&limit=20000'),
        rest('GET', '/venues?select=id&limit=1', { headers: { Prefer: 'count=exact' } }),
        rest('GET', '/referral_clicks?select=id&limit=1', { headers: { Prefer: 'count=exact' } }),
        rest('GET', `/ratings?select=beer_name,venue_id,created_at,user_id&created_at=gte.${encodeURIComponent(sevenDays)}&limit=5000`),
        rest('GET', `/ratings?select=id,user_id,created_at&created_at=gte.${encodeURIComponent(thirtyDays)}&limit=20000`),
        rest('GET', `/ratings?select=id,user_id,created_at&created_at=gte.${encodeURIComponent(oneDay)}&limit=20000`),
        rest('GET', `/profiles?select=id&created_at=gte.${encodeURIComponent(sevenDays)}&limit=1`, { headers: { Prefer: 'count=exact' } }),
        rest('GET', `/profiles?select=id&created_at=gte.${encodeURIComponent(thirtyDays)}&limit=1`, { headers: { Prefer: 'count=exact' } }),
      ]);

      if ([usersRes, ratingsRes, venuesRes, clicksRes, ratingsWeekRes, ratingsMonthRes, ratingsDayRes, usersWeekRes, usersMonthRes].some((r) => r.status >= 400)) {
        return res.status(502).json({ error: 'Failed to compute stats' });
      }

      const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
      const weekRatings = Array.isArray(ratingsWeekRes.body) ? ratingsWeekRes.body : [];
      const monthRatings = Array.isArray(ratingsMonthRes.body) ? ratingsMonthRes.body : [];
      const dayRatings = Array.isArray(ratingsDayRes.body) ? ratingsDayRes.body : [];

      const beerWeekCounts = {};
      const venueWeekCounts = {};
      weekRatings.forEach((r) => {
        if (r.beer_name) beerWeekCounts[r.beer_name] = (beerWeekCounts[r.beer_name] || 0) + 1;
        if (r.venue_id) venueWeekCounts[r.venue_id] = (venueWeekCounts[r.venue_id] || 0) + 1;
      });

      const top_beers_this_week = Object.entries(beerWeekCounts)
        .map(([beer_name, count]) => ({ beer_name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const top_venues_this_week = Object.entries(venueWeekCounts)
        .map(([venue_id, count]) => ({ venue_id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      res.json({
        total_users: totalFromContentRange(usersRes.headers['content-range']) ?? 0,
        total_ratings: ratings.length,
        total_beers_rated: uniqueCount(ratings, (r) => (r.beer_name || '').toLowerCase()),
        total_venues: totalFromContentRange(venuesRes.headers['content-range']) ?? 0,
        total_referral_clicks: totalFromContentRange(clicksRes.headers['content-range']) ?? 0,
        dau: uniqueCount(dayRatings, (r) => r.user_id),
        wau: uniqueCount(weekRatings, (r) => r.user_id),
        mau: uniqueCount(monthRatings, (r) => r.user_id),
        ratings_today: dayRatings.length,
        ratings_this_week: weekRatings.length,
        ratings_this_month: monthRatings.length,
        new_users_this_week: totalFromContentRange(usersWeekRes.headers['content-range']) ?? 0,
        new_users_this_month: totalFromContentRange(usersMonthRes.headers['content-range']) ?? 0,
        top_beers_this_week,
        top_venues_this_week,
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/admin/referrals
  router.get('/referrals', async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const { from, to } = parseWindow(req);
      const targetType = String(req.query.target_type || '').trim();
      const targetId = String(req.query.target_id || '').trim();
      const userId = String(req.query.user_id || '').trim();
      const validTargetTypes = new Set(['brewery', 'venue', 'beer', 'external']);
      if (targetType && !validTargetTypes.has(targetType)) {
        return res.status(400).json({ error: 'Invalid target_type' });
      }

      let path = `/referral_clicks?order=created_at.desc&limit=${limit}&offset=${offset}`;
      if (targetType) path += `&target_type=eq.${encodeURIComponent(targetType)}`;
      if (targetId) path += `&target_id=eq.${encodeURIComponent(targetId)}`;
      if (userId) path += `&user_id=eq.${encodeURIComponent(userId)}`;
      path += `&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}`;

      const out = await rest('GET', path, { headers: { Prefer: 'count=exact' } });
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Failed to fetch referrals' });

      res.json({
        data: Array.isArray(out.body) ? out.body : [],
        pagination: {
          limit,
          offset,
          total: totalFromContentRange(out.headers['content-range']) ?? 0,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/admin/referrals/summary
  router.get('/referrals/summary', async (req, res, next) => {
    try {
      const { from, to } = parseWindow(req);
      const rangePath = `&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}`;
      const out = await rest('GET', `/referral_clicks?order=created_at.desc&limit=20000${rangePath}`);
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Failed to fetch summary' });

      let rows = Array.isArray(out.body) ? out.body : [];
      const targetTypeFilter = String(req.query.target_type || '').trim();
      if (targetTypeFilter) rows = rows.filter((r) => r.target_type === targetTypeFilter);

      const byType = {};
      const breweryAgg = {};
      const venueAgg = {};
      const byDay = {};

      rows.forEach((r) => {
        const t = r.target_type || 'external';
        if (!byType[t]) byType[t] = { clicks: 0, users: new Set(), targets: new Set() };
        byType[t].clicks += 1;
        if (r.user_id) byType[t].users.add(r.user_id);
        if (r.target_id) byType[t].targets.add(r.target_id);

        if (t === 'brewery') {
          const key = r.target_id || r.target_name || 'unknown';
          if (!breweryAgg[key]) breweryAgg[key] = { target_id: r.target_id || null, target_name: r.target_name || 'Unknown', clicks: 0, users: new Set() };
          breweryAgg[key].clicks += 1;
          if (r.user_id) breweryAgg[key].users.add(r.user_id);
        }
        if (t === 'venue') {
          const key = r.target_id || r.target_name || 'unknown';
          if (!venueAgg[key]) venueAgg[key] = { target_id: r.target_id || null, target_name: r.target_name || 'Unknown', clicks: 0, users: new Set() };
          venueAgg[key].clicks += 1;
          if (r.user_id) venueAgg[key].users.add(r.user_id);
        }

        const day = (r.created_at || '').slice(0, 10);
        if (day) byDay[day] = (byDay[day] || 0) + 1;
      });

      const toList = (obj, limit) => Object.values(obj)
        .map((x) => ({ ...x, unique_users: x.users.size }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, limit)
        .map((x) => ({ target_id: x.target_id, target_name: x.target_name, clicks: x.clicks, unique_users: x.unique_users }));

      const daily_trend = Object.entries(byDay)
        .map(([date, clicks]) => ({ date, clicks }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        total_clicks: rows.length,
        period: { from: from.slice(0, 10), to: to.slice(0, 10) },
        by_target_type: Object.fromEntries(
          Object.entries(byType).map(([k, v]) => [
            k,
            { clicks: v.clicks, unique_users: v.users.size, unique_targets: v.targets.size },
          ])
        ),
        top_breweries: toList(breweryAgg, 20),
        top_venues: toList(venueAgg, 20),
        daily_trend,
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/admin/traffic
  router.get('/traffic', async (req, res, next) => {
    try {
      const { from, to } = parseWindow(req);
      const out = await rest(
        'GET',
        `/page_views?order=created_at.desc&limit=20000&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}`
      );
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Failed to fetch traffic' });

      const rows = Array.isArray(out.body) ? out.body : [];
      const topPages = {};
      const byDay = {};
      const uniqueSessions = new Set();
      const uniqueUsers = new Set();

      rows.forEach((r) => {
        const page = r.page_path || '/';
        if (!topPages[page]) topPages[page] = { page_path: page, views: 0, users: new Set() };
        topPages[page].views += 1;
        if (r.user_id) topPages[page].users.add(r.user_id);
        if (r.session_id) uniqueSessions.add(r.session_id);
        if (r.user_id) uniqueUsers.add(r.user_id);

        const day = (r.created_at || '').slice(0, 10);
        if (!day) return;
        if (!byDay[day]) byDay[day] = { date: day, views: 0, sessions: new Set() };
        byDay[day].views += 1;
        if (r.session_id) byDay[day].sessions.add(r.session_id);
      });

      const top_pages = Object.values(topPages)
        .map((p) => ({ page_path: p.page_path, views: p.views, unique_users: p.users.size }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 20);

      const daily_trend = Object.values(byDay)
        .map((d) => ({ date: d.date, views: d.views, unique_sessions: d.sessions.size }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        total_views: rows.length,
        unique_sessions: uniqueSessions.size,
        unique_users: uniqueUsers.size,
        period: { from: from.slice(0, 10), to: to.slice(0, 10) },
        top_pages,
        daily_trend,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
