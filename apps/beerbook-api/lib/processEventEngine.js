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
 * Count rating_award rows in tabs_ledger for user in current week (Monday 00:00 UTC).
 */
async function countRatingAwardsThisWeek(rest, totalFromContentRange, userId) {
  const weekStart = getCurrentWeekStartUtc();
  const enc = encodeURIComponent;
  const res = await rest('GET', `/tabs_ledger?user_id=eq.${enc(userId)}&event_type=eq.rating_award&created_at=gte.${enc(weekStart)}&select=id`, {
    headers: { Prefer: 'count=exact' },
  });
  if (res.status >= 400) return 999;
  return totalFromContentRange(res.headers['content-range']) ?? 0;
}

/**
 * Rating award: enforce weekly cap (10), then insert one ledger row. Idempotent by event_id.
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

  let awardedAmount = amount;
  const skipWeeklyCap = isAdminUser(userId);
  if (!skipWeeklyCap) {
    const count = await countRatingAwardsThisWeek(rest, totalFromContentRange, userId);
    if (count >= 10) awardedAmount = 0;
  }

  if (awardedAmount > 0) {
    const res = await rest('POST', '/tabs_ledger', {
      body: JSON.stringify({
        event_id: eventId,
        user_id: userId,
        event_type: 'rating_award',
        amount: awardedAmount,
        breakdown,
        context,
      }),
    });
    if (isConflict(res)) awardedAmount = 0;
    else if (res.status >= 400) throw new Error(`tabs_ledger insert: ${(res.body && res.body.message) || res.status}`);
  }

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
    `/cosmetics?achievement_key=eq.${enc(key)}&type=eq.border&select=id&limit=1`
  );
  if (cosmeticsRes.status >= 400) return;
  const rows = Array.isArray(cosmeticsRes.body) ? cosmeticsRes.body : [];
  const cosmeticId = rows[0] && rows[0].id ? String(rows[0].id) : '';
  if (!cosmeticId) return;

  // Use upsert semantics so duplicate grants are a no-op.
  await rest('POST', '/user_cosmetics?on_conflict=user_id,cosmetic_id', {
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({
      user_id: userId,
      cosmetic_id: cosmeticId,
      acquired_via: 'achievement',
    }),
  });
}

async function getCheckinCount(rest, totalFromContentRange, userId) {
  const enc = encodeURIComponent(userId);
  const res = await rest('GET', `/ratings?user_id=eq.${enc}&select=id`, { headers: { Prefer: 'count=exact' } });
  if (res.status >= 400) return 0;
  return totalFromContentRange(res.headers['content-range']) ?? 0;
}

async function evaluateCheckinCount(rest, totalFromContentRange, userId, _payload, rules) {
  const minCheckins = Number(rules.min_checkins);
  if (!Number.isInteger(minCheckins) || minCheckins < 0) return false;
  const count = await getCheckinCount(rest, totalFromContentRange, userId);
  return count >= minCheckins;
}

function evaluateTimeWindowCheckin(_rest, _userId, payload, rules) {
  const checkinTime = payload.checkin_time;
  const start = rules.start;
  const end = rules.end;
  if (!checkinTime || !start || !end) return false;
  const [h, m] = String(checkinTime).split(':').map(Number);
  const [startH, startM] = String(start).split(':').map(Number);
  const [endH, endM] = String(end).split(':').map(Number);
  const mins = (h ?? 0) * 60 + (m ?? 0);
  const startMins = (startH ?? 0) * 60 + (startM ?? 0);
  const endMins = (endH ?? 0) * 60 + (endM ?? 0);
  if (startMins <= endMins) return mins >= startMins && mins <= endMins;
  return mins >= startMins || mins <= endMins;
}

const EVALUATORS = {
  checkin_count: evaluateCheckinCount,
  time_window_checkin: (rest, _userId, p, r) => Promise.resolve(evaluateTimeWindowCheckin(rest, '', p, r)),
};

async function evaluate(rest, totalFromContentRange, userId, payload, subtype, rules) {
  const fn = EVALUATORS[subtype];
  if (fn) return fn(rest, totalFromContentRange, userId, payload, rules);
  return false;
}

/**
 * rating_submitted: evaluate achievements. Mint ledger only if user_achievements INSERT actually inserted (no conflict).
 */
async function processRatingSubmitted(rest, totalFromContentRange, userId, payload) {
  const unlocked = [];
  let tabsDelta = 0;
  const achievements = await loadAchievementsForTrigger(rest, 'rating_submitted');
  for (const ach of achievements) {
    const passed = await evaluate(rest, totalFromContentRange, userId, payload, ach.subtype, ach.rules);
    if (!passed) continue;

    const insertRes = await rest('POST', '/user_achievements', {
      body: JSON.stringify({
        user_id: userId,
        achievement_id: ach.id,
        progress: {},
        context: payload,
      }),
    });
    if (isConflict(insertRes)) continue;
    if (insertRes.status >= 400) throw new Error(`user_achievements insert: ${(insertRes.body && insertRes.body.message) || insertRes.status}`);

    unlocked.push({ key: ach.key, name: ach.name, reward_tabs: ach.reward_tabs });
    await grantAchievementCosmetics(rest, userId, ach.key);
    if (ach.reward_tabs > 0) {
      const eventId = require('crypto').randomUUID();
      const ledgerRes = await rest('POST', '/tabs_ledger', {
        body: JSON.stringify({
          event_id: eventId,
          user_id: userId,
          event_type: 'achievement_unlock',
          amount: ach.reward_tabs,
          breakdown: {},
          context: { achievement_key: ach.key, ...payload },
        }),
      });
      if (!ledgerRes.status || ledgerRes.status < 400) tabsDelta += ach.reward_tabs;
    }
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

module.exports = { processEvent, VALID_EVENT_TYPES };
