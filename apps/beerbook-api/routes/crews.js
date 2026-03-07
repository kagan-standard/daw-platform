const express = require('express');
const { requireCrewMembership } = require('../lib/crewAuth');

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

async function createCrewWithUniqueCode(rest, payload, attempts = 3) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    const inviteCode = generateInviteCode();
    const createRes = await rest('POST', '/crews', {
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...payload, invite_code: inviteCode }),
    });
    if (createRes.status < 400) {
      const crew = Array.isArray(createRes.body) ? createRes.body[0] : createRes.body;
      return { crew, error: null };
    }
    const msg = JSON.stringify(createRes.body || {});
    lastError = { status: createRes.status, body: createRes.body || null };
    if (createRes.status !== 409 && !msg.includes('invite_code')) {
      break;
    }
  }
  return { crew: null, error: lastError };
}

module.exports = function (opts) {
  const { rest, authMiddleware } = opts;
  const router = express.Router();

  // POST /api/crews
  router.post('/crews', authMiddleware, async (req, res, next) => {
    try {
      const me = req.claims.sub;
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Crew name is required' });
      if (name.length > 50) return res.status(400).json({ error: 'Crew name must be 50 chars or fewer' });

      const { crew, error: createError } = await createCrewWithUniqueCode(rest, { name, created_by: me }, 3);
      if (!crew) {
        // Bubble the upstream failure to make schema/config issues diagnosable in clients.
        return res.status(createError?.status || 500).json(
          createError?.body || { error: 'Failed to create crew' }
        );
      }

      const ownerRes = await rest('POST', '/crew_members', {
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ crew_id: crew.id, user_id: me, role: 'owner' }),
      });
      if (ownerRes.status >= 400) return res.status(ownerRes.status).json(ownerRes.body || { error: 'Failed to add owner' });

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
          ? rest('GET', `/ratings?user_id=in.(${inClause})&select=id,user_id,beer_name,style,rating`)
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
      let totalRatings = 0;
      let ratingSum = 0;
      ratings.forEach((r) => {
        totalRatings += 1;
        ratingSum += Number(r.rating) || 0;
        if (r.style) styleCounts[r.style] = (styleCounts[r.style] || 0) + 1;
        if (r.beer_name) beerCounts[r.beer_name] = (beerCounts[r.beer_name] || 0) + 1;
      });
      const topStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const topBeer = Object.entries(beerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

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
          top_beer: topBeer,
        },
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

      const countRes = await rest('GET', `/crew_members?crew_id=eq.${encodeURIComponent(crew.id)}&select=user_id`);
      const memberCount = Array.isArray(countRes.body) ? countRes.body.length : 0;
      if (memberCount >= 50) {
        return sendError(res, req, 403, 'CREW_FULL', 'Crew is full (50/50)');
      }

      const joinRes = await rest('POST', '/crew_members', {
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ crew_id: crew.id, user_id: me, role: 'member' }),
      });
      if (joinRes.status >= 400) {
        const upstreamError = JSON.stringify(joinRes.body || {});
        if (joinRes.status === 409 || upstreamError.includes('duplicate key')) {
          return sendError(res, req, 409, 'ALREADY_MEMBER', 'Already a member');
        }
        return sendError(
          res,
          req,
          joinRes.status >= 500 ? 502 : joinRes.status,
          'JOIN_FAILED',
          'Failed to join crew'
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

      const out = await rest(
        'DELETE',
        `/crew_members?crew_id=eq.${encodeURIComponent(crewId)}&user_id=eq.${encodeURIComponent(target)}`
      );
      if (out.status >= 400) return res.status(502).json({ error: 'Remove member failed' });

      const leftRes = await rest('GET', `/crew_members?crew_id=eq.${encodeURIComponent(crewId)}&select=user_id`);
      const count = Array.isArray(leftRes.body) ? leftRes.body.length : 0;
      if (count === 0) {
        await rest('DELETE', `/crews?id=eq.${encodeURIComponent(crewId)}`);
      }
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return router;
};
