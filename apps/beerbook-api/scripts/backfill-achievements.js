#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Backfill achievements for all users (or a single user).
 *
 * Evaluates every active achievement against every user's actual stats
 * and unlocks any that are met but not yet recorded in user_achievements.
 *
 * Usage:
 *   # All users:
 *   node scripts/backfill-achievements.js
 *
 *   # Single user:
 *   node scripts/backfill-achievements.js --user-id <keycloak-sub>
 *
 *   # Dry run (show what would be unlocked without writing):
 *   node scripts/backfill-achievements.js --dry-run
 *
 * Env: SUPABASE_REST_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 */

try {
  require('dotenv').config();
} catch (_) {
  /* dotenv not installed */
}

const { calculateAchievementProgress } = require('../lib/achievementProgress');

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || process.env.SUPABASE_REST_URL || ''
).replace(/\/$/, '');
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const DRY_RUN = process.argv.includes('--dry-run');
const USER_ID_FLAG = process.argv.indexOf('--user-id');
const SINGLE_USER_ID = USER_ID_FLAG !== -1 ? process.argv[USER_ID_FLAG + 1] : null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'SUPABASE_REST_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) are required.'
  );
  process.exit(1);
}

const baseHeaders = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function parseContentRangeTotal(contentRange) {
  const text = String(contentRange || '');
  const match = text.match(/\/(\d+|\*)$/);
  if (!match || match[1] === '*') return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function totalFromContentRange(contentRange) {
  return parseContentRangeTotal(contentRange);
}

async function rest(method, path, opts) {
  const url = `${SUPABASE_URL}${path}`;
  const extraHeaders = (opts && opts.headers) || {};
  const res = await fetch(url, {
    method,
    headers: { ...baseHeaders, ...extraHeaders },
    body: opts && opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = text;
  }
  return {
    status: res.status,
    body,
    headers: Object.fromEntries(res.headers.entries()),
  };
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== BACKFILL ACHIEVEMENTS ===');

  // 1. Load all active achievements
  const achRes = await rest('GET', '/achievements?active=eq.true&select=id,key,name,subtype,rules,reward_tabs');
  if (achRes.status >= 400) {
    console.error('Failed to fetch achievements:', achRes.body);
    process.exit(1);
  }
  const achievements = Array.isArray(achRes.body) ? achRes.body : [];
  console.log(`Loaded ${achievements.length} active achievements`);

  // 2. Get all user IDs (from profiles, or just the single user)
  let userIds = [];
  if (SINGLE_USER_ID) {
    userIds = [SINGLE_USER_ID];
    console.log(`Single user mode: ${SINGLE_USER_ID}`);
  } else {
    const usersRes = await rest('GET', '/profiles?select=id&limit=10000');
    if (usersRes.status >= 400) {
      console.error('Failed to fetch users:', usersRes.body);
      process.exit(1);
    }
    const users = Array.isArray(usersRes.body) ? usersRes.body : [];
    userIds = users.map((u) => u.id).filter(Boolean);
    console.log(`Found ${userIds.length} users`);
  }

  let totalUnlocked = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const userId of userIds) {
    // 3. Load existing unlocks for this user
    const uaRes = await rest(
      'GET',
      `/user_achievements?user_id=eq.${encodeURIComponent(userId)}&select=achievement_id`
    );
    const existingUnlocks = new Set(
      (Array.isArray(uaRes.body) ? uaRes.body : []).map((r) => r.achievement_id)
    );

    for (const ach of achievements) {
      if (existingUnlocks.has(ach.id)) {
        totalSkipped++;
        continue;
      }

      // 4. Calculate progress
      let progress;
      try {
        progress = await calculateAchievementProgress({
          rest,
          totalFromContentRange,
          user_id: userId,
          rules: ach.rules,
          subtype: ach.subtype,
        });
      } catch (err) {
        console.error(`  [ERROR] ${userId} / ${ach.key}: ${err.message}`);
        totalErrors++;
        continue;
      }

      if (!progress || progress.progress_current < progress.progress_target) continue;

      // 5. Achievement met — unlock it
      console.log(
        `  ${DRY_RUN ? '[DRY]' : '[UNLOCK]'} ${userId} -> ${ach.key} (${ach.name}) ` +
        `[${progress.progress_current}/${progress.progress_target}] +${ach.reward_tabs} tabs`
      );

      if (!DRY_RUN) {
        try {
          const rpcRes = await rest('POST', '/rpc/unlock_achievement_with_rewards', {
            body: JSON.stringify({
              p_user_id: userId,
              p_achievement_id: ach.id,
              p_achievement_key: ach.key,
              p_reward_tabs: ach.reward_tabs,
              p_progress: { progress_current: progress.progress_current },
              p_context: { source: 'backfill' },
            }),
          });
          if (rpcRes.status >= 400) {
            console.error(`    RPC error: ${JSON.stringify(rpcRes.body)}`);
            totalErrors++;
            continue;
          }
          const result = Array.isArray(rpcRes.body) ? rpcRes.body[0] : rpcRes.body;
          if (result && result.already_unlocked) {
            console.log('    (already unlocked — race condition, skipped)');
            totalSkipped++;
            continue;
          }
        } catch (err) {
          console.error(`    Write error: ${err.message}`);
          totalErrors++;
          continue;
        }
      }
      totalUnlocked++;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Users processed: ${userIds.length}`);
  console.log(`Achievements evaluated: ${achievements.length} per user`);
  console.log(`Newly unlocked: ${totalUnlocked}${DRY_RUN ? ' (dry run — nothing written)' : ''}`);
  console.log(`Already unlocked (skipped): ${totalSkipped}`);
  console.log(`Errors: ${totalErrors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
