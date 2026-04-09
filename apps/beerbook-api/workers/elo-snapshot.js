#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Daily ELO history snapshot.
 *
 * For every beer with a row in beer_elo_ratings, inserts a snapshot into
 * beer_elo_history with the current global_elo and tier name.
 * One row per beer per day; the cron enforces daily frequency.
 *
 * Cron schedule (add to host crontab):
 *   0 2 * * * docker exec beerbook-api node workers/elo-snapshot.js
 *   (runs at 02:00 UTC daily, after any overnight head-to-head activity settles)
 */

const { getTierName } = require('../lib/eloTiers');

const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAGE_SIZE = 1000;

function createRest() {
  return async function rest(method, path, opts) {
    const res = await fetch(`${REST_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        ...(opts?.headers || {}),
      },
      body: opts?.body || undefined,
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (res.status >= 400) {
      throw new Error(`PostgREST ${res.status} ${path}: ${text}`);
    }
    return { status: res.status, body: json, headers: Object.fromEntries(res.headers.entries()) };
  };
}

async function run(restFn) {
  const rest = restFn || createRest();
  const now = new Date().toISOString();
  let cursor = null;
  let total = 0;

  for (;;) {
    let path = `/beer_elo_ratings?select=beer_id,global_elo&order=beer_id.asc&limit=${PAGE_SIZE}`;
    if (cursor) path += `&beer_id=gt.${encodeURIComponent(cursor)}`;

    const res = await rest('GET', path);
    const rows = Array.isArray(res.body) ? res.body : [];
    if (rows.length === 0) break;

    // Build batch insert payload
    const batch = rows.map(r => ({
      beer_id: r.beer_id,
      elo_score: r.global_elo != null ? Number(r.global_elo) : 0,
      tier: getTierName(r.global_elo != null ? Number(r.global_elo) : 0),
      recorded_at: now,
    }));

    await rest('POST', '/beer_elo_history', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    total += rows.length;
    cursor = rows[rows.length - 1].beer_id;
    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`[elo-snapshot] Snapshotted ${total} beers.`);
  return total;
}

async function main() {
  if (!SERVICE_ROLE_KEY) {
    console.error('[elo-snapshot] SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }
  try {
    await run();
  } catch (err) {
    console.error(`[elo-snapshot] Fatal: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { run };
