/**
 * BeerBook process-event Engine (in-app, no Supabase Edge Runtime).
 * Same logic as supabase/functions/process-event/engine.ts.
 * Uses rest() (PostgREST) for tabs_ledger, profiles, achievements, user_achievements, ratings.
 * Idempotency: tabs_ledger.event_id unique constraint; on conflict (409 or 23505) return zero delta.
 */

const VALID_EVENT_TYPES = [
  'rating_award',
  'cheers_given',
  'cheers_received',
  'rating_submitted',
  'achievement_unlock',
  'admin_grant',
  'spend',
];
const { calculateAchievementProgress } = require('./achievementProgress');

function getAdminUserIds() {
  const rawValues = [
    process.env.ADMIN_USER_ID || '',
    process.env.ADMIN_USER_IDS || '',
  ];
  return new Set(
    rawValues
      .flatMap((value) => String(value).split(','))
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function isAdminUser(userId) {
  if (typeof userId !== 'string' || !userId.trim()) return false;
  return getAdminUserIds().has(userId.trim());
}

/** Monday 00:00 UTC for the current week (ISO string). */
function getCurrentWeekStartUtc() {
  const d = new Date();
  const utcDay = d.getUTCDay();
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Return true if response indicates unique constraint violation (idempotent). */
function isConflict(res) {
  if (res.status === 409) return true;
  const code = res.body && (res.body.code || res.body.pgCode);
  return code === '23505' || code === 23505;
}

/**
 * Rating award: enforce weekly cap via atomic RPC (Phase 3.1). Idempotent by event_id.
 * Applied in both Node and Edge runtimes for parity; admin uses high cap.
 */
async function processRatingAward(rest, totalFromContentRange, userId, eventId, payload) {
  const breakdown = payload.breakdown ?? {};
  const context = payload.context ?? {};
  const amount = Number(payload.amount ?? 0);
  if (!Number.isInteger(amount) || amount < 0) return { amount: 0 };

  async function refreshUserTabsProfileAfterRatingAward(tabsDelta) {
    const res = await rest('POST', '/rpc/refresh_rating_award_profile_cache', {
      body: JSON.stringify({
        p_user_id: userId,
        p_tabs_delta: tabsDelta,
      }),
    });
    if (res.status >= 400) {
      throw new Error(`refresh_rating_award_profile_cache: ${(res.body && res.body.message) || res.status}`);
    }
    const row = Array.isArray(res.body) ? res.body[0] : res.body;
    return {
      current_streak_weeks: Number(row && row.current_streak_weeks) || 0,
      longest_streak_weeks: Number(row && row.longest_streak_weeks) || 0,
    };
  }

  const weeklyCap = isAdminUser(userId) ? 99999 : 10;
  const res = await rest('POST', '/rpc/award_rating_tabs_with_cap', {
    body: JSON.stringify({
      p_user_id: userId,
      p_amount: amount,
      p_weekly_cap: weeklyCap,
      p_event_id: eventId,
      p_breakdown: breakdown,
      p_context: context,
    }),
  });
  if (res.status >= 400) throw new Error(`award_rating_tabs_with_cap: ${(res.body && res.body.message) || res.status}`);
  const awardedAmount = typeof res.body === 'number' ? res.body : 0;

  const streaks = await refreshUserTabsProfileAfterRatingAward(awardedAmount);
  return { amount: awardedAmount, ...streaks };
}

/**
 * Cheers or single-row award: insert one ledger row. Idempotent by event_id.
 */
async function processSingleAward(rest, ledgerUserId, eventId, eventType, payload, contextOverride) {
  const amount = Number(payload.amount ?? 0);
  if (!Number.isInteger(amount)) return 0;
  const breakdown = payload.breakdown ?? {};
  const context = contextOverride ?? payload.context ?? {};
  const res = await rest('POST', '/tabs_ledger', {
    body: JSON.stringify({
      event_id: eventId,
      user_id: ledgerUserId,
      event_type: eventType,
      amount,
      breakdown,
      context,
    }),
  });
  if (isConflict(res)) return 0;
  if (res.status >= 400) throw new Error(`tabs_ledger insert: ${(res.body && res.body.message) || res.status}`);
  return amount;
}

async function loadAchievementsForTrigger(rest, triggerType) {
  const enc = encodeURIComponent;
  const res = await rest('GET', `/achievements?trigger_type=eq.${enc(triggerType)}&active=eq.true&select=id,key,name,reward_tabs,subtype,rules`);
  if (res.status >= 400) return [];
  const rows = Array.isArray(res.body) ? res.body : [];
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    reward_tabs: r.reward_tabs ?? 0,
    subtype: r.subtype,
    rules: r.rules ?? {},
  }));
}

async function grantAchievementCosmetics(rest, userId, achievementKey) {
  const key = String(achievementKey || '').trim();
  if (!key) return;
  const enc = encodeURIComponent;
  const cosmeticsRes = await rest(
    'GET',
    `/cosmetics?achievement_key=eq.${enc(key)}&select=id`
  );
  if (cosmeticsRes.status >= 400) return;
  const rows = Array.isArray(cosmeticsRes.body) ? cosmeticsRes.body : [];
  if (rows.length === 0) return;

  for (const row of rows) {
    const cosmeticId = row && row.id ? String(row.id) : '';
    if (!cosmeticId) continue;
    await rest('POST', '/user_cosmetics?on_conflict=user_id,cosmetic_id', {
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({
        user_id: userId,
        cosmetic_id: cosmeticId,
        acquired_via: 'achievement',
      }),
    });
  }
}

