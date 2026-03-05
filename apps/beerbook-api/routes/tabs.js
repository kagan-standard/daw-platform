const express = require('express');
const {
  TAB_TIERS,
  ensureUserTabsProfile,
  getTierMultiplier,
  awardTabsForBeerApproval,
} = require('../lib/tabs');

function toBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

module.exports = function tabsRoutes(opts) {
  const router = express.Router();
  const { rest, authMiddleware, adminMiddleware, totalFromContentRange } = opts;

  async function formatTabProfile(userId, profileDefaults = {}) {
    const profile = await ensureUserTabsProfile(rest, userId, profileDefaults);
    const tier = await getTierMultiplier(rest, profile.current_tier);
    const tierMultiplier = Number(tier.multiplier) || 1.0;
    const seederMultiplier = profile.is_seeder ? 1.5 : 1.0;
    const combinedMultiplier = Number((tierMultiplier * seederMultiplier).toFixed(2));
    const ratingsThisWeek = Number(profile.ratings_this_week) || 0;
    // Prefer profiles.tabs_balance (new ledger) when present
    let tabBalance = Number(profile.tab_balance) || 0;
    const profRes = await rest('GET', `/profiles?id=eq.${encodeURIComponent(userId)}&select=tabs_balance&limit=1`);
    if (profRes.status < 400 && Array.isArray(profRes.body) && profRes.body[0] != null && typeof profRes.body[0].tabs_balance === 'number') {
      tabBalance = profRes.body[0].tabs_balance;
    }
    return {
      user_id: profile.user_id,
      current_tier: profile.current_tier,
      tier_display_name: tier.display_name,
      tier_multiplier: tierMultiplier,
      seeder_multiplier: seederMultiplier,
      combined_multiplier: combinedMultiplier,
      is_seeder: !!profile.is_seeder,
      tab_balance: tabBalance,
      lifetime_tabs_earned: Number(profile.lifetime_tabs_earned) || 0,
      ratings_this_week: ratingsThisWeek,
      current_streak_weeks: Number(profile.current_streak_weeks) || 0,
      weekly_cap_reached: ratingsThisWeek >= 10,
      weeks_inactive: Number(profile.weeks_inactive) || 0,
      week_start: profile.week_start,
      updated_at: profile.updated_at,
    };
  }

  // GET /api/achievements — unlocked achievements for current user (Keycloak sub)
  router.get('/achievements', authMiddleware, async (req, res, next) => {
    try {
      const userId = encodeURIComponent(req.claims.sub);
      const uaRes = await rest('GET', `/user_achievements?user_id=eq.${userId}&select=achievement_id`);
      if (uaRes.status >= 400) return res.status(uaRes.status).json(uaRes.body || { error: 'Upstream error' });
      const rows = Array.isArray(uaRes.body) ? uaRes.body : [];
      if (rows.length === 0) return res.json({ data: [] });
      const ids = rows.map((r) => r.achievement_id).filter(Boolean);
      const idList = ids.map((id) => encodeURIComponent(id)).join(',');
      const aRes = await rest('GET', `/achievements?id=in.(${idList})&select=id,key,name,reward_tabs`);
      if (aRes.status >= 400) return res.status(aRes.status).json(aRes.body || { error: 'Upstream error' });
      const achievements = Array.isArray(aRes.body) ? aRes.body : [];
      const byId = Object.fromEntries(achievements.map((a) => [a.id, a]));
      const data = ids.map((id) => {
        const a = byId[id];
        return a ? { key: a.key, name: a.name, reward_tabs: Number(a.reward_tabs) || 0 } : null;
      }).filter(Boolean);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/tabs/profile
  router.get('/tabs/profile', authMiddleware, async (req, res, next) => {
    try {
      const data = await formatTabProfile(req.claims.sub, {
        displayName: req.claims.preferred_username,
        email: req.claims.email,
      });
      res.json({ data });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/tabs/profile/:userId
  router.get('/tabs/profile/:userId', async (req, res, next) => {
    try {
      const userId = req.params.userId;
      const out = await rest('GET', `/user_tabs_profile?user_id=eq.${encodeURIComponent(userId)}&limit=1`);
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Upstream error' });
      if (!Array.isArray(out.body) || out.body.length === 0) return res.status(404).json({ error: 'Tab profile not found' });

      const data = await formatTabProfile(userId);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/tabs/leaderboard
  router.get('/tabs/leaderboard', async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const out = await rest(
        'GET',
        `/tabs_leaderboard?order=lifetime_tabs_earned.desc&limit=${limit}&offset=${offset}`,
        { headers: { Prefer: 'count=exact' } }
      );
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Upstream error' });
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

  // GET /api/tabs/history
  router.get('/tabs/history', authMiddleware, async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const userId = encodeURIComponent(req.claims.sub);
      const out = await rest(
        'GET',
        `/tab_transactions?user_id=eq.${userId}&order=created_at.desc&limit=${limit}&offset=${offset}`,
        { headers: { Prefer: 'count=exact' } }
      );
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Upstream error' });
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

  // GET /api/tabs/notifications
  router.get('/tabs/notifications', authMiddleware, async (req, res, next) => {
    try {
      const userId = encodeURIComponent(req.claims.sub);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const out = await rest(
        'GET',
        `/tab_notifications?user_id=eq.${userId}&order=is_read.asc,created_at.desc&limit=${limit}&offset=${offset}`,
        { headers: { Prefer: 'count=exact' } }
      );
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Upstream error' });
      const unread = await rest('GET', `/tab_notifications?user_id=eq.${userId}&is_read=eq.false&select=id&limit=1`, {
        headers: { Prefer: 'count=exact' },
      });
      const unreadCount = unread.status < 400 ? (totalFromContentRange(unread.headers['content-range']) ?? 0) : 0;
      res.json({
        data: Array.isArray(out.body) ? out.body : [],
        pagination: {
          limit,
          offset,
          total: totalFromContentRange(out.headers['content-range']) ?? 0,
        },
        metadata: { unread_count: unreadCount },
      });
    } catch (e) {
      next(e);
    }
  });

  // PATCH /api/tabs/notifications/:id/read
  router.patch('/tabs/notifications/:id/read', authMiddleware, async (req, res, next) => {
    try {
      const id = encodeURIComponent(req.params.id);
      const userId = encodeURIComponent(req.claims.sub);
      const out = await rest('PATCH', `/tab_notifications?id=eq.${id}&user_id=eq.${userId}`, {
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ is_read: true }),
      });
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Update failed' });
      const row = Array.isArray(out.body) ? out.body[0] : out.body;
      if (!row) return res.status(404).json({ error: 'Notification not found' });
      res.json({ data: row });
    } catch (e) {
      next(e);
    }
  });

  // PATCH /api/tabs/notifications/read-all
  router.patch('/tabs/notifications/read-all', authMiddleware, async (req, res, next) => {
    try {
      const userId = encodeURIComponent(req.claims.sub);
      const out = await rest('PATCH', `/tab_notifications?user_id=eq.${userId}&is_read=eq.false`, {
        body: JSON.stringify({ is_read: true }),
      });
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Update failed' });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/tabs/submissions
  router.post('/tabs/submissions', authMiddleware, async (req, res, next) => {
    try {
      const body = req.body || {};
      if (!body.beer_name || !String(body.beer_name).trim()) {
        return res.status(400).json({ error: 'beer_name is required' });
      }
      const record = {
        submitted_by: req.claims.sub,
        beer_name: String(body.beer_name).trim(),
        brewery: body.brewery ? String(body.brewery).trim() : null,
        style: body.style ? String(body.style).trim() : null,
        abv: body.abv != null ? Number(body.abv) : null,
        notes: body.notes ? String(body.notes).trim() : null,
        status: 'pending',
      };
      const out = await rest('POST', '/beer_submissions', {
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(record),
      });
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Insert failed' });
      const row = Array.isArray(out.body) ? out.body[0] : out.body;
      res.status(201).json({ data: row });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/tabs/submissions
  router.get('/tabs/submissions', authMiddleware, async (req, res, next) => {
    try {
      const userId = encodeURIComponent(req.claims.sub);
      const out = await rest('GET', `/beer_submissions?submitted_by=eq.${userId}&order=created_at.desc&limit=500`);
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Upstream error' });
      res.json({ data: Array.isArray(out.body) ? out.body : [] });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/admin/tabs/users
  router.get('/admin/tabs/users', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      const [profilesOut, tabsOut] = await Promise.all([
        rest('GET', '/profiles?select=id,display_name,email,avatar_url&limit=5000'),
        rest('GET', '/user_tabs_profile?limit=5000'),
      ]);
      if (profilesOut.status >= 400) return res.status(profilesOut.status).json(profilesOut.body || { error: 'Failed to fetch users' });
      if (tabsOut.status >= 400) return res.status(tabsOut.status).json(tabsOut.body || { error: 'Failed to fetch tabs profiles' });

      const profiles = Array.isArray(profilesOut.body) ? profilesOut.body : [];
      const tabs = Array.isArray(tabsOut.body) ? tabsOut.body : [];
      const tabsByUser = new Map(tabs.map((t) => [t.user_id, t]));
      const data = profiles.map((p) => ({
        id: p.id,
        display_name: p.display_name,
        email: p.email,
        avatar_url: p.avatar_url,
        tabs_profile: tabsByUser.get(p.id) || null,
      }));
      res.json({ data });
    } catch (e) {
      next(e);
    }
  });

  // PATCH /api/admin/tabs/users/:userId/seeder
  router.patch('/admin/tabs/users/:userId/seeder', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      const userId = req.params.userId;
      const isSeeder = toBool(req.body?.is_seeder);
      await ensureUserTabsProfile(rest, userId);
      const patch = {
        is_seeder: isSeeder,
        seeder_granted_at: isSeeder ? new Date().toISOString() : null,
        seeder_granted_by: isSeeder ? req.claims.sub : null,
      };
      const out = await rest('PATCH', `/user_tabs_profile?user_id=eq.${encodeURIComponent(userId)}`, {
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Update failed' });
      const row = Array.isArray(out.body) ? out.body[0] : out.body;

      if (isSeeder) {
        await rest('POST', '/tab_notifications', {
          body: JSON.stringify({
            user_id: userId,
            notification_type: 'seeder_granted',
            title: 'Seeder status granted',
            message: 'Welcome to the founding crew! You now have a permanent 1.5x seeder multiplier.',
            metadata: { granted_by: req.claims.sub },
          }),
        });
      }

      res.json({ data: row });
    } catch (e) {
      next(e);
    }
  });

  // PATCH /api/admin/tabs/users/:userId/tier
  router.patch('/admin/tabs/users/:userId/tier', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      const userId = req.params.userId;
      const tier = String(req.body?.tier || '').trim();
      if (!TAB_TIERS.includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier value' });
      }
      await ensureUserTabsProfile(rest, userId);
      const out = await rest('PATCH', `/user_tabs_profile?user_id=eq.${encodeURIComponent(userId)}`, {
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          current_tier: tier,
          tier_promoted_at: new Date().toISOString(),
          weeks_inactive: 0,
        }),
      });
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Update failed' });
      await rest('POST', '/tab_notifications', {
        body: JSON.stringify({
          user_id: userId,
          notification_type: 'tier_promotion',
          title: 'Tier updated',
          message: `Your tier is now ${tier.replace('_', ' ')}.`,
          metadata: { admin_user_id: req.claims.sub, tier },
        }),
      });
      const row = Array.isArray(out.body) ? out.body[0] : out.body;
      res.json({ data: row });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/admin/tabs/users/:userId/adjust
  router.post('/admin/tabs/users/:userId/adjust', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      const userId = req.params.userId;
      const amount = Number(req.body?.amount);
      const reason = String(req.body?.reason || '').trim();
      if (!Number.isInteger(amount) || amount === 0) return res.status(400).json({ error: 'amount must be a non-zero integer' });
      if (!reason) return res.status(400).json({ error: 'reason is required' });

      const profile = await ensureUserTabsProfile(rest, userId);
      const insert = await rest('POST', '/tab_transactions', {
        body: JSON.stringify({
          user_id: userId,
          transaction_type: 'admin_adjust',
          amount,
          admin_user_id: req.claims.sub,
          admin_reason: reason,
          earn_source: 'admin_grant',
          base_amount: Math.abs(amount),
          tier_multiplier: 1.0,
          seeder_multiplier: 1.0,
        }),
      });
      if (insert.status >= 400) return res.status(insert.status).json(insert.body || { error: 'Transaction insert failed' });

      const patch = {
        tab_balance: (Number(profile.tab_balance) || 0) + amount,
      };
      if (amount > 0) {
        patch.lifetime_tabs_earned = (Number(profile.lifetime_tabs_earned) || 0) + amount;
      }
      const out = await rest('PATCH', `/user_tabs_profile?user_id=eq.${encodeURIComponent(userId)}`, {
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Balance update failed' });
      const row = Array.isArray(out.body) ? out.body[0] : out.body;
      res.json({ data: row });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/admin/tabs/submissions
  router.get('/admin/tabs/submissions', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      const status = String(req.query.status || 'pending').trim();
      const valid = ['pending', 'approved', 'rejected'];
      if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status filter' });
      const out = await rest('GET', `/beer_submissions?status=eq.${encodeURIComponent(status)}&order=created_at.desc&limit=1000`);
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Upstream error' });
      res.json({ data: Array.isArray(out.body) ? out.body : [] });
    } catch (e) {
      next(e);
    }
  });

  // PATCH /api/admin/tabs/submissions/:id
  router.patch('/admin/tabs/submissions/:id', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      const id = req.params.id;
      const status = String(req.body?.status || '').trim();
      const reviewNotes = req.body?.review_notes ? String(req.body.review_notes).trim() : null;
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
      }

      const getOut = await rest('GET', `/beer_submissions?id=eq.${encodeURIComponent(id)}&limit=1`);
      if (getOut.status >= 400) return res.status(getOut.status).json(getOut.body || { error: 'Lookup failed' });
      const submission = Array.isArray(getOut.body) ? getOut.body[0] : null;
      if (!submission) return res.status(404).json({ error: 'Submission not found' });

      const patchOut = await rest('PATCH', `/beer_submissions?id=eq.${encodeURIComponent(id)}`, {
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status,
          reviewed_by: req.claims.sub,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes,
        }),
      });
      if (patchOut.status >= 400) return res.status(patchOut.status).json(patchOut.body || { error: 'Update failed' });

      let tabsAwarded = 0;
      if (status === 'approved' && !submission.tabs_awarded) {
        tabsAwarded = await awardTabsForBeerApproval(rest, submission.submitted_by, submission.id);
        await rest('PATCH', `/beer_submissions?id=eq.${encodeURIComponent(id)}`, {
          body: JSON.stringify({ tabs_awarded: true }),
        });
      }

      await rest('POST', '/tab_notifications', {
        body: JSON.stringify({
          user_id: submission.submitted_by,
          notification_type: status === 'approved' ? 'beer_approved' : 'beer_rejected',
          title: status === 'approved' ? 'Beer submission approved' : 'Beer submission rejected',
          message: status === 'approved'
            ? `${submission.beer_name} was approved. +${tabsAwarded} tabs earned.`
            : `${submission.beer_name} was rejected.`,
          metadata: {
            submission_id: submission.id,
            review_notes: reviewNotes,
            status,
          },
        }),
      });

      const row = Array.isArray(patchOut.body) ? patchOut.body[0] : patchOut.body;
      res.json({ data: row, tabs_awarded: tabsAwarded });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/admin/tabs/stats
  router.get('/admin/tabs/stats', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      const [usersOut, tabsOut] = await Promise.all([
        rest('GET', '/profiles?select=id&limit=1', { headers: { Prefer: 'count=exact' } }),
        rest('GET', '/user_tabs_profile?limit=5000'),
      ]);
      if (usersOut.status >= 400 || tabsOut.status >= 400) {
        return res.status(502).json({ error: 'Failed to fetch tabs stats' });
      }
      const tabs = Array.isArray(tabsOut.body) ? tabsOut.body : [];
      const byTier = {};
      let inCirculation = 0;
      tabs.forEach((row) => {
        const tier = row.current_tier || 'taster';
        byTier[tier] = (byTier[tier] || 0) + 1;
        inCirculation += Number(row.tab_balance) || 0;
      });
      res.json({
        total_users: totalFromContentRange(usersOut.headers['content-range']) ?? 0,
        users_with_tabs_profile: tabs.length,
        tabs_in_circulation: inCirculation,
        distribution_by_tier: byTier,
        active_seeders: tabs.filter((t) => t.is_seeder).length,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
