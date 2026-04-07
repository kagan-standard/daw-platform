#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Mid-week streak risk notifications (Thursday)
 *
 * Safety guarantees (Phase 2.10):
 *   - Idempotent: double-run in the same week is a no-op (job_runs table)
 *   - Paginated: processes all users regardless of count (cursor-based)
 *   - Deduplicated: scheduler notifications use ON CONFLICT DO NOTHING
 *   - Distributed-safe: advisory lock serialises concurrent callers
 */

const JOB_NAME = 'streak_risk_check';
const PAGE_SIZE = 1000;

const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function currentWeekStart() {
  const now = new Date();
  const day = now.getUTCDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() + toMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

function createRest() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
  return async function rest(method, path, body) {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (res.status >= 400) {
      throw new Error(`PostgREST ${res.status} ${path}: ${text}`);
    }
    return json;
  };
}

async function fetchAllProfiles(rest) {
  const profiles = [];
  let cursor = null;

  for (;;) {
    let path = `/user_tabs_profile?select=user_id,ratings_this_week,reviews_this_week,contributions_this_week,current_streak_weeks,weeks_inactive,current_tier&order=user_id.asc&limit=${PAGE_SIZE}`;
    if (cursor) {
      path += `&user_id=gt.${encodeURIComponent(cursor)}`;
    }
    const page = await rest('GET', path);
    if (!Array.isArray(page) || page.length === 0) break;
    for (const p of page) profiles.push(p);
    cursor = page[page.length - 1].user_id;
    if (page.length < PAGE_SIZE) break;
  }

  return profiles;
}

async function sendNotification(rest, userId, type, title, message, weekStart, metadata) {
  await rest('POST', '/rpc/insert_scheduler_notification', {
    p_user_id: userId,
    p_notification_type: type,
    p_title: title,
    p_message: message,
    p_week_start: weekStart,
    p_target_type: 'tabs_profile',
    p_target_id: userId,
    p_metadata: metadata || null,
  });
}

/**
 * Run streak risk check. When rest is not provided, uses createRest() from env.
 * Exported for tests (Phase 4.6).
 * @param {Function} [restFn] - Optional (method, path, body) => Promise<json>
 * @returns {Promise<void>}
 */
async function run(restFn) {
  const rest = restFn || createRest();
  const weekStart = currentWeekStart();

  // ---- Idempotency guard ----
  const claimed = await rest('POST', '/rpc/claim_job_run', {
    p_job_name: JOB_NAME,
    p_week_start: weekStart,
  });
  if (!claimed) {
    console.log(`Job ${JOB_NAME} already completed for week ${weekStart}; skipping.`);
    return;
  }

  try {
    // ---- Paginated profile fetch ----
    const profiles = await fetchAllProfiles(rest);
    const requirements = await rest('GET', '/tier_requirements?order=display_order.asc');
    const reqByTier = new Map(requirements.map((r) => [r.tier, r]));

    const TIERS = ['taster', 'regular', 'local', 'patron', 'house_account', 'cellar_reserve'];
    let streakNudges = 0;
    let demotionNudges = 0;
    let skipped = 0;

    for (const profile of profiles) {
      const ratingsThisWeek = Number(profile.ratings_this_week) || 0;
      const reviewsThisWeek = Number(profile.reviews_this_week) || 0;
      const contributionsThisWeek = Number(profile.contributions_this_week) || 0;
      const currentStreak = Number(profile.current_streak_weeks) || 0;
      const weeksInactive = Number(profile.weeks_inactive) || 0;
      const userId = profile.user_id;
      const currentTier = profile.current_tier || 'taster';
      const currentReq = reqByTier.get(currentTier);
      const maintenanceMin = Number(currentReq?.maintenance_ratings_per_week || 2);

      // Look up next tier's bar (or own bar if max tier)
      const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];
      const targetReq = nextTier ? reqByTier.get(nextTier) : currentReq;
      const targetName = targetReq?.display_name || currentTier.replace('_', ' ');
      const reqRatings = Number(targetReq?.required_ratings_per_week || 0);
      const reqReviews = Number(targetReq?.required_reviews_per_week || 0);
      const reqContribs = Number(targetReq?.required_contributions_per_week || 0);

      const ratingsNeeded = Math.max(0, reqRatings - ratingsThisWeek);
      const reviewsNeeded = Math.max(0, reqReviews - reviewsThisWeek);
      const contribsNeeded = Math.max(0, reqContribs - contributionsThisWeek);
      const meetsBar = ratingsNeeded === 0 && reviewsNeeded === 0 && contribsNeeded === 0;

      // ── Nudge 1: Streak progress — only for users with an active streak who haven't met the bar
      if (currentStreak > 0 && !meetsBar) {
        const parts = [];
        if (ratingsNeeded > 0) parts.push(`${ratingsNeeded} more rating${ratingsNeeded > 1 ? 's' : ''}`);
        if (reviewsNeeded > 0) parts.push(`${reviewsNeeded} more review${reviewsNeeded > 1 ? 's' : ''}`);
        if (contribsNeeded > 0) parts.push(`${contribsNeeded} more contribution${contribsNeeded > 1 ? 's' : ''}`);

        await sendNotification(
          rest,
          userId,
          'streak_at_risk',
          'Streak at risk',
          `You need ${parts.join(' and ')} this week to keep your ${currentStreak}-week streak toward ${targetName}!`,
          weekStart,
          {
            ratings_needed: ratingsNeeded,
            reviews_needed: reviewsNeeded,
            contributions_needed: contribsNeeded,
            current_streak: currentStreak,
            target_tier: targetName,
          },
        );
        streakNudges++;
        continue; // don't also send demotion warning to the same user
      }

      // ── Nudge 2: Demotion warning — below maintenance AND 2+ weeks inactive
      if (weeksInactive >= 2 && ratingsThisWeek < maintenanceMin) {
        const ratingsForMaintenance = maintenanceMin - ratingsThisWeek;
        const weeksUntilDemotion = 4 - weeksInactive;

        await sendNotification(
          rest,
          userId,
          'approaching_demotion',
          'Demotion warning',
          `You're at risk of losing your ${currentTier.replace('_', ' ')} status. Rate ${ratingsForMaintenance} beer${ratingsForMaintenance > 1 ? 's' : ''} this weekend to stay safe.`,
          weekStart,
          {
            current_tier: currentTier,
            ratings_needed: ratingsForMaintenance,
            weeks_until_demotion: weeksUntilDemotion,
          },
        );
        demotionNudges++;
        continue;
      }

      skipped++;
    }

    // ---- Mark job complete ----
    await rest('POST', '/rpc/complete_job_run', {
      p_job_name: JOB_NAME,
      p_week_start: weekStart,
      p_users_processed: profiles.length,
    });

    console.log(`Streak risk check completed: ${profiles.length} users, ${streakNudges} streak nudges, ${demotionNudges} demotion warnings, ${skipped} skipped`);
  } catch (err) {
    // ---- Mark job failed (allows retry) ----
    try {
      await rest('POST', '/rpc/fail_job_run', {
        p_job_name: JOB_NAME,
        p_week_start: weekStart,
      });
    } catch { /* best-effort */ }
    throw err;
  }
}

if (require.main === module) {
  if (!SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required');
    process.exit(1);
  }
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  module.exports = { run, JOB_NAME, PAGE_SIZE };
}
