#!/usr/bin/env node
/* eslint-disable no-console */

const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RETENTION_DAYS = Math.max(1, Number(process.env.PUSH_TOKEN_PRUNE_RETENTION_DAYS || 90));

function createRest() {
  return async function rest(method, path, body) {
    const res = await fetch(`${REST_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (res.status >= 400) {
      throw new Error(`PostgREST ${res.status} ${path}: ${text}`);
    }
    return json;
  };
}

async function run({ restFn = createRest() } = {}) {
  const deleted = await restFn('POST', '/rpc/prune_inactive_push_tokens', {
    p_retention_days: RETENTION_DAYS,
  });
  const n = typeof deleted === 'number' ? deleted : Number(deleted);
  console.log(`push-token-prune: deleted inactive token rows older than ${RETENTION_DAYS}d: ${Number.isFinite(n) ? n : JSON.stringify(deleted)}`);
  return { deleted: n };
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
  module.exports = { run };
}
