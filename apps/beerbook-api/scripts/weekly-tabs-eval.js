#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Weekly tabs evaluation (Monday 00:00 UTC)
 * - Applies inactivity decay and weekly counter reset
 * - Evaluates maintenance + progression
 * - Applies demotions/promotions
 *
 * Safety guarantees (Phase 2.10):
 *   - Idempotent: double-run in the same week is a no-op (job_runs table)
 *   - Paginated: processes all users regardless of count (cursor-based)
 *   - Deduplicated: scheduler notifications use ON CONFLICT DO NOTHING
 *   - Distributed-safe: advisory lock serialises concurrent callers
 */

const JOB_NAME = 'weekly_tabs_eval';
const PAGE_SIZE = 1000;

const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TIERS = ['taster', 'regular', 'local', 'patron', 'house_account', 'cellar_reserve'];

function previousWeekRange() {
  const now = new Date();
  const day = now.getUTCDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  const currentMonday = new Date(now);
  currentMonday.setUTCDate(currentMonday.getUTCDate() + toMonday);
  currentMonday.setUTCHours(0, 0, 0, 0);
  const prevMonday = new Date(currentMonday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const prevSundayEnd = new Date(currentMonday.getTime() - 1);
  return { from: prevMonday.toISOString(), to: prevSundayEnd.toISOString(), weekStart: currentMonday.toISOString() };
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
        Prefer: 'return=representation',
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
    let path = `/user_tabs_profile?order=user_id.asc&limit=${PAGE_SIZE}`;
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

async function sendNotification(rest, userId, type, title, message, weekStart) {
  await rest('POST', '/rpc/insert_scheduler_notification', {
    p_user_id: userId,
    p_notification_type: type,
    p_title: title,
    p_message: message,
    p_week_start: weekStart,
    p_target_type: 'tabs_profile',
    p_target_id: userId,
  });
}

/**
 * Run weekly tabs evaluation. When rest is not provided (e.g. when run as script),
 * uses createRest() from env. Exported for tests (Phase 4.6).
 * @param {Function} [restFn] - Optional (method, path, body) => Promise<json>
 * @returns {Promise<void>}
 */
async function run(restFn) {
  const rest = restFn || createRest();
  const { from, to, weekStart } = previousWeekRange();

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

    for (const profile of profiles) {
      const userId = profile.user_id;
      const encodedUser = encodeURIComponent(userId);

      // Fetch previous week's ratings to check maintenance threshold
      const ratings = await rest(
        'GET',
        `/ratings?user_id=eq.${encodedUser}&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}&select=id&limit=1000`
      );
      const ratingsCount = Array.isArray(ratings) ? ratings.length : 0;

      let currentTier = profile.current_tier || 'taster';
      const currentReq = reqByTier.get(currentTier);
      const maintenanceMin = Number(currentReq?.maintenance_ratings_per_week || 2);

      // Trust the RPC-cached streak (tier-aware since migration 20260426140000)
      let currentStreak = Number(profile.current_streak_weeks) || 0;
      let weeksInactive = Number(profile.weeks_inactive) || 0;
      let notification = null;

      // ── Maintenance demotion: below maintenance_ratings_per_week → increment weeks_inactive
      if (ratingsCount >= maintenanceMin) {
        weeksInactive = 0;
      } else {
        weeksInactive += 1;
        if (weeksInactive >= 4) {
          const idx = TIERS.indexOf(currentTier);
          if (idx > 0) {
            currentTier = TIERS[idx - 1];
            notification = {
              type: 'tier_demotion',
              title: 'Tier adjusted',
              message: `You have been moved to ${currentTier.replace('_', ' ')} after falling below the activity minimum.`,
            };
          }
          weeksInactive = 0;
        }
      }

      // ── Promotion: streak already encodes that user met next tier's full weekly bar
      const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];
      if (nextTier) {
        const nextReq = reqByTier.get(nextTier);
        if (currentStreak >= Number(nextReq?.required_consecutive_weeks || 0)) {
          currentTier = nextTier;
          currentStreak = 0; // reset streak on promotion
          notification = {
            type: 'tier_promotion',
            title: 'Tier promotion',
            message: `Congratulations! You reached ${nextReq.display_name}.`,
          };
        }
      }

      await rest('PATCH', `/user_tabs_profile?user_id=eq.${encodedUser}`, {
        current_tier: currentTier,
        current_streak_weeks: currentStreak,
        weeks_inactive: weeksInactive,
        ratings_this_week: 0,
        reviews_this_week: 0,
        contributions_this_week: 0,
        week_start: weekStart,
        tier_promoted_at: currentTier !== profile.current_tier ? new Date().toISOString() : profile.tier_promoted_at,
        updated_at: new Date().toISOString(),
      });

      if (notification) {
        await sendNotification(rest, userId, notification.type, notification.title, notification.message, weekStart);
      }
    }

    // ---- Mark job complete ----
    await rest('POST', '/rpc/complete_job_run', {
      p_job_name: JOB_NAME,
      p_week_start: weekStart,
      p_users_processed: profiles.length,
    });

    console.log(`Weekly tabs eval completed for ${profiles.length} users`);
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
  module.exports = { run, previousWeekRange, JOB_NAME, PAGE_SIZE };
}
