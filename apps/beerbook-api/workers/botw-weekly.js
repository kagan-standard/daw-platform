#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Beer of the Week — weekly auto-selection worker.
 *
 * Runs Monday 12:00 UTC. Selects a Beer of the Week using the shared fallback
 * chain (7d → 30d → historical catalog) and persists it into featured_beers.
 * Idempotent: skips if a row already exists for this week.
 *
 * Cron schedule (host crontab):
 *   0 12 * * 1 docker exec beerbook-api node workers/botw-weekly.js >> /var/log/botw-weekly.log 2>&1
 */

const { selectBeerOfTheWeek } = require('../lib/beerOfTheWeekSelection');

const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const LOG_PREFIX = '[botw-weekly]';

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

async function run() {
  const rest = createRest();
  const weekStart = currentWeekStart();
  const weekEnd = (() => {
    const ws = new Date(weekStart);
    const we = new Date(ws);
    we.setUTCDate(we.getUTCDate() + 7);
    we.setUTCMilliseconds(-1);
    return we.toISOString();
  })();

  console.log(`${LOG_PREFIX} Starting — week_start=${weekStart}`);

  // ── Idempotency: check if a featured beer already exists for this week ──
  const existing = await rest('GET', `/featured_beers?feature_type=eq.beer_of_the_week&week_start=eq.${encodeURIComponent(weekStart)}&limit=1`);
  if (Array.isArray(existing) && existing.length > 0) {
    console.log(`${LOG_PREFIX} Row already exists for week ${weekStart} (beer: "${existing[0].beer_name}"), skipping`);
    return;
  }

  // ── Run the shared selection logic ──
  const selection = await selectBeerOfTheWeek(rest, { workerRest: true });
  if (!selection) {
    console.log(`${LOG_PREFIX} No viable beer found in any fallback tier — nothing to insert`);
    return;
  }

  console.log(`${LOG_PREFIX} Selected: "${selection.beer_name}" (source: ${selection.source}, avg: ${selection.avg_rating}, count: ${selection.review_count})`);

  // ── Insert into featured_beers ──
  const payload = {
    beer_name: selection.beer_name,
    brewery: selection.brewery,
    style: selection.style,
    feature_type: 'beer_of_the_week',
    week_start: weekStart,
    week_end: weekEnd,
    headline: `Auto-selected: ${selection.source.replace(/_/g, ' ')}`,
    body: null,
    photo_url: null,
    created_by: 'botw-weekly-worker',
  };

  try {
    await rest('POST', '/featured_beers', {
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Race condition: admin inserted between check and insert — unique index catches it
    if (err.message.includes('409') || err.message.includes('duplicate') || err.message.includes('unique') || err.message.includes('idx_featured_beers_week')) {
      console.log(`${LOG_PREFIX} Race condition — row appeared between check and insert, skipping`);
      return;
    }
    throw err;
  }

  console.log(`${LOG_PREFIX} Inserted featured beer for week ${weekStart}: "${selection.beer_name}" (source: ${selection.source})`);
}

if (require.main === module) {
  if (!SERVICE_ROLE_KEY) {
    console.error(`${LOG_PREFIX} SUPABASE_SERVICE_ROLE_KEY not set`);
    process.exit(1);
  }
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`${LOG_PREFIX} Fatal:`, err);
      process.exit(1);
    });
}

module.exports = { run };
