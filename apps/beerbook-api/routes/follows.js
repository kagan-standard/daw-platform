const express = require('express');

function parseLimitOffset(req) {
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;
  let offset = parseInt(req.query.offset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

function buildInClause(ids) {
  return ids.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
}

async function getProfilesByIds(rest, ids) {
  if (!ids.length) return [];
  const inClause = buildInClause(ids);
  const [profilesRes, ratingsRes] = await Promise.all([
    rest('GET', `/profiles?id=in.(${inClause})&select=id,display_name,avatar_url&limit=${ids.length}`),
    rest('GET', `/ratings?user_id=in.(${inClause})&select=user_id&limit=5000`),
  ]);
  if (profilesRes.status >= 400) return [];
  const profiles = Array.isArray(profilesRes.body) ? profilesRes.body : [];
  const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
  const counts = {};
  ratings.forEach((r) => {
    const key = r.user_id;
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return profiles.map((p) => ({
    id: p.id,
    display_name: p.display_name || 'Beer Lover',
    avatar_url: p.avatar_url || null,
    rating_count: counts[p.id] || 0,
  }));
}

module.exports = function (opts) {
  const { rest, authMiddleware, totalFromContentRange } = opts;
  const router = express.Router();

  // POST /api/follows/:userId -> toggle follow
  router.post('/follows/:userId', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const target = String(req.params.userId || '').trim();
      if (!target) return res.status(400).json({ error: 'Target user is required' });
      if (target === me) return res.status(400).json({ error: 'Cannot follow yourself' });

      const existsRes = await rest(
        'GET',
        `/follows?follower_id=eq.${encodeURIComponent(me)}&followed_id=eq.${encodeURIComponent(target)}&limit=1`
      );
      if (existsRes.status >= 400) {
        return res.status(existsRes.status).json(existsRes.body || { error: 'Upstream error' });
      }
      const exists = Array.isArray(existsRes.body) && existsRes.body.length > 0;
      if (exists) {
        const delRes = await rest(
          'DELETE',
          `/follows?follower_id=eq.${encodeURIComponent(me)}&followed_id=eq.${encodeURIComponent(target)}`
        );
        if (delRes.status >= 400) return res.status(502).json({ error: 'Unfollow failed' });
        return res.json({ following: false });
      }

      const insertRes = await rest('POST', '/follows', {
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ follower_id: me, followed_id: target }),
      });
      if (insertRes.status >= 400) {
        return res.status(insertRes.status).json(insertRes.body || { error: 'Follow failed' });
      }
      return res.json({ following: true });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/follows/:userId/followers
  router.get('/follows/:userId/followers', async (req, res, next) => {
    try {
      const { limit, offset } = parseLimitOffset(req);
      const target = String(req.params.userId || '').trim();
      const followsRes = await rest(
        'GET',
        `/follows?followed_id=eq.${encodeURIComponent(target)}&select=follower_id&limit=${limit}&offset=${offset}`,
        { headers: { Prefer: 'count=exact' } }
      );
      if (followsRes.status >= 400) {
        return res.status(followsRes.status).json(followsRes.body || { error: 'Upstream error' });
      }
      const rows = Array.isArray(followsRes.body) ? followsRes.body : [];
      const ids = rows.map((r) => r.follower_id).filter(Boolean);
      const profiles = await getProfilesByIds(rest, ids);
      const total = totalFromContentRange(followsRes.headers['content-range']) ?? profiles.length;
      res.json({ data: profiles, pagination: { limit, offset, total } });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/follows/:userId/following
  router.get('/follows/:userId/following', async (req, res, next) => {
    try {
      const { limit, offset } = parseLimitOffset(req);
      const target = String(req.params.userId || '').trim();
      const followsRes = await rest(
        'GET',
        `/follows?follower_id=eq.${encodeURIComponent(target)}&select=followed_id&limit=${limit}&offset=${offset}`,
        { headers: { Prefer: 'count=exact' } }
      );
      if (followsRes.status >= 400) {
        return res.status(followsRes.status).json(followsRes.body || { error: 'Upstream error' });
      }
      const rows = Array.isArray(followsRes.body) ? followsRes.body : [];
      const ids = rows.map((r) => r.followed_id).filter(Boolean);
      const profiles = await getProfilesByIds(rest, ids);
      const total = totalFromContentRange(followsRes.headers['content-range']) ?? profiles.length;
      res.json({ data: profiles, pagination: { limit, offset, total } });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/follows/:userId/status
  router.get('/follows/:userId/status', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const target = String(req.params.userId || '').trim();
      if (!target) return res.json({ is_following: false });
      const out = await rest(
        'GET',
        `/follows?follower_id=eq.${encodeURIComponent(me)}&followed_id=eq.${encodeURIComponent(target)}&limit=1`
      );
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Upstream error' });
      const isFollowing = Array.isArray(out.body) && out.body.length > 0;
      res.json({ is_following: isFollowing });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
