#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Challenge resolver worker.
 *
 * Two jobs:
 *   1. resolveExpiredChallenges() — runs daily; resolves any challenge whose week_end has
 *      passed and winner_crew_id IS NULL. Credits reward_tabs to winning crew members.
 *   2. sendMondayReminder() — runs Monday 09:00 UTC; sends push notification for the
 *      new week's challenge to all crew members.
 *
 * Cron schedule (add to host crontab):
 *   0  0 * * * docker exec beerbook-api node workers/challenge-resolver.js resolve
 *   0  9 * * 1 docker exec beerbook-api node workers/challenge-resolver.js remind
 */

const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createRest() {
  return async function rest(method, path, bodyOrOpts) {
    const isRpc = typeof bodyOrOpts === 'object' && bodyOrOpts !== null && !bodyOrOpts.headers;
    const opts = isRpc
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyOrOpts) }
      : (bodyOrOpts || {});
    const res = await fetch(`${REST_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        ...(opts.headers || {}),
      },
      body: opts.body || undefined,
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

function currentWeekStart() {
  const now = new Date();
  const day = now.getUTCDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() + toMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

// ─── Job 1: Resolve expired challenges ───────────────────────────────────────

async function resolveExpiredChallenges(restFn) {
  const rest = restFn || createRest();
  const now = new Date().toISOString();

  // Find unresolved challenges whose week has ended
  const challenges = await rest('GET', `/weekly_challenges?winner_crew_id=is.null&week_end=lt.${encodeURIComponent(now)}&order=week_start.asc`);
  if (!Array.isArray(challenges) || challenges.length === 0) {
    console.log('[challenge-resolver] No expired unresolved challenges.');
    return;
  }

  for (const challenge of challenges) {
    console.log(`[challenge-resolver] Resolving challenge ${challenge.id} "${challenge.title}" (week ${challenge.week_start})`);

    // Get leaderboard
    const leaderboard = await rest('POST', '/rpc/get_challenge_leaderboard', {
      p_challenge_id: challenge.id,
    });
    const rows = Array.isArray(leaderboard) ? leaderboard : (leaderboard || []);

    if (rows.length === 0) {
      console.log(`[challenge-resolver]   No participating crews, marking resolved with no winner.`);
      await rest('PATCH', `/weekly_challenges?id=eq.${encodeURIComponent(challenge.id)}`, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved_at: now }),
      });
      continue;
    }

    // Determine winners (rank 1, handles ties)
    const winnerCrews = rows.filter(r => r.rank === 1);
    const firstWinnerId = winnerCrews[0].crew_id;

    // Update challenge: set winner_crew_id to first winner, resolved_at
    await rest('PATCH', `/weekly_challenges?id=eq.${encodeURIComponent(challenge.id)}`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        winner_crew_id: firstWinnerId,
        resolved_at: now,
      }),
    });

    // Insert challenge_completions for all crews
    for (const row of rows) {
      const isWinner = row.rank === 1;
      const tabsAwarded = isWinner ? (challenge.reward_tabs || 0) : 0;

      await rest('POST', '/challenge_completions', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: challenge.id,
          crew_id: row.crew_id,
          rank: row.rank,
          final_count: row.current_count,
          tabs_awarded: tabsAwarded,
          resolved_at: now,
        }),
      });
    }

    // Credit reward_tabs to members of winning crews
    const rewardTabs = challenge.reward_tabs || 0;
    if (rewardTabs > 0) {
      for (const winner of winnerCrews) {
        // Fetch crew members
        const members = await rest('GET', `/crew_members?crew_id=eq.${encodeURIComponent(winner.crew_id)}&select=user_id`);
        if (!Array.isArray(members)) continue;

        for (const member of members) {
          const eventId = `challenge-${challenge.id}-${member.user_id}`;
          try {
            await rest('POST', '/rpc/award_tabs', {
              p_user_id: member.user_id,
              p_amount: rewardTabs,
              p_reason: `Challenge win: ${challenge.title}`,
              p_admin_user_id: 'system',
              p_event_id: eventId,
            });
            console.log(`[challenge-resolver]   Credited ${rewardTabs} tabs to ${member.user_id} (crew ${winner.crew_id})`);
          } catch (err) {
            console.error(`[challenge-resolver]   Failed to credit ${member.user_id}: ${err.message}`);
          }
        }
      }
    }

    console.log(`[challenge-resolver]   Resolved. Winner(s): ${winnerCrews.map(w => w.crew_name).join(', ')} | ${rows.length} crews competed.`);
  }
}

// ─── Job 2: Monday reminder push notification ────────────────────────────────

async function sendMondayReminder(restFn) {
  const rest = restFn || createRest();
  const weekStart = currentWeekStart();

  // Get this week's challenge
  const challenges = await rest('GET', `/weekly_challenges?week_start=eq.${encodeURIComponent(weekStart)}&limit=1`);
  if (!Array.isArray(challenges) || challenges.length === 0) {
    console.log('[challenge-reminder] No challenge for this week, skipping.');
    return;
  }
  const challenge = challenges[0];
  const rewardText = challenge.reward_tabs > 0 ? `${challenge.reward_tabs} tabs` : challenge.reward_label;

  // Get all users who are members of at least one crew (deduplicated)
  const PAGE_SIZE = 1000;
  const allUserIds = new Set();
  let cursor = null;
  for (;;) {
    let path = `/crew_members?select=user_id&order=user_id.asc&limit=${PAGE_SIZE}`;
    if (cursor) path += `&user_id=gt.${encodeURIComponent(cursor)}`;
    const page = await rest('GET', path);
    if (!Array.isArray(page) || page.length === 0) break;
    for (const row of page) allUserIds.add(row.user_id);
    cursor = page[page.length - 1].user_id;
    if (page.length < PAGE_SIZE) break;
  }

  if (allUserIds.size === 0) {
    console.log('[challenge-reminder] No crew members to notify.');
    return;
  }

  const title = 'New crew challenge is live';
  const body = `${challenge.title} — rally your crew and compete for ${rewardText}`;
  let sent = 0;

  for (const userId of allUserIds) {
    try {
      await rest('POST', '/rpc/insert_scheduler_notification', {
        p_user_id: userId,
        p_notification_type: 'weekly_challenge',
        p_title: title,
        p_message: body,
        p_week_start: weekStart,
        p_target_type: 'crew',
        p_target_id: null,
      });
      sent++;
    } catch (err) {
      // insert_scheduler_notification uses ON CONFLICT DO NOTHING for dedup
      if (!err.message.includes('409') && !err.message.includes('duplicate')) {
        console.error(`[challenge-reminder] Failed for ${userId}: ${err.message}`);
      }
    }
  }

  console.log(`[challenge-reminder] Sent ${sent} notifications for "${challenge.title}".`);
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

async function main() {
  if (!SERVICE_ROLE_KEY) {
    console.error('[challenge-resolver] SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }

  const command = process.argv[2] || 'resolve';

  try {
    if (command === 'resolve') {
      await resolveExpiredChallenges();
    } else if (command === 'remind') {
      await sendMondayReminder();
    } else {
      console.error(`Unknown command: ${command}. Use "resolve" or "remind".`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[challenge-resolver] Fatal: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { resolveExpiredChallenges, sendMondayReminder };
