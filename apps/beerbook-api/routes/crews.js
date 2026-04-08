const express = require('express');
const { requireCrewMembership } = require('../lib/crewAuth');
const { styleToFamily } = require('../lib/styleFamily');

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function buildInClause(ids) {
  return ids.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
}

function sendError(res, req, status, errorCode, message, extras = {}) {
  return res.status(status).json({
    error_code: errorCode,
    error: message,
    request_id: req.requestId || null,
    ...extras,
  });
}

async function requireOwner(rest, crewId, userId) {
  const membership = await requireCrewMembership(rest, userId, crewId);
  return membership && membership.role === 'owner';
}

function parseRpcError(body) {
  if (!body || typeof body !== 'object') return { code: null, message: null };
  return {
    code: body.code || null,
    message: body.message || body.error || null,
  };
}

module.exports = function (opts) {
  const { rest, authMiddleware, totalFromContentRange } = opts;
  const router = express.Router();

  // POST /api/crews
  router.post('/crews', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Crew name is required' });
      if (name.length > 50) return res.status(400).json({ error: 'Crew name must be 50 chars or fewer' });

      const rpcRes = await rest('POST', '/rpc/create_crew_with_owner', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_name: name, p_owner_id: me }),
      });

      if (rpcRes.status >= 400) {
        const { message } = parseRpcError(rpcRes.body);
        return res.status(rpcRes.status >= 500 ? 502 : rpcRes.status).json(
          rpcRes.body || { error: message || 'Failed to create crew' }
        );
      }

      const crew = rpcRes.body;
      res.status(201).json(crew);
    } catch (e) {
      next(e);
    }
  });

  // GET /api/crews
  router.get('/crews', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const membershipsRes = await rest('GET', `/crew_members?user_id=eq.${encodeURIComponent(me)}&select=crew_id,role`);
      if (membershipsRes.status >= 400) {
        return res.status(membershipsRes.status).json(membershipsRes.body || { error: 'Upstream error' });
      }
      const memberships = Array.isArray(membershipsRes.body) ? membershipsRes.body : [];
      const crewIds = memberships.map((m) => m.crew_id).filter(Boolean);
      if (!crewIds.length) return res.json({ data: [] });

      const inClause = buildInClause(crewIds);
      const [summaryRes, memberRowsRes] = await Promise.all([
        rest('GET', `/crew_summary?id=in.(${inClause})`),
        rest('GET', `/crew_members?crew_id=in.(${inClause})&select=crew_id,user_id,role`),
      ]);
      if (summaryRes.status >= 400) return res.status(summaryRes.status).json(summaryRes.body || { error: 'Upstream error' });
      const summary = Array.isArray(summaryRes.body) ? summaryRes.body : [];
      const memberRows = Array.isArray(memberRowsRes.body) ? memberRowsRes.body : [];
      const byCrew = {};
      memberRows.forEach((m) => {
        if (!byCrew[m.crew_id]) byCrew[m.crew_id] = [];
        byCrew[m.crew_id].push(m.user_id);
      });
      const roleByCrew = {};
      memberships.forEach((m) => { roleByCrew[m.crew_id] = m.role || 'member'; });
      const data = summary.map((c) => ({
        ...c,
        my_role: roleByCrew[c.id] || 'member',
        member_user_ids: byCrew[c.id] || [],
      }));
      res.json({ data });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/crews/:id/challenge — current week's challenge + progress (Phase 2 backend plan)
  router.get('/crews/:id/challenge', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const crewId = String(req.params.id || '').trim();
      const membership = await requireCrewMembership(rest, me, crewId);
      if (!membership) return res.status(403).json({ error: 'Crew access denied' });

      const rpcRes = await rest('POST', '/rpc/get_crew_weekly_challenge', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_crew_id: crewId }),
      });
      if (rpcRes.status >= 400) return res.status(rpcRes.status).json(rpcRes.body || { error: 'Upstream error' });

      const raw = rpcRes.body;
      const payload = Array.isArray(raw) && raw[0] != null ? raw[0] : (raw && typeof raw === 'object' ? raw : { challenge: null, progress: null });
      res.json({
        challenge: payload.challenge || null,
        progress: payload.progress || null,
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/crews/:id/milestones — paginated crew milestone timeline (Phase 2 backend plan)
  router.get('/crews/:id/milestones', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const crewId = String(req.params.id || '').trim();
      const membership = await requireCrewMembership(rest, me, crewId);
      if (!membership) return res.status(403).json({ error: 'Crew access denied' });

      const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 100);
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

      const path = `/crew_milestones?crew_id=eq.${encodeURIComponent(crewId)}&order=occurred_at.desc&limit=${limit}&offset=${offset}`;
      const [listRes, countRes] = await Promise.all([
        rest('GET', path),
        rest('GET', `/crew_milestones?crew_id=eq.${encodeURIComponent(crewId)}&select=id&limit=0`, { headers: { Prefer: 'count=exact' } }),
      ]);
      if (listRes.status >= 400) return res.status(listRes.status).json(listRes.body || { error: 'Upstream error' });

      const rows = Array.isArray(listRes.body) ? listRes.body : [];
      const total = totalFromContentRange(countRes.headers && countRes.headers['content-range']) ?? rows.length;
      const userIds = [...new Set(rows.map((m) => m.user_id).filter(Boolean))];
      const inClause = userIds.length ? buildInClause(userIds) : '';
      const profilesRes = userIds.length
        ? await rest('GET', `/profiles?id=in.(${inClause})&select=id,display_name&limit=1000`)
        : { status: 200, body: [] };
      const profiles = Array.isArray(profilesRes.body) ? profilesRes.body : [];
      const profileMap = {};
      profiles.forEach((p) => { profileMap[p.id] = p; });

      const data = rows.map((m) => ({
        id: m.id,
        type: m.type,
        occurred_at: m.occurred_at,
        user_id: m.user_id ?? undefined,
        user_display_name: m.user_id ? (profileMap[m.user_id]?.display_name ?? null) : undefined,
        data: m.data ?? undefined,
        message: m.message ?? undefined,
      }));

      res.json({
        data,
        pagination: { limit, offset, total },
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/crews/:id/trending — Discover: beers trending in crew (Phase 4 backend plan)
  router.get('/crews/:id/trending', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const crewId = String(req.params.id || '').trim();
      const membership = await requireCrewMembership(rest, me, crewId);
      if (!membership) return res.status(403).json({ error: 'Crew access denied' });

      const days = Math.min(Math.max(1, parseInt(req.query.days, 10) || 7), 90);
      const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 10), 50);

      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceIso = since.toISOString();

      const membersRes = await rest('GET', `/crew_members?crew_id=eq.${encodeURIComponent(crewId)}&select=user_id`);
      if (membersRes.status >= 400) return res.status(membersRes.status).json(membersRes.body || { error: 'Upstream error' });
      const members = Array.isArray(membersRes.body) ? membersRes.body : [];
      const userIds = members.map((m) => m.user_id).filter(Boolean);
      if (!userIds.length) return res.json({ data: [], pagination: { limit, total: 0 } });

      const inClause = buildInClause(userIds);
      const path = `/ratings?user_id=in.(${inClause})&created_at=gte.${encodeURIComponent(sinceIso)}&select=beer_id,beer_name,style,brewery,rating&limit=10000`;
      const ratingsRes = await rest('GET', path);
      if (ratingsRes.status >= 400) return res.status(ratingsRes.status).json(ratingsRes.body || { error: 'Upstream error' });
      const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];

      const byBeer = {};
      ratings.forEach((r) => {
        const key = r.beer_id || r.beer_name || '';
        if (!key) return;
        if (!byBeer[key]) {
          byBeer[key] = { beer_id: r.beer_id ?? null, beer_name: r.beer_name || null, style: r.style ?? null, brewery: r.brewery ?? null, sum: 0, count: 0 };
        }
        byBeer[key].sum += Number(r.rating) || 0;
        byBeer[key].count += 1;
      });

      const sorted = Object.entries(byBeer)
        .map(([, v]) => ({
          beer_id: v.beer_id,
          beer_name: v.beer_name,
          style: v.style,
          brewery: v.brewery,
          rating_count: v.count,
          avg_rating: v.count ? Math.round((v.sum / v.count) * 100) / 100 : 0,
        }))
        .sort((a, b) => b.rating_count - a.rating_count);
      const total = sorted.length;
      const data = sorted.slice(0, limit);

      res.json({
        data,
        pagination: { limit, total, days },
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/crews/:id/style-counts — Discover: count of crew-rated beers per style (Phase 4 backend plan)
  router.get('/crews/:id/style-counts', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const crewId = String(req.params.id || '').trim();
      const membership = await requireCrewMembership(rest, me, crewId);
      if (!membership) return res.status(403).json({ error: 'Crew access denied' });

      const membersRes = await rest('GET', `/crew_members?crew_id=eq.${encodeURIComponent(crewId)}&select=user_id`);
      if (membersRes.status >= 400) return res.status(membersRes.status).json(membersRes.body || { error: 'Upstream error' });
      const members = Array.isArray(membersRes.body) ? membersRes.body : [];
      const userIds = members.map((m) => m.user_id).filter(Boolean);
      if (!userIds.length) return res.json({});

      const inClause = buildInClause(userIds);
      const ratingsRes = await rest('GET', `/ratings?user_id=in.(${inClause})&select=style&limit=50000`);
      if (ratingsRes.status >= 400) return res.status(ratingsRes.status).json(ratingsRes.body || { error: 'Upstream error' });
      const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];

      const counts = {};
      ratings.forEach((r) => {
        const family = styleToFamily(r.style);
        counts[family] = (counts[family] || 0) + 1;
      });

      res.json(counts);
    } catch (e) {
      next(e);
    }
  });

  // GET /api/crews/:id
  router.get('/crews/:id', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const crewId = String(req.params.id || '').trim();
      const membership = await requireCrewMembership(rest, me, crewId);
      if (!membership) return res.status(403).json({ error: 'Crew access denied' });

      const [crewRes, membersRes] = await Promise.all([
        rest('GET', `/crews?id=eq.${encodeURIComponent(crewId)}&limit=1`),
        rest('GET', `/crew_members?crew_id=eq.${encodeURIComponent(crewId)}&select=crew_id,user_id,role,joined_at`),
      ]);
      if (crewRes.status >= 400) return res.status(crewRes.status).json(crewRes.body || { error: 'Upstream error' });
      const crew = Array.isArray(crewRes.body) && crewRes.body[0] ? crewRes.body[0] : null;
      if (!crew) return res.status(404).json({ error: 'Crew not found' });

      const members = Array.isArray(membersRes.body) ? membersRes.body : [];
      const userIds = members.map((m) => m.user_id).filter(Boolean);
      const inClause = userIds.length ? buildInClause(userIds) : '';
      const [profilesRes, ratingsRes] = await Promise.all([
        userIds.length
          ? rest('GET', `/profiles?id=in.(${inClause})&select=id,display_name,avatar_url`)
          : Promise.resolve({ status: 200, body: [] }),
        userIds.length
          ? rest('GET', `/ratings?user_id=in.(${inClause})&select=id,user_id,beer_name,style,rating,venue_id,location_verified&limit=2000`) // TODO(scale): replace with paginated/filtered query post-launch
          : Promise.resolve({ status: 200, body: [] }),
      ]);
      const profiles = Array.isArray(profilesRes.body) ? profilesRes.body : [];
      const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
      const profileMap = {};
      profiles.forEach((p) => { profileMap[p.id] = p; });
      const ratingCountByUser = {};
      ratings.forEach((r) => { ratingCountByUser[r.user_id] = (ratingCountByUser[r.user_id] || 0) + 1; });

      const styleCounts = {};
      const beerCounts = {};
      const venueIds = new Set();
      let totalRatings = 0;
      let ratingSum = 0;
      ratings.forEach((r) => {
        totalRatings += 1;
        ratingSum += Number(r.rating) || 0;
        if (r.style) {
          const family = styleToFamily(r.style);
          styleCounts[family] = (styleCounts[family] || 0) + 1;
        }
        if (r.beer_name) beerCounts[r.beer_name] = (beerCounts[r.beer_name] || 0) + 1;
        if (r.venue_id && r.location_verified === true) venueIds.add(r.venue_id);
      });
      const topStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const topBeer = Object.entries(beerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      let membersOnStreakCount = 0;
      if (userIds.length) {
        const streakRes = await rest('GET', `/user_tabs_profile?user_id=in.(${inClause})&select=user_id,current_streak_weeks`);
        if (streakRes.status < 400 && Array.isArray(streakRes.body)) {
          membersOnStreakCount = streakRes.body.filter((row) => (Number(row.current_streak_weeks) || 0) > 0).length;
        }
      }

      let weeklyChallenge = null;
      try {
        const challengeRpcRes = await rest('POST', '/rpc/get_crew_weekly_challenge', {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_crew_id: crewId }),
        });
        if (challengeRpcRes.status < 400 && challengeRpcRes.body) {
          const raw = challengeRpcRes.body;
          const payload = Array.isArray(raw) && raw[0] != null ? raw[0] : (raw && typeof raw === 'object' ? raw : null);
          if (payload && (payload.challenge || payload.progress)) {
            weeklyChallenge = {
              challenge: payload.challenge || null,
              progress: payload.progress || null,
            };
          }
        }
      } catch (_) {
        // non-fatal; leave weekly_challenge null
      }

      const detailMembers = members.map((m) => {
        const profile = profileMap[m.user_id] || { id: m.user_id, display_name: 'Beer Lover', avatar_url: null };
        return {
          user_id: m.user_id,
          role: m.role,
          joined_at: m.joined_at,
          display_name: profile?.display_name ?? 'Unknown',
          avatar_url: profile?.avatar_url ?? null,
          current_tier: profile?.current_tier ?? m.current_tier ?? null,
          profile,
          rating_count: ratingCountByUser[m.user_id] || 0,
        };
      });

      res.json({
        ...crew,
        my_role: membership.role,
        member_count: detailMembers.length,
        members: detailMembers,
        stats: {
          total_ratings: totalRatings,
          avg_rating: totalRatings ? Math.round((ratingSum / totalRatings) * 100) / 100 : 0,
          most_popular_style: topStyle,
          favorite_style_name: topStyle,
          top_beer: topBeer,
          venues_visited_count: venueIds.size,
          members_on_streak_count: membersOnStreakCount,
        },
        weekly_challenge: weeklyChallenge,
      });
    } catch (e) {
      next(e);
    }
  });

  // PATCH /api/crews/:id
  router.patch('/crews/:id', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const crewId = String(req.params.id || '').trim();
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Crew name is required' });
      if (name.length > 50) return res.status(400).json({ error: 'Crew name must be 50 chars or fewer' });

      const owner = await requireOwner(rest, crewId, me);
      if (!owner) return res.status(403).json({ error: 'Owner access required' });
      const out = await rest('PATCH', `/crews?id=eq.${encodeURIComponent(crewId)}`, {
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name, updated_at: new Date().toISOString() }),
      });
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Update failed' });
      const row = Array.isArray(out.body) ? out.body[0] : out.body;
      res.json(row || { id: crewId, name });
    } catch (e) {
      next(e);
    }
  });

  // DELETE /api/crews/:id
  router.delete('/crews/:id', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const crewId = String(req.params.id || '').trim();
      const owner = await requireOwner(rest, crewId, me);
      if (!owner) return res.status(403).json({ error: 'Owner access required' });
      const out = await rest('DELETE', `/crews?id=eq.${encodeURIComponent(crewId)}`);
      if (out.status >= 400) return res.status(502).json({ error: 'Delete failed' });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  // POST /api/crews/:id/regenerate-code
  router.post('/crews/:id/regenerate-code', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const crewId = String(req.params.id || '').trim();
      const owner = await requireOwner(rest, crewId, me);
      if (!owner) return res.status(403).json({ error: 'Owner access required' });

      let updated = null;
      for (let i = 0; i < 3; i += 1) {
        const code = generateInviteCode();
        const out = await rest('PATCH', `/crews?id=eq.${encodeURIComponent(crewId)}`, {
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ invite_code: code, updated_at: new Date().toISOString() }),
        });
        if (out.status < 400) {
          updated = Array.isArray(out.body) ? out.body[0] : out.body;
          break;
        }
        const msg = JSON.stringify(out.body || {});
        if (!msg.includes('invite_code')) {
          return res.status(out.status).json(out.body || { error: 'Regenerate failed' });
        }
      }
      if (!updated) return res.status(500).json({ error: 'Failed to regenerate invite code' });
      res.json({ invite_code: updated.invite_code });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/crews/join
  router.post('/crews/join', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const invite = String(req.body?.invite_code || '').trim().toUpperCase();
      if (!invite) {
        return sendError(res, req, 400, 'INVITE_REQUIRED', 'Invite code is required');
      }

      const crewRes = await rest('GET', `/crews?invite_code=eq.${encodeURIComponent(invite)}&limit=1`);
      if (crewRes.status >= 400) {
        return sendError(
          res,
          req,
          crewRes.status >= 500 ? 502 : crewRes.status,
          'UPSTREAM_ERROR',
          'Failed to validate invite code'
        );
      }
      const crew = Array.isArray(crewRes.body) && crewRes.body[0] ? crewRes.body[0] : null;
      if (!crew) {
        return sendError(res, req, 404, 'CREW_NOT_FOUND', 'Crew not found');
      }

      const existing = await requireCrewMembership(rest, me, crew.id);
      if (existing) {
        return sendError(res, req, 409, 'ALREADY_MEMBER', 'Already a member');
      }

      const rpcRes = await rest('POST', '/rpc/join_crew', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_crew_id: crew.id, p_user_id: me }),
      });

      if (rpcRes.status >= 400) {
        const { code, message } = parseRpcError(rpcRes.body);
        if (code === '23505' || (message && message.includes('Already a member'))) {
          return sendError(res, req, 409, 'ALREADY_MEMBER', 'Already a member');
        }
        if (code === 'P0003' || (message && message.includes('full'))) {
          return sendError(res, req, 403, 'CREW_FULL', 'Crew is full (50/50)');
        }
        return sendError(
          res,
          req,
          rpcRes.status >= 500 ? 502 : rpcRes.status,
          'JOIN_FAILED',
          message || 'Failed to join crew'
        );
      }

      res.status(201).json(crew);
    } catch (e) {
      next(e);
    }
  });

  // DELETE /api/crews/:id/members/:userId
  router.delete('/crews/:id/members/:userId', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const crewId = String(req.params.id || '').trim();
      const target = String(req.params.userId || '').trim();
      const myMembership = await requireCrewMembership(rest, me, crewId);
      if (!myMembership) return res.status(403).json({ error: 'Crew access denied' });

      const removingSelf = target === me;
      if (!removingSelf && myMembership.role !== 'owner') {
        return res.status(403).json({ error: 'Owner access required' });
      }
      if (removingSelf && myMembership.role === 'owner') {
        return res.status(400).json({ error: 'Owner cannot leave crew. Delete crew instead.' });
      }

      const rpcRes = await rest('POST', '/rpc/remove_crew_member', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_crew_id: crewId, p_user_id: target }),
      });

      if (rpcRes.status >= 400) {
        const { message } = parseRpcError(rpcRes.body);
        return res.status(rpcRes.status >= 500 ? 502 : rpcRes.status).json(
          { error: message || 'Remove member failed' }
        );
      }

      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return router;
};
