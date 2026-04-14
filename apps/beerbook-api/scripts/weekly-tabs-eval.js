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
    const reqByTier = new Map((requirements || []).map((r) => [r.tier, r]));
    let usersProcessed = 0;

    for (const profile of profiles) {
      try {
        const result = await rest('POST', '/rpc/eval_user_weekly_tabs', {
          p_user_id: profile.user_id,
          p_window_start: from,
          p_window_end: to,
        });
        const row = Array.isArray(result) ? result[0] : result;
        if (!row) {
          console.log(`[weekly-eval] ${profile.user_id}: no profile row returned, skipping`);
          continue;
        }

        console.log(
          `[weekly-eval] ${profile.user_id}: tier ${row.prev_tier}->${row.new_tier}`
          + ` streak ${row.prev_streak}->${row.new_streak}`
          + ` inactive ${row.prev_weeks_inactive}->${row.new_weeks_inactive}`
          + ` (prior=${row.prior_week_ratings_count}, promoted=${row.promoted}, demoted=${row.demoted})`
        );

        if (row.promoted) {
          const displayName = reqByTier.get(row.new_tier)?.display_name || row.new_tier.replace('_', ' ');
          await sendNotification(rest, profile.user_id, 'tier_promotion', 'Tier promotion',
            `Congratulations! You reached ${displayName}.`, weekStart);
        } else if (row.demoted) {
          await sendNotification(rest, profile.user_id, 'tier_demotion', 'Tier adjusted',
            `You have been moved to ${row.new_tier.replace('_', ' ')} after falling below the activity minimum.`, weekStart);
        }

        usersProcessed++;
      } catch (err) {
        console.error(`[weekly-eval] ${profile.user_id} failed:`, err);
      }
    }

    // ---- Mark job complete ----
    await rest('POST', '/rpc/complete_job_run', {
      p_job_name: JOB_NAME,
      p_week_start: weekStart,
      p_users_processed: usersProcessed,
    });

    console.log(`Weekly tabs eval completed for ${usersProcessed} users`);
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
