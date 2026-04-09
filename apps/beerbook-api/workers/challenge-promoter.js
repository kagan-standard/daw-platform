#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Challenge promoter worker.
 *
 * Runs Monday 00:05 UTC. Pops the lowest-sort_order entry from challenge_queue,
 * creates a weekly_challenges row for the current week, and deletes the queue entry.
 * If the queue is empty (or the template is broken), sends a push alert to all admins.
 *
 * Cron schedule (host crontab):
 *   5 0 * * 1 docker exec beerbook-api node workers/challenge-promoter.js >> /var/log/challenge-promoter.log 2>&1
 */

const { getTemplate } = require('../lib/challengeTemplates');

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

async function sendEmptyQueueAlert(rest, weekStart, reason) {
  const adminIds = (process.env.ADMIN_USER_IDS || process.env.ADMIN_USER_ID || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (adminIds.length === 0) {
    console.error('[challenge-promoter] No admin user IDs configured, cannot send empty-queue alert');
    return;
  }
  const title = 'Challenge queue empty';
  const message = reason === 'broken_template'
    ? `Queue row references missing template. Week of ${weekStart} has no challenge.`
    : `No challenge in queue for week of ${weekStart}. Add one or schedule manually.`;
  for (const userId of adminIds) {
    try {
      await rest('POST', '/rpc/insert_scheduler_notification', {
        p_user_id: userId,
        p_notification_type: 'challenge_queue_empty',
        p_title: title,
        p_message: message,
        p_week_start: weekStart,
        p_target_type: '',
        p_target_id: '',
        p_metadata: null,
      });
    } catch (err) {
      if (!err.message.includes('409') && !err.message.includes('duplicate')) {
        console.error(`[challenge-promoter] Failed to alert ${userId}: ${err.message}`);
      }
    }
  }
  console.log(`[challenge-promoter] Sent empty-queue alert to ${adminIds.length} admin(s) (reason: ${reason})`);
}

async function promoteFromQueue() {
  const rest = createRest();
  const weekStart = currentWeekStart();

  // 1. Check if week already has a challenge
  const existing = await rest('GET', `/weekly_challenges?week_start=eq.${encodeURIComponent(weekStart)}&limit=1`);
  if (Array.isArray(existing) && existing.length > 0) {
    console.log('[challenge-promoter] Week already has a challenge, skipping promotion');
    return;
  }

  // 2. Fetch lowest-sort_order queue entry
  const queue = await rest('GET', '/challenge_queue?order=sort_order.asc,created_at.asc&limit=1');
  if (!Array.isArray(queue) || queue.length === 0) {
    console.log('[challenge-promoter] Queue is empty, sending admin alert');
    await sendEmptyQueueAlert(rest, weekStart, 'empty');
    return;
  }

  const entry = queue[0];

  // 3. Look up template
  const template = getTemplate(entry.template_key);
  if (!template) {
    console.error(`[challenge-promoter] Template "${entry.template_key}" not found in challengeTemplates.js`);
    await sendEmptyQueueAlert(rest, weekStart, 'broken_template');
    process.exit(1);
  }

  // 4. Compute week_end
  const ws = new Date(weekStart);
  const weEnd = new Date(ws);
  weEnd.setUTCDate(weEnd.getUTCDate() + 7);
  weEnd.setUTCMilliseconds(-1);

  // 5. Insert into weekly_challenges
  const payload = {
    week_start: weekStart,
    week_end: weEnd.toISOString(),
    title: template.label,
    description: template.description,
    metric: template.metric,
    target_count: entry.target_count,
    target_style: template.metric === 'ratings_count' ? (entry.target_style || null) : null,
    reward_label: entry.reward_label,
    reward_tabs: entry.reward_tabs || 0,
    reward_badge_id: entry.reward_badge_id || null,
  };

  try {
    await rest('POST', '/weekly_challenges', {
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Race condition: manual schedule happened between check and insert
    if (err.message.includes('409') || err.message.includes('duplicate') || err.message.includes('unique')) {
      console.log('[challenge-promoter] Race condition — week already has a challenge, queue row preserved');
      return;
    }
    throw err;
  }

  // 6. Delete the queue entry
  await rest('DELETE', `/challenge_queue?id=eq.${encodeURIComponent(entry.id)}`);

  console.log(`[challenge-promoter] Promoted queue row ${entry.id} (template ${entry.template_key}) to weekly_challenges for week ${weekStart}`);
}

if (require.main === module) {
  if (!SERVICE_ROLE_KEY) {
    console.error('[challenge-promoter] SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }
  promoteFromQueue()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[challenge-promoter] Fatal:', err);
      process.exit(1);
    });
}

module.exports = { promoteFromQueue };
