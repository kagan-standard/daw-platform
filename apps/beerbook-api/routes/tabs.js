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

function normalizeStyle(value) {
  return String(value || '').trim().toLowerCase();
}

function getUtcDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getPeriodStartUtc(period) {
  const now = new Date();
  if (period === 'weekly') {
    const day = now.getUTCDay();
    const mondayOffset = day === 0 ? -6 : (1 - day);
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() + mondayOffset);
    monday.setUTCHours(0, 0, 0, 0);
    return monday.toISOString();
  }
  if (period === 'monthly') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
  }
  return null;
}

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function stableIndexForSeed(seed, size) {
  if (!Number.isInteger(size) || size <= 0) return 0;
  const text = String(seed || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash * 31) + text.charCodeAt(i)) >>> 0;
  }
  return hash % size;
}

function includesAnyNeedle(value, needles) {
  const source = String(value || '').toLowerCase();
  return needles.some((needle) => source.includes(String(needle || '').toLowerCase()));
}

function countIf(ratings, predicate) {
  return ratings.reduce((acc, row) => (predicate(row) ? acc + 1 : acc), 0);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapPurchaseErrorStatus(errorCode) {
  if (errorCode === 'already_owned' || errorCode === 'insufficient_balance') return 409;
  return 400;
}

function computeFallbackProgress(achievement, ratings, stats) {
  const rules = achievement?.rules && typeof achievement.rules === 'object' ? achievement.rules : null;
  if (!rules) return null;
  const type = String(rules.type || '').trim().toLowerCase();
  if (!type) return null;

  const gte = Number(rules.gte);
  const hasTarget = Number.isFinite(gte) && gte > 0;

  if (type === 'count' && String(rules.entity || '').toLowerCase() === 'ratings' && hasTarget) {
    return {
      progress_current: stats.totalRatings,
      progress_target: gte,
    };
  }

  if (type === 'distinct_count' && String(rules.entity || '').toLowerCase() === 'ratings' && hasTarget) {
    const field = String(rules.field || '').toLowerCase();
    if (field === 'style') return { progress_current: stats.distinctStyles, progress_target: gte };
    if (field === 'venue_id') return { progress_current: stats.distinctVenues, progress_target: gte };
    if (field === 'city') return { progress_current: stats.distinctCities, progress_target: gte };
    if (field === 'month') return { progress_current: stats.distinctMonths, progress_target: gte };
    return null;
  }

  if (type === 'style_contains' && hasTarget) {
    const needle = String(rules.needle || '').trim();
    if (!needle) return null;
    return {
      progress_current: countIf(ratings, (row) => String(row?.style || '').toLowerCase().includes(needle.toLowerCase())),
      progress_target: gte,
    };
  }

  if (type === 'style_contains_any' && hasTarget) {
    const needles = Array.isArray(rules.needles) ? rules.needles.map((n) => String(n || '').trim()).filter(Boolean) : [];
    if (!needles.length) return null;
    return {
      progress_current: countIf(ratings, (row) => includesAnyNeedle(row?.style, needles)),
      progress_target: gte,
    };
  }

  if (type === 'count_where' && String(rules.entity || '').toLowerCase() === 'ratings' && hasTarget) {
    const where = rules.where && typeof rules.where === 'object' ? rules.where : null;
    if (!where) return null;
    const progressCurrent = countIf(ratings, (row) => {
      if (typeof where.photo === 'boolean' && (!!(row?.photo_url ?? row?.photo)) !== where.photo) return false;
      if (typeof where.price === 'boolean' && (!!(row?.price_cents ?? row?.price)) !== where.price) return false;
      if (typeof where.venue_id === 'boolean' && (!!row?.venue_id) !== where.venue_id) return false;
      if (typeof where.is_new_beer === 'boolean' && (!!row?.is_new_beer) !== where.is_new_beer) return false;
      if (Number.isFinite(Number(where.review_min_len)) && String(row?.notes || '').trim().length < Number(where.review_min_len)) return false;
      if (Number.isFinite(Number(where.stars_gte)) && Number(row?.rating ?? row?.stars) < Number(where.stars_gte)) return false;
      if (Number.isFinite(Number(where.stars_lte)) && Number(row?.rating ?? row?.stars) > Number(where.stars_lte)) return false;
      return true;
    });
    return { progress_current: progressCurrent, progress_target: gte };
  }

  if (type === 'has_field') {
    const field = String(rules.field || '').trim();
    if (!field) return null;
    const expected = rules.value;
    const progressCurrent = countIf(ratings, (row) => {
      const value = field === 'photo'
        ? (row?.photo_url ?? row?.[field])
        : (field === 'price' ? (row?.price_cents ?? row?.price) : row?.[field]);
      if (typeof expected === 'boolean') return (!!value) === expected;
      return value != null;
    });
    return { progress_current: progressCurrent, progress_target: 1 };
  }

  if (type === 'comparison') {
    const field = String(rules.field || '').trim();
    const op = String(rules.op || '').trim();
    const targetValue = Number(rules.value);
    if (!field || !Number.isFinite(targetValue)) return null;
    const progressCurrent = countIf(ratings, (row) => {
      const numeric = Number(field === 'stars' ? (row?.rating ?? row?.stars) : row?.[field]);
      if (!Number.isFinite(numeric)) return false;
      if (op === '>=') return numeric >= targetValue;
      if (op === '<=') return numeric <= targetValue;
      if (op === '>') return numeric > targetValue;
      if (op === '<') return numeric < targetValue;
      if (op === '=') return numeric === targetValue;
      return false;
    });
    return { progress_current: progressCurrent, progress_target: 1 };
  }

  return null;
}

module.exports = function tabsRoutes(opts) {
  const router = express.Router();
  const {
    rest,
    authMiddleware,
    softAuthMiddleware = (_req, _res, next) => next(),
    adminMiddleware,
    totalFromContentRange,
  } = opts;

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
      const uaRes = await rest(
        'GET',
        `/user_achievements?user_id=eq.${userId}&select=achievement_id,unlocked_at&order=unlocked_at.desc`
      );
      if (uaRes.status >= 400) return res.status(uaRes.status).json(uaRes.body || { error: 'Upstream error' });
      const rows = Array.isArray(uaRes.body) ? uaRes.body : [];
      if (rows.length === 0) return res.json({ data: [] });
      const ids = rows.map((r) => r.achievement_id).filter(Boolean);
      const idList = ids.map((id) => encodeURIComponent(id)).join(',');
      const aRes = await rest(
        'GET',
        `/achievements?id=in.(${idList})&select=id,key,name,description,reward_tabs,category_key`
      );
      if (aRes.status >= 400) return res.status(aRes.status).json(aRes.body || { error: 'Upstream error' });
      const achievements = Array.isArray(aRes.body) ? aRes.body : [];
      const byId = Object.fromEntries(achievements.map((a) => [a.id, a]));
      const categoryKeys = [...new Set(achievements.map((a) => a.category_key).filter(Boolean))];
      let iconByCategory = Object.create(null);
      if (categoryKeys.length) {
        const keyList = categoryKeys.map((key) => encodeURIComponent(key)).join(',');
        const categoryRes = await rest('GET', `/achievement_categories?key=in.(${keyList})&select=key,icon`);
        if (categoryRes.status < 400) {
          const categories = Array.isArray(categoryRes.body) ? categoryRes.body : [];
          iconByCategory = Object.fromEntries(
            categories.map((row) => [row.key, row.icon || null])
          );
        }
      }
      const data = rows.map((row) => {
        const a = byId[row.achievement_id];
        if (!a) return null;
        return {
          id: a.id,
          achievement_id: a.id,
          key: a.key,
          name: a.name,
          description: a.description || '',
          reward_tabs: Number(a.reward_tabs) || 0,
          earned_at: row.unlocked_at || null,
          icon_url: iconByCategory[a.category_key] || null,
        };
      }).filter(Boolean);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/achievements/next — optional next-achievement nudge data for current user
  router.get('/achievements/next', authMiddleware, async (req, res, next) => {
    try {
      const userIdRaw = String(req.claims.sub || '').trim();
      if (!userIdRaw) return res.status(400).json({ error: 'Missing user id' });
      const userId = encodeURIComponent(userIdRaw);
      const [unlockedRes, allRes, ratingsRes] = await Promise.all([
        rest('GET', `/user_achievements?user_id=eq.${userId}&select=achievement_id`),
        rest(
          'GET',
          '/achievements?active=eq.true&trigger_type=eq.rating_submitted&select=id,key,name,description,subtype,rules,category_key'
        ),
        rest('GET', `/ratings?user_id=eq.${userId}&select=style&limit=5000`),
      ]);
      if (unlockedRes.status >= 400) return res.status(unlockedRes.status).json(unlockedRes.body || { error: 'Upstream error' });
      if (allRes.status >= 400) return res.status(allRes.status).json(allRes.body || { error: 'Upstream error' });
      if (ratingsRes.status >= 400) return res.status(ratingsRes.status).json(ratingsRes.body || { error: 'Upstream error' });

      const unlockedIds = new Set(
        (Array.isArray(unlockedRes.body) ? unlockedRes.body : [])
          .map((row) => row?.achievement_id)
          .filter(Boolean)
      );
      const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
      const totalRatings = ratings.length;
      const styleCounts = ratings.reduce((acc, row) => {
        const key = normalizeStyle(row?.style);
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      const candidates = (Array.isArray(allRes.body) ? allRes.body : [])
        .filter((a) => a && a.id && !unlockedIds.has(a.id))
        .map((a) => {
          const rules = a.rules && typeof a.rules === 'object' ? a.rules : {};
          const progressTarget = Number(rules.min_count);
          if (!Number.isFinite(progressTarget) || progressTarget <= 0) return null;
          const styleEq = normalizeStyle(rules.style_eq);
          const progressCurrent = styleEq ? Number(styleCounts[styleEq] || 0) : totalRatings;
          const remaining = Math.max(progressTarget - progressCurrent, 0);
          return {
            id: a.id,
            key: a.key,
            name: a.name,
            description: a.description || '',
            category_key: a.category_key || null,
            progress_current: progressCurrent,
            progress_target: progressTarget,
            remaining,
          };
        })
        .filter(Boolean)
        .sort((left, right) => {
          if (left.remaining !== right.remaining) return left.remaining - right.remaining;
          if (left.progress_target !== right.progress_target) return left.progress_target - right.progress_target;
          return String(left.name || '').localeCompare(String(right.name || ''));
        });

      if (!candidates.length) return res.json({ data: null });

      const top = candidates[0];
      let icon = null;
      if (top.category_key) {
        const catRes = await rest(
          'GET',
          `/achievement_categories?key=eq.${encodeURIComponent(top.category_key)}&select=icon&limit=1`
        );
        if (catRes.status < 400 && Array.isArray(catRes.body) && catRes.body[0]) {
          icon = catRes.body[0].icon || null;
        }
      }

      res.json({
        data: {
          id: top.id,
          key: top.key,
          name: top.name,
          description: top.description,
          progress_current: top.progress_current,
          progress_target: top.progress_target,
          remaining: top.remaining,
          icon_url: icon,
          is_fallback: false,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/achievements/fallback — deterministic "suggested" achievement for current user
  router.get('/achievements/fallback', authMiddleware, async (req, res, next) => {
    try {
      const userIdRaw = String(req.claims.sub || '').trim();
      if (!userIdRaw) return res.status(400).json({ error: 'Missing user id' });
      const userId = encodeURIComponent(userIdRaw);

      const [unlockedRes, allRes, ratingsRes] = await Promise.all([
        rest('GET', `/user_achievements?user_id=eq.${userId}&select=achievement_id`),
        rest(
          'GET',
          '/achievements?active=eq.true&trigger_type=eq.rating_submitted&select=id,key,name,description,rules,category_key,is_hidden'
        ),
        rest(
          'GET',
          `/ratings?user_id=eq.${userId}&select=style,photo_url,notes,price_cents,venue_id,rating,is_new_beer,city,created_at&limit=5000`
        ),
      ]);

      if (unlockedRes.status >= 400) return res.status(unlockedRes.status).json(unlockedRes.body || { error: 'Upstream error' });
      if (allRes.status >= 400) return res.status(allRes.status).json(allRes.body || { error: 'Upstream error' });
      if (ratingsRes.status >= 400) return res.status(ratingsRes.status).json(ratingsRes.body || { error: 'Upstream error' });

      const unlockedIds = new Set(
        (Array.isArray(unlockedRes.body) ? unlockedRes.body : [])
          .map((row) => row?.achievement_id)
          .filter(Boolean)
      );
      const ratings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];

      const distinctStyles = new Set();
      const distinctVenues = new Set();
      const distinctCities = new Set();
      const distinctMonths = new Set();
      for (const row of ratings) {
        const style = normalizeStyle(row?.style);
        if (style) distinctStyles.add(style);
        if (row?.venue_id) distinctVenues.add(String(row.venue_id));
        const city = String(row?.city || '').trim().toLowerCase();
        if (city) distinctCities.add(city);
        const createdAt = new Date(row?.created_at);
        if (!Number.isNaN(createdAt.getTime())) distinctMonths.add(createdAt.getUTCMonth() + 1);
      }

      const stats = {
        totalRatings: ratings.length,
        distinctStyles: distinctStyles.size,
        distinctVenues: distinctVenues.size,
        distinctCities: distinctCities.size,
        distinctMonths: distinctMonths.size,
      };

      const candidates = (Array.isArray(allRes.body) ? allRes.body : [])
        .filter((a) => a && a.id && !a.is_hidden && !unlockedIds.has(a.id))
        .map((a) => {
          const progress = computeFallbackProgress(a, ratings, stats);
          if (!progress) return null;
          const progressCurrent = Math.max(Number(progress.progress_current) || 0, 0);
          const progressTarget = Math.max(Number(progress.progress_target) || 0, 0);
          if (!progressTarget) return null;
          return {
            id: a.id,
            key: a.key,
            name: a.name,
            description: a.description || '',
            category_key: a.category_key || null,
            progress_current: progressCurrent,
            progress_target: progressTarget,
            remaining: Math.max(progressTarget - progressCurrent, 0),
          };
        })
        .filter(Boolean)
        .sort((left, right) => String(left.key || '').localeCompare(String(right.key || '')));

      if (!candidates.length) return res.status(204).send();

      const nonCompleted = candidates.filter((c) => c.remaining > 0);
      const inProgress = nonCompleted.filter((c) => c.progress_current > 0);
      const pool = inProgress.length ? inProgress : (nonCompleted.length ? nonCompleted : candidates);
      const seed = `${userIdRaw}:${getUtcDayKey()}:fallback`;
      const picked = pool[stableIndexForSeed(seed, pool.length)];

      let icon = null;
      if (picked.category_key) {
        const catRes = await rest(
          'GET',
          `/achievement_categories?key=eq.${encodeURIComponent(picked.category_key)}&select=icon&limit=1`
        );
        if (catRes.status < 400 && Array.isArray(catRes.body) && catRes.body[0]) {
          icon = catRes.body[0].icon || null;
        }
      }

      return res.status(200).json({
        id: picked.id,
        key: picked.key,
        name: picked.name,
        description: picked.description,
        progress_current: picked.progress_current,
        progress_target: picked.progress_target,
        remaining: picked.remaining,
        icon_url: icon,
        is_fallback: true,
        reason: 'fallback_random',
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/cosmetics — active cosmetics shop listing
  router.get('/cosmetics', softAuthMiddleware, async (req, res, next) => {
    try {
      const out = await rest(
        'GET',
        '/cosmetics?active=eq.true&select=id,key,type,name,description,rarity,asset_url,preview_asset_url,title_text,unlock_type,achievement_key,tab_price,active,sort_order,created_at&order=sort_order.asc,created_at.asc'
      );
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Upstream error' });
      res.json({ data: Array.isArray(out.body) ? out.body : [] });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/users/:id/cosmetics — user inventory
  router.get('/users/:id/cosmetics', async (req, res, next) => {
    try {
      const userIdRaw = String(req.params.id || '').trim();
      if (!userIdRaw) return res.status(400).json({ error: 'Missing user id' });
      const userId = encodeURIComponent(userIdRaw);

      const [ownedOut, profileOut] = await Promise.all([
        rest('GET', `/user_cosmetics?user_id=eq.${userId}&select=id,cosmetic_id,acquired_via,acquired_at&order=acquired_at.desc&limit=5000`),
        rest('GET', `/profiles?id=eq.${userId}&select=equipped_border_id,equipped_title_id&limit=1`),
      ]);
      if (ownedOut.status >= 400) return res.status(ownedOut.status).json(ownedOut.body || { error: 'Upstream error' });
      if (profileOut.status >= 400) return res.status(profileOut.status).json(profileOut.body || { error: 'Upstream error' });

      const ownedRows = Array.isArray(ownedOut.body) ? ownedOut.body : [];
      if (!ownedRows.length) return res.json({ data: [] });
      const profile = Array.isArray(profileOut.body) && profileOut.body[0] ? profileOut.body[0] : null;
      const equippedBorderId = profile?.equipped_border_id || null;
      const equippedTitleId = profile?.equipped_title_id || null;

      const cosmeticIds = [...new Set(ownedRows.map((row) => row.cosmetic_id).filter(Boolean))];
      const idList = cosmeticIds.map((id) => encodeURIComponent(id)).join(',');
      if (!idList) return res.json({ data: [] });

      const cosmeticsOut = await rest(
        'GET',
        `/cosmetics?id=in.(${idList})&select=id,key,type,name,description,rarity,asset_url,preview_asset_url,title_text,unlock_type,achievement_key,tab_price,active,sort_order,created_at`
      );
      if (cosmeticsOut.status >= 400) return res.status(cosmeticsOut.status).json(cosmeticsOut.body || { error: 'Upstream error' });
      const cosmetics = Array.isArray(cosmeticsOut.body) ? cosmeticsOut.body : [];
      const byId = Object.fromEntries(cosmetics.map((item) => [item.id, item]));

      const data = ownedRows
        .map((row) => {
          const cosmetic = byId[row.cosmetic_id];
          if (!cosmetic) return null;
          return {
            id: cosmetic.id,
            key: cosmetic.key,
            type: cosmetic.type,
            name: cosmetic.name,
            description: cosmetic.description,
            rarity: cosmetic.rarity,
            asset_url: cosmetic.asset_url ?? null,
            preview_asset_url: cosmetic.preview_asset_url ?? null,
            title_text: cosmetic.title_text ?? null,
            acquired_via: row.acquired_via,
            acquired_at: row.acquired_at,
            is_equipped: cosmetic.id === equippedBorderId || cosmetic.id === equippedTitleId,
          };
        })
        .filter(Boolean);

      res.json({ data });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/cosmetics/purchase — purchase by cosmetic_key (or cosmetic_id for compatibility)
  router.post('/cosmetics/purchase', authMiddleware, async (req, res, next) => {
    try {
      const body = req.body || {};
      const userId = String(req.claims.sub || '').trim();
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      let cosmeticKey = body?.cosmetic_key != null ? String(body.cosmetic_key).trim() : '';
      const cosmeticId = body?.cosmetic_id != null ? String(body.cosmetic_id).trim() : '';
      if (!cosmeticKey && !cosmeticId) {
        return res.status(400).json({ error: 'cosmetic_key is required (or cosmetic_id for backward compatibility)' });
      }

      if (!cosmeticKey && cosmeticId) {
        const lookupOut = await rest('GET', `/cosmetics?id=eq.${encodeURIComponent(cosmeticId)}&select=key&limit=1`);
        if (lookupOut.status >= 400) return res.status(lookupOut.status).json(lookupOut.body || { error: 'Upstream error' });
        const row = Array.isArray(lookupOut.body) ? lookupOut.body[0] : null;
        if (!row?.key) return res.status(400).json({ error: 'Invalid cosmetic_id' });
        cosmeticKey = String(row.key).trim();
      }

      const rpcOut = await rest('POST', '/rpc/purchase_cosmetic', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_user_id: userId,
          p_cosmetic_key: cosmeticKey,
        }),
      });
      if (rpcOut.status >= 400) return res.status(502).json(rpcOut.body || { error: 'Purchase failed' });

      const payload = rpcOut.body && typeof rpcOut.body === 'object' ? rpcOut.body : {};
      if (payload.ok !== true) {
        const code = String(payload.error_code || 'purchase_failed');
        const status = mapPurchaseErrorStatus(code);
        return res.status(status).json({
          error: payload.message || 'Purchase failed',
          error_code: code,
          tabs_balance: payload.tabs_balance ?? null,
          tab_price: payload.tab_price ?? null,
        });
      }

      return res.status(200).json({
        data: {
          cosmetic_id: payload.cosmetic_id,
          cosmetic_key: payload.cosmetic_key,
          acquired_via: payload.acquired_via || 'purchase',
          tabs_spent: payload.tabs_spent ?? null,
          tabs_balance: payload.tabs_balance ?? null,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/cosmetics/equip
  // Contract:
  // - Equip: { cosmetic_id: string } (slot inferred from cosmetics.type; optional slot must match)
  // - Unequip per-slot: { slot: 'border'|'title', cosmetic_id: null }
  router.post('/cosmetics/equip', authMiddleware, async (req, res, next) => {
    try {
      const userId = String(req.claims.sub || '').trim();
      const slotRaw = req.body?.slot;
      const slot = slotRaw == null ? '' : String(slotRaw).trim();
      const cosmeticIdRaw = req.body?.cosmetic_id;

      if (cosmeticIdRaw == null) {
        if (!['border', 'title'].includes(slot)) {
          return res.status(400).json({ error: "slot must be 'border' or 'title' when cosmetic_id is null" });
        }
        const field = slot === 'border' ? 'equipped_border_id' : 'equipped_title_id';
        const patchOut = await rest('PATCH', `/profiles?id=eq.${encodeURIComponent(userId)}`, {
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ [field]: null }),
        });
        if (patchOut.status >= 400) return res.status(patchOut.status).json(patchOut.body || { error: 'Failed to update profile' });
        const row = Array.isArray(patchOut.body) ? patchOut.body[0] : null;
        if (!row) return res.status(404).json({ error: 'Profile not found' });
        return res.json({
          data: {
            slot,
            cosmetic_id: null,
            equipped_border_id: row.equipped_border_id ?? null,
            equipped_title_id: row.equipped_title_id ?? null,
          },
        });
      }

      const cosmeticId = String(cosmeticIdRaw).trim();
      if (!UUID_REGEX.test(cosmeticId)) {
        return res.status(400).json({ error: 'cosmetic_id must be a UUID or null' });
      }

      const [cosmeticOut, ownedOut] = await Promise.all([
        rest('GET', `/cosmetics?id=eq.${encodeURIComponent(cosmeticId)}&select=id,type,active&limit=1`),
        rest(
          'GET',
          `/user_cosmetics?user_id=eq.${encodeURIComponent(userId)}&cosmetic_id=eq.${encodeURIComponent(cosmeticId)}&select=id&limit=1`
        ),
      ]);
      if (cosmeticOut.status >= 400) return res.status(cosmeticOut.status).json(cosmeticOut.body || { error: 'Upstream error' });
      if (ownedOut.status >= 400) return res.status(ownedOut.status).json(ownedOut.body || { error: 'Upstream error' });

      const cosmetic = Array.isArray(cosmeticOut.body) && cosmeticOut.body[0] ? cosmeticOut.body[0] : null;
      if (!cosmetic) return res.status(400).json({ error: 'Invalid cosmetic_id' });
      if (cosmetic.active !== true) return res.status(400).json({ error: 'Cosmetic is inactive' });
      const inferredSlot = String(cosmetic.type || '').trim();
      if (!['border', 'title'].includes(inferredSlot)) {
        return res.status(400).json({ error: 'Cosmetic has unsupported type' });
      }
      if (slot && slot !== inferredSlot) {
        return res.status(400).json({ error: `Cosmetic type must match slot '${slot}'` });
      }

      const owned = Array.isArray(ownedOut.body) && ownedOut.body.length > 0;
      if (!owned) return res.status(400).json({ error: 'Cosmetic is not owned by user' });

      const field = inferredSlot === 'border' ? 'equipped_border_id' : 'equipped_title_id';
      const patchOut = await rest('PATCH', `/profiles?id=eq.${encodeURIComponent(userId)}`, {
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ [field]: cosmeticId }),
      });
      if (patchOut.status >= 400) return res.status(patchOut.status).json(patchOut.body || { error: 'Failed to update profile' });
      const row = Array.isArray(patchOut.body) ? patchOut.body[0] : null;
      if (!row) return res.status(404).json({ error: 'Profile not found' });

      return res.json({
        data: {
          slot: inferredSlot,
          cosmetic_id: cosmeticId,
          equipped_border_id: row.equipped_border_id ?? null,
          equipped_title_id: row.equipped_title_id ?? null,
        },
      });
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
      const periodRaw = String(req.query.period || 'alltime').trim().toLowerCase();
      const period = ['weekly', 'monthly', 'alltime'].includes(periodRaw) ? periodRaw : 'alltime';
      const periodStart = getPeriodStartUtc(period);
      const out = await rest(
        'GET',
        `/tabs_leaderboard?order=lifetime_tabs_earned.desc&limit=${limit}&offset=${offset}`,
        { headers: { Prefer: 'count=exact' } }
      );
      if (out.status >= 400) return res.status(out.status).json(out.body || { error: 'Upstream error' });
      const rows = Array.isArray(out.body) ? out.body : [];
      const userIds = [...new Set(rows.map((row) => String(row?.user_id || '').trim()).filter(Boolean))];
      const statsByUser = Object.create(null);
      userIds.forEach((id) => {
        statsByUser[id] = {
          rating_count: 0,
          avg_rating_sum: 0,
          total_cheers: 0,
        };
      });

      if (userIds.length) {
        const userInClause = userIds.map((id) => encodeURIComponent(id)).join(',');
        let ratingsPath = `/ratings?user_id=in.(${userInClause})&select=id,user_id,rating,created_at&limit=50000`;
        if (periodStart) ratingsPath += `&created_at=gte.${encodeURIComponent(periodStart)}`;
        const [ratingsRes, ratingsOwnerRes] = await Promise.all([
          rest('GET', ratingsPath),
          periodStart
            ? rest('GET', `/ratings?user_id=in.(${userInClause})&select=id,user_id&limit=50000`)
            : Promise.resolve(null),
        ]);
        if (ratingsRes.status < 400) {
          const ratingsForPeriod = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
          ratingsForPeriod.forEach((rating) => {
            const userId = String(rating?.user_id || '').trim();
            if (!userId || !statsByUser[userId]) return;
            const value = Number(rating?.rating);
            statsByUser[userId].rating_count += 1;
            if (Number.isFinite(value)) statsByUser[userId].avg_rating_sum += value;
          });

          const ownerSource = periodStart
            ? (ratingsOwnerRes && ratingsOwnerRes.status < 400 && Array.isArray(ratingsOwnerRes.body) ? ratingsOwnerRes.body : [])
            : ratingsForPeriod;
          const ratingOwnerById = Object.create(null);
          ownerSource.forEach((rating) => {
            if (rating?.id && rating?.user_id) ratingOwnerById[String(rating.id)] = String(rating.user_id);
          });

          const allRatingIds = Object.keys(ratingOwnerById);
          if (allRatingIds.length) {
            for (const chunk of chunkArray(allRatingIds, 250)) {
              const encodedIds = chunk.map((id) => encodeURIComponent(id)).join(',');
              let cheersPath = `/reactions?reaction_type=eq.cheers&rating_id=in.(${encodedIds})&select=rating_id&limit=50000`;
              if (periodStart) cheersPath += `&created_at=gte.${encodeURIComponent(periodStart)}`;
              const cheersRes = await rest('GET', cheersPath);
              if (cheersRes.status >= 400) continue;
              const reactions = Array.isArray(cheersRes.body) ? cheersRes.body : [];
              reactions.forEach((reaction) => {
                const ownerId = reaction?.rating_id ? ratingOwnerById[String(reaction.rating_id)] : null;
                if (!ownerId || !statsByUser[ownerId]) return;
                statsByUser[ownerId].total_cheers += 1;
              });
            }
          }
        }
      }

      const data = rows.map((row, index) => {
        const userId = String(row?.user_id || '').trim();
        const stats = statsByUser[userId] || { rating_count: 0, avg_rating_sum: 0, total_cheers: 0 };
        const avg = stats.rating_count > 0 ? (stats.avg_rating_sum / stats.rating_count) : 0;
        return {
          ...row,
          rating_count: stats.rating_count,
          avg_rating: Number(avg.toFixed(2)),
          total_cheers: stats.total_cheers,
          rank: offset + index + 1,
        };
      });
      res.json({
        data,
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
      const notifications = Array.isArray(out.body) ? out.body : [];
      res.json({
        data: notifications,
        pagination: {
          limit,
          offset,
          total: totalFromContentRange(out.headers['content-range']) ?? 0,
        },
        metadata: { unread_count: unreadCount },
        notifications,
        unread_count: unreadCount,
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
