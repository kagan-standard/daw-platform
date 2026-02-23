/**
 * Activity feed, cheers, user profile & stats
 */
const express = require('express');
const { awardTabsForCheers } = require('../lib/tabs');

module.exports = function (opts) {
  const { rest } = opts;
  const router = express.Router();

  async function attachCheersData(ratings, requester) {
    if (!Array.isArray(ratings) || !ratings.length) return ratings;
    const ratingIds = [...new Set(ratings.map((r) => String(r?.id || '').trim()).filter(Boolean))];
    if (!ratingIds.length) return ratings;
    const idList = ratingIds.map((id) => encodeURIComponent(id)).join(',');
    if (!idList) return ratings;

    const [allCheersRes, myCheersRes] = await Promise.all([
      rest('GET', `/reactions?rating_id=in.(${idList})&reaction_type=eq.cheers&select=rating_id&limit=20000`),
      requester
        ? rest('GET', `/reactions?rating_id=in.(${idList})&reaction_type=eq.cheers&user_id=eq.${encodeURIComponent(requester)}&select=rating_id&limit=20000`)
        : Promise.resolve({ status: 200, body: [] }),
    ]);

    if (allCheersRes.status >= 400) return ratings;
    if (requester && myCheersRes.status >= 400) return ratings;

    const cheersByRating = Object.create(null);
    const allCheers = Array.isArray(allCheersRes.body) ? allCheersRes.body : [];
    allCheers.forEach((row) => {
      const rid = row && row.rating_id ? String(row.rating_id) : '';
      if (!rid) return;
      cheersByRating[rid] = (cheersByRating[rid] || 0) + 1;
    });

    const myCheered = new Set(
      (Array.isArray(myCheersRes.body) ? myCheersRes.body : [])
        .map((row) => (row && row.rating_id ? String(row.rating_id) : ''))
        .filter(Boolean)
    );

    return ratings.map((r) => {
      const rid = String(r?.id || '');
      return {
        ...r,
        cheers_count: cheersByRating[rid] || 0,
        you_cheered: requester ? myCheered.has(rid) : false,
      };
    });
  }

  // GET /api/activity — recent ratings + new venues, limit 50
  router.get('/activity', opts.softAuthMiddleware, (req, res, next) => {
    const feed = String(req.query.feed || '').trim();
    const crewId = String(req.query.crew_id || '').trim();
    const requester = req.claims?.sub || null;
    Promise.all([
      rest('GET', '/ratings?order=created_at.desc&limit=4000'),
      rest('GET', '/venues?order=created_at.desc&limit=10'),
    ])
      .then(async ([ratingsRes, venuesRes]) => {
        if (ratingsRes.status >= 400) return res.status(ratingsRes.status).json(ratingsRes.body || { error: 'Upstream error' });
        let ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
        if (feed) {
          if (!requester) return res.status(401).json({ error: 'Authentication required for feed filters' });
          if (feed === 'crew') {
            if (!crewId) return res.status(400).json({ error: 'crew_id is required for feed=crew' });
            const crewMembersRes = await rest('GET', `/crew_members?crew_id=eq.${encodeURIComponent(crewId)}&select=user_id`);
            if (crewMembersRes.status >= 400) return res.status(crewMembersRes.status).json(crewMembersRes.body || { error: 'Upstream error' });
            const ids = new Set((Array.isArray(crewMembersRes.body) ? crewMembersRes.body : []).map((m) => m.user_id));
            ratings = ratings.filter((r) => ids.has(r.user_id));
          } else if (feed === 'following') {
            const followsRes = await rest('GET', `/follows?follower_id=eq.${encodeURIComponent(requester)}&select=followed_id`);
            if (followsRes.status >= 400) return res.status(followsRes.status).json(followsRes.body || { error: 'Upstream error' });
            const ids = new Set((Array.isArray(followsRes.body) ? followsRes.body : []).map((f) => f.followed_id));
            ratings = ratings.filter((r) => ids.has(r.user_id));
          }
        }
        const venues = Array.isArray(venuesRes.body) ? venuesRes.body : [];
        const items = [
          ...ratings.map((r) => ({ type: 'rating', ...r })),
          ...venues.map((v) => ({ type: 'venue', ...v })),
        ].sort((a, b) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          return tb - ta;
        }).slice(0, 50);
        const ratingItems = items.filter((item) => item.type === 'rating');
        const ratingsWithCheers = await attachCheersData(ratingItems, requester);
        const ratingsById = new Map(ratingsWithCheers.map((r) => [String(r.id), r]));
        const enrichedItems = items.map((item) => {
          if (item.type !== 'rating') return item;
          return ratingsById.get(String(item.id)) || item;
        });
        res.json({ data: enrichedItems });
      })
      .catch(next);
  });

  // POST /api/ratings/:id/cheers — toggle (insert or delete)
  router.post('/ratings/:id/cheers', opts.authMiddleware, async (req, res, next) => {
    try {
      const ratingId = encodeURIComponent(req.params.id);
      const { sub } = req.claims;
      const { status: getStatus, body: existing } = await rest('GET', `/reactions?rating_id=eq.${ratingId}&user_id=eq.${encodeURIComponent(sub)}&reaction_type=eq.cheers&limit=1`);
      if (getStatus >= 400) return res.status(getStatus).json(existing || { error: 'Upstream error' });
      const found = Array.isArray(existing) && existing.length > 0;
      if (found) {
        const { status: delStatus } = await rest('DELETE', `/reactions?rating_id=eq.${ratingId}&user_id=eq.${encodeURIComponent(sub)}&reaction_type=eq.cheers`);
        if (delStatus >= 400) return res.status(502).json({ error: 'Delete failed' });
        const countRes = await rest('GET', `/reactions?rating_id=eq.${ratingId}&select=id`, { headers: { Prefer: 'count=exact' } });
        const count = opts.totalFromContentRange(countRes.headers['content-range']) ?? 0;
        return res.json({ action: 'removed', count });
      } else {
        const record = { rating_id: req.params.id, user_id: sub, reaction_type: 'cheers' };
        const { status: postStatus, body } = await rest('POST', '/reactions', { headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) });
        if (postStatus >= 400) return res.status(postStatus).json(body || { error: 'Insert failed' });
        const ratingOut = await rest('GET', `/ratings?id=eq.${ratingId}&select=id,user_id&limit=1`);
        if (ratingOut.status < 400) {
          const rating = Array.isArray(ratingOut.body) && ratingOut.body[0] ? ratingOut.body[0] : null;
          if (rating && rating.user_id) {
            await awardTabsForCheers(rest, sub, rating.user_id, req.params.id);
          }
        }
        const countRes = await rest('GET', `/reactions?rating_id=eq.${ratingId}&select=id`, { headers: { Prefer: 'count=exact' } });
        const count = opts.totalFromContentRange(countRes.headers['content-range']) ?? 1;
        res.json({ action: 'added', count });
      }
    } catch (e) {
      next(e);
    }
  });

  // GET /api/ratings/:id/cheers
  router.get('/ratings/:id/cheers', (req, res, next) => {
    const id = encodeURIComponent(req.params.id);
    rest('GET', `/reactions?rating_id=eq.${id}&reaction_type=eq.cheers`)
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        const list = Array.isArray(body) ? body : [];
        const users = list.map((r) => r.user_id);
        res.json({ count: users.length, users });
      })
      .catch(next);
  });

  // GET /api/users/:id/stats (define before /users/:id so path matches)
  router.get('/users/:id/stats', (req, res, next) => {
    const id = encodeURIComponent(req.params.id);
    Promise.all([
      rest('GET', `/ratings?user_id=eq.${id}`),
      rest('GET', `/follow_counts?user_id=eq.${id}&limit=1`),
      rest('GET', `/crew_members?user_id=eq.${id}&select=crew_id`),
    ])
      .then(([ratingsOut, followCountsOut, crewOut]) => {
        const { status, body } = ratingsOut;
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        const ratings = Array.isArray(body) ? body : [];
        const followRow = Array.isArray(followCountsOut.body) && followCountsOut.body[0] ? followCountsOut.body[0] : null;
        const crewRows = Array.isArray(crewOut.body) ? crewOut.body : [];
        const crewCount = new Set(crewRows.map((r) => r.crew_id).filter(Boolean)).size;
        const followerCount = Number(followRow?.follower_count || 0);
        const followingCount = Number(followRow?.following_count || 0);
        const totalRatings = ratings.length;
        if (totalRatings === 0) {
          return res.json({
            total_ratings: 0,
            total_styles: 0,
            avg_rating: 0,
            avg_yg_value: 0,
            total_yg_portfolio: 0,
            most_rated_style: null,
            highest_rated_beer: null,
            style_distribution: {},
            rating_distribution: {},
            monthly_activity: [],
            follower_count: followerCount,
            following_count: followingCount,
            crew_count: crewCount,
          });
        }
        const styles = new Set(ratings.map((r) => r.style || ''));
        const avgRating = ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / totalRatings;
        const withYg = ratings.filter((r) => r.yg_value != null);
        const avgYg = withYg.length ? withYg.reduce((s, r) => s + (Number(r.yg_value) || 0), 0) / withYg.length : 0;
        const totalYgPortfolio = withYg.reduce((s, r) => s + (Number(r.yg_value) || 0), 0);
        const styleCounts = {};
        ratings.forEach((r) => {
          const st = r.style || 'Unknown';
          styleCounts[st] = (styleCounts[st] || 0) + 1;
        });
        const mostRatedStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        const byStars = ratings.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
        const highestRatedBeer = byStars[0] ? { beer_name: byStars[0].beer_name, rating: byStars[0].rating } : null;
        const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        ratings.forEach((r) => { ratingDist[Number(r.rating) || 0] = (ratingDist[Number(r.rating) || 0] || 0) + 1; });
        const byMonth = {};
        ratings.forEach((r) => {
        const d = new Date(r.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        byMonth[key] = (byMonth[key] || 0) + 1;
        });
        const monthlyActivity = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12).map(([month, count]) => ({ month, count }));
        res.json({
          total_ratings: totalRatings,
          total_styles: styles.size,
          avg_rating: Math.round(avgRating * 100) / 100,
          avg_yg_value: Math.round(avgYg * 100) / 100,
          total_yg_portfolio: Math.round(totalYgPortfolio * 100) / 100,
          most_rated_style: mostRatedStyle,
          highest_rated_beer: highestRatedBeer,
          style_distribution: styleCounts,
          rating_distribution: ratingDist,
          monthly_activity: monthlyActivity,
          follower_count: followerCount,
          following_count: followingCount,
          crew_count: crewCount,
        });
      })
      .catch(next);
  });

  // GET /api/users/:id — public profile
  router.get('/users/:id', (req, res, next) => {
    const id = encodeURIComponent(req.params.id);
    rest('GET', `/profiles?id=eq.${id}&limit=1`)
      .then(({ status, body }) => {
        if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
        const profile = Array.isArray(body) && body[0] ? body[0] : null;
        if (!profile) return res.status(404).json({ error: 'User not found' });
        res.json(profile);
      })
      .catch(next);
  });

  return router;
};