/**
 * rating_submitted: evaluate achievements. Mint ledger only if user_achievements INSERT actually inserted (no conflict).
 */
async function processRatingSubmitted(rest, totalFromContentRange, userId, payload) {
  const unlocked = [];
  let tabsDelta = 0;
  const achievements = await loadAchievementsForTrigger(rest, 'rating_submitted');
  for (const ach of achievements) {
    const progress = await calculateAchievementProgress({
      rest,
      totalFromContentRange,
      user_id: userId,
      rules: ach.rules,
      subtype: ach.subtype,
    });
    if (!progress || progress.progress_current < progress.progress_target) continue;

    const rpcRes = await rest('POST', '/rpc/unlock_achievement_with_rewards', {
      body: JSON.stringify({
        p_user_id: userId,
        p_achievement_id: ach.id,
        p_achievement_key: ach.key,
        p_reward_tabs: ach.reward_tabs,
        p_progress: { progress_current: progress.progress_current },
        p_context: payload,
      }),
    });
    if (rpcRes.status >= 400) {
      throw new Error(`unlock_achievement_with_rewards: ${(rpcRes.body && rpcRes.body.message) || rpcRes.status}`);
    }

    const result = Array.isArray(rpcRes.body) ? rpcRes.body[0] : rpcRes.body;
    if (result && result.already_unlocked) continue;

    unlocked.push({ key: ach.key, name: ach.name, reward_tabs: ach.reward_tabs });
    tabsDelta += (result && result.reward_tabs_granted) || 0;
  }
  return { unlocked, tabsDelta };
}

async function getTabsBalance(rest, userId) {
  const enc = encodeURIComponent(userId);
  const res = await rest('GET', `/profiles?id=eq.${enc}&select=tabs_balance&limit=1`);
  if (res.status >= 400) return 0;
  const rows = Array.isArray(res.body) ? res.body : [];
  const row = rows[0];
  return row != null && typeof row.tabs_balance === 'number' ? row.tabs_balance : 0;
}

/**
 * Main entry: same behavior as Edge Function engine.
 * @param {object} opts - { rest, totalFromContentRange }
 * @param {string} eventType
 * @param {string|null} eventId
 * @param {Record<string, unknown>} payload
 * @param {string} userId - Keycloak sub (JWT caller)
 * @returns {Promise<{ unlocked: Array<{ key: string, name: string, reward_tabs: number }>, tabs_delta: number, tabs_balance: number, current_streak_weeks: number|null, longest_streak_weeks: number|null }>}
 */
async function processEvent(opts, eventType, eventId, payload, userId) {
  const { rest, totalFromContentRange } = opts;
  let tabsDelta = 0;
  let unlocked = [];
  let balanceUserId = userId;
  let currentStreakWeeks = null;
  let longestStreakWeeks = null;

  if (eventType === 'rating_award') {
    if (!eventId) throw new Error('event_id required for rating_award');
    const result = await processRatingAward(rest, totalFromContentRange, userId, eventId, payload);
    tabsDelta = result.amount;
    currentStreakWeeks = result.current_streak_weeks;
    longestStreakWeeks = result.longest_streak_weeks;
  } else if (eventType === 'cheers_received') {
    if (!eventId) throw new Error('event_id required for cheers_received');
    const target = payload.target_user_id;
    if (typeof target !== 'string' || !target.trim()) {
      const err = new Error('payload.target_user_id (Keycloak sub of receiver) is required for cheers_received');
      err.status = 400;
      throw err;
    }
    const ledgerUserId = target.trim();
    balanceUserId = ledgerUserId;
    const context = {
      from_user_id: userId,
      to_user_id: ledgerUserId,
      ...(payload.context || {}),
    };
    tabsDelta = await processSingleAward(rest, ledgerUserId, eventId, eventType, payload, context);
  } else if (eventType === 'cheers_given' || eventType === 'admin_grant') {
    if (!eventId) throw new Error(`event_id required for ${eventType}`);
    if (eventType === 'admin_grant' && !isAdminUser(userId)) {
      const err = new Error('Forbidden: admin_grant requires admin role');
      err.status = 403;
      throw err;
    }
    const context =
      eventType === 'cheers_given'
        ? { from_user_id: userId, to_user_id: payload.to_user_id ?? null, ...(payload.context || {}) }
        : undefined;
    tabsDelta = await processSingleAward(rest, userId, eventId, eventType, payload, context);
  } else if (eventType === 'rating_submitted') {
    const result = await processRatingSubmitted(rest, totalFromContentRange, userId, payload);
    unlocked = result.unlocked;
    tabsDelta = result.tabsDelta;
  }
  // achievement_unlock, spend: no-op

  const tabs_balance = await getTabsBalance(rest, balanceUserId);
  return {
    unlocked,
    tabs_delta: tabsDelta,
    tabs_balance,
    current_streak_weeks: currentStreakWeeks,
    longest_streak_weeks: longestStreakWeeks,
  };
}

module.exports = { processEvent, VALID_EVENT_TYPES, isAdminUser };
