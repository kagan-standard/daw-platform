#!/usr/bin/env node
/* eslint-disable no-console */

const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  const result = await restFn('POST', '/rpc/auto_resolve_unlocked_backs');
  const row = Array.isArray(result) ? result[0] : result;
  const resolved = row?.resolved_count ?? 0;
  const credited = row?.total_credited ?? 0;
  console.log(`[auto-resolve-backs] resolved=${resolved} total_credited=${credited} at=${new Date().toISOString()}`);
  return { resolved, credited };
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
