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
    let path = `/user_tabs_profile?select=user_id,ratings_this_week,current_streak_weeks,weeks_inactive,current_tier&order=user_id.asc&limit=${PAGE_SIZE}`;
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

    for (const profile of profiles) {
      const ratingsThisWeek = Number(profile.ratings_this_week) || 0;
      const weeksInactive = Number(profile.weeks_inactive) || 0;
      const userId = profile.user_id;

      if (ratingsThisWeek < 2) {
        await sendNotification(
          rest,
          userId,
          'streak_at_risk',
          'Streak at risk',
          `You need ${2 - ratingsThisWeek} more rating(s) this week to maintain your tier activity minimum.`,
          weekStart,
        );
      }
      if (weeksInactive === 3) {
        await sendNotification(
          rest,
          userId,
          'approaching_demotion',
          'Demotion warning',
          `One more inactive week will drop you one tier from ${profile.current_tier.replace('_', ' ')}.`,
          weekStart,
        );
      }
    }

    // ---- Mark job complete ----
    await rest('POST', '/rpc/complete_job_run', {
      p_job_name: JOB_NAME,
      p_week_start: weekStart,
      p_users_processed: profiles.length,
    });

    console.log(`Streak risk check completed for ${profiles.length} users`);
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
