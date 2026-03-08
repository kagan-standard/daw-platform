/**
 * Phase 4.6 — Scheduler idempotency, population >10k, and notification dedupe.
 * BE-H-07: Critical paths (scheduler, migration safety) covered by tests.
 *
 * - Scheduler idempotency: double-run in same week is a no-op (claim_job_run returns false).
 * - Scheduler population >10k: cursor-based pagination processes all users.
 * - Notification dedupe: second run does not send notifications (idempotency);
 *   within a single run, insert_scheduler_notification uses ON CONFLICT DO NOTHING (DB).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { run: runWeeklyTabsEval } = require('../scripts/weekly-tabs-eval.js');
const { run: runStreakRiskCheck } = require('../scripts/streak-risk-check.js');

// ---------- Weekly tabs eval: idempotency (double-run no-op) ----------

test('scheduler idempotency: weekly_tabs_eval second run skips when claim_job_run returns false', async () => {
  const calls = [];
  const rest = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'POST' && path === '/rpc/claim_job_run') {
      return false; // already completed this week
    }
    throw new Error(`Unexpected call: ${method} ${path}`);
  };

  await runWeeklyTabsEval(rest);

  assert.equal(calls.length, 1, 'should only call claim_job_run then exit');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, '/rpc/claim_job_run');
  const noFetch = calls.every((c) => !c.path.includes('user_tabs_profile'));
  assert.ok(noFetch, 'must not fetch profiles when claim is false');
  const noComplete = calls.every((c) => c.path !== '/rpc/complete_job_run');
  assert.ok(noComplete, 'must not call complete_job_run when skipped');
});

// ---------- Streak risk: idempotency (double-run no-op) ----------

test('scheduler idempotency: streak_risk_check second run skips when claim_job_run returns false', async () => {
  const calls = [];
  const rest = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'POST' && path === '/rpc/claim_job_run') {
      return false;
    }
    throw new Error(`Unexpected call: ${method} ${path}`);
  };

  await runStreakRiskCheck(rest);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/rpc/claim_job_run');
  const noNotify = calls.every((c) => c.path !== '/rpc/insert_scheduler_notification');
  assert.ok(noNotify, 'must not send notifications when run is skipped');
});

// ---------- Weekly tabs eval: population >10k (paginated) ----------

test('scheduler population >10k: weekly_tabs_eval processes all pages and reports total', async () => {
  const PAGE_SIZE = 1000;
  const totalUsers = 11000; // >10k
  let pageIndex = 0;
  const calls = [];

  const rest = async (method, path, body) => {
    calls.push({ method, path });
    if (method === 'POST' && path === '/rpc/claim_job_run') {
      return true;
    }
    if (method === 'GET' && path.startsWith('/user_tabs_profile?')) {
      const start = pageIndex * PAGE_SIZE;
      const end = Math.min(start + PAGE_SIZE, totalUsers);
      const page = [];
      for (let i = start; i < end; i++) {
        page.push({ user_id: `user-${i}`, current_tier: 'taster', last_active_week: null, weeks_inactive: 0, current_streak_weeks: 0, tier_promoted_at: null });
      }
      pageIndex++;
      return page;
    }
    if (method === 'GET' && path.startsWith('/tier_requirements?')) {
      return [{ tier: 'regular', display_name: 'Regular', required_ratings_per_week: 0, required_reviews_per_week: 0, required_contributions_per_week: 0, required_consecutive_weeks: 0 }];
    }
    if (method === 'GET' && path.includes('/ratings?')) {
      return [];
    }
    if (method === 'GET' && path.includes('/beer_submissions?')) {
      return [];
    }
    if (method === 'PATCH' && path.startsWith('/user_tabs_profile?')) {
      return null;
    }
    if (method === 'POST' && path === '/rpc/insert_scheduler_notification') {
      return undefined;
    }
    if (method === 'POST' && path === '/rpc/complete_job_run') {
      const usersProcessed = body && body.p_users_processed;
      assert.equal(typeof usersProcessed, 'number', 'complete_job_run must receive p_users_processed');
      assert.ok(usersProcessed >= 10000, 'must process at least 10000 users when >10k exist');
      assert.equal(usersProcessed, totalUsers, 'must report exact total after full pagination');
      return null;
    }
    throw new Error(`Unhandled: ${method} ${path}`);
  };

  await runWeeklyTabsEval(rest);

  const completeCall = calls.find((c) => c.path === '/rpc/complete_job_run');
  assert.ok(completeCall, 'must call complete_job_run');
  const profilePages = calls.filter((c) => c.method === 'GET' && c.path.startsWith('/user_tabs_profile'));
  assert.ok(profilePages.length >= 11, 'must paginate (≥11 pages for 11k users at 1k/page)');
});

// ---------- Notification dedupe: streak script uses insert_scheduler_notification ----------

test('notification dedupe: streak_risk_check uses insert_scheduler_notification (DB enforces ON CONFLICT DO NOTHING)', async () => {
  const notifCalls = [];
  const rest = async (method, path, body) => {
    if (method === 'POST' && path === '/rpc/insert_scheduler_notification') {
      notifCalls.push(body);
      return undefined;
    }
    if (method === 'POST' && path === '/rpc/claim_job_run') return true;
    if (method === 'GET' && path.startsWith('/user_tabs_profile?')) {
      return [
        { user_id: 'u1', ratings_this_week: 0, weeks_inactive: 3, current_tier: 'regular' },
        { user_id: 'u2', ratings_this_week: 1, weeks_inactive: 0, current_tier: 'taster' },
      ];
    }
    if (method === 'POST' && path === '/rpc/complete_job_run') return null;
    throw new Error(`Unhandled: ${method} ${path}`);
  };

  await runStreakRiskCheck(rest);

  assert.ok(notifCalls.length >= 1, 'script calls insert_scheduler_notification');
  const withWeekStart = notifCalls.every((b) => b && b.p_week_start != null);
  assert.ok(withWeekStart, 'all notifications include p_week_start for dedupe key');
});
