#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Verify achievement–cosmetic alignment and optionally run the backfill.
 *
 * Checks:
 *   1. Achievements: list keys (and count) for trigger_type rating_submitted.
 *   2. Cosmetics: count rows and list achievement_keys that have no matching achievement.
 *   3. Orphaned unlocks: user_achievements rows whose achievement has linked cosmetics
 *      but the user has no user_cosmetics for those cosmetics (gap the backfill fixes).
 *
 * Usage:
 *   node scripts/check-and-backfill-achievement-cosmetics.js [--backfill]
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RUN_BACKFILL = process.argv.includes('--backfill');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(method, path, body) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  console.log('--- 1. Achievements (rating_submitted) ---');
  const achRes = await rest(
    'GET',
    '/rest/v1/achievements?trigger_type=eq.rating_submitted&select=key,name&order=key.asc'
  );
  if (achRes.status >= 400) {
    console.error('Failed to fetch achievements:', achRes.data);
    process.exit(1);
  }
  const achievements = Array.isArray(achRes.data) ? achRes.data : [];
  console.log(`Count: ${achievements.length}`);
  if (achievements.length <= 20) {
    console.log('Keys:', achievements.map((a) => a.key).join(', '));
  } else {
    console.log('Keys (first 20):', achievements.slice(0, 20).map((a) => a.key).join(', '));
    console.log('... and', achievements.length - 20, 'more');
  }

  console.log('\n--- 2. Cosmetics (achievement-linked) ---');
  const cosRes = await rest(
    'GET',
    '/rest/v1/cosmetics?achievement_key=not.is.null&select=id,key,achievement_key&order=achievement_key.asc'
  );
  if (cosRes.status >= 400) {
    console.error('Failed to fetch cosmetics:', cosRes.data);
    process.exit(1);
  }
  const cosmetics = Array.isArray(cosRes.data) ? cosRes.data : [];
  const achKeysSet = new Set(achievements.map((a) => a.key));
  const cosKeys = [...new Set(cosmetics.map((c) => c.achievement_key).filter(Boolean))];
  const missingInAchievements = cosKeys.filter((k) => !achKeysSet.has(k));
  console.log(`Cosmetics with achievement_key: ${cosmetics.length}`);
  console.log(`Distinct achievement_keys in cosmetics: ${cosKeys.length}`);
  if (missingInAchievements.length) {
    console.log(
      'Warning: achievement_keys in cosmetics with no matching achievement:',
      missingInAchievements.join(', ')
    );
  } else if (cosKeys.length) {
    console.log('OK: All cosmetics.achievement_key have a matching achievement.key');
  }

  console.log('\n--- 3. User achievements vs user_cosmetics (gap count) ---');
  const uaRes = await rest(
    'GET',
    '/rest/v1/user_achievements?select=user_id,achievement_id'
  );
  if (uaRes.status >= 400) {
    console.error('Failed to fetch user_achievements:', uaRes.data);
    process.exit(1);
  }
  const userAchievements = Array.isArray(uaRes.data) ? uaRes.data : [];
  console.log(`Total user_achievements rows: ${userAchievements.length}`);

  const ucRes = await rest(
    'GET',
    '/rest/v1/user_cosmetics?select=user_id,cosmetic_id'
  );
  if (ucRes.status >= 400) {
    console.error('Failed to fetch user_cosmetics:', ucRes.data);
    process.exit(1);
  }
  const userCosmetics = Array.isArray(ucRes.data) ? ucRes.data : [];
  console.log(`Total user_cosmetics rows: ${userCosmetics.length}`);

  if (userAchievements.length && cosmetics.length) {
    const allAchRes = await rest('GET', '/rest/v1/achievements?select=id,key');
    const allAch = Array.isArray(allAchRes.data) ? allAchRes.data : [];
    const achIdToKey = new Map(allAch.map((a) => [a.id, a.key]));
    const keyToCosmeticIds = new Map();
    for (const c of cosmetics) {
      if (!c.achievement_key) continue;
      if (!keyToCosmeticIds.has(c.achievement_key)) keyToCosmeticIds.set(c.achievement_key, []);
      keyToCosmeticIds.get(c.achievement_key).push(c.id);
    }
    const userCosmeticSet = new Set(
      userCosmetics.map((r) => `${r.user_id}\t${r.cosmetic_id}`)
    );
    let gaps = 0;
    for (const ua of userAchievements) {
      const key = achIdToKey.get(ua.achievement_id);
      if (!key) continue;
      const cids = keyToCosmeticIds.get(key);
      if (!cids?.length) continue;
      for (const cid of cids) {
        if (!userCosmeticSet.has(`${ua.user_id}\t${cid}`)) gaps++;
      }
    }
    console.log(
      `Estimated missing user_cosmetics for existing unlocks (backfill will add): ${gaps}`
    );
  }

  if (RUN_BACKFILL) {
    console.log('\n--- 4. Running backfill (RPC backfill_achievement_cosmetics) ---');
    const rpcRes = await rest('POST', '/rest/v1/rpc/backfill_achievement_cosmetics', {});
    if (rpcRes.status >= 400) {
      console.error('Backfill RPC failed:', rpcRes.data);
      process.exit(1);
    }
    console.log('Rows inserted:', rpcRes.data ?? 0);
  } else {
    console.log('\nBackfill: Apply the migration to run it once automatically.');
    console.log('  npx supabase db push   # or your migration workflow');
    console.log('Re-run the backfill later (e.g. after seeding more cosmetics):');
    console.log('  node scripts/check-and-backfill-achievement-cosmetics.js --backfill');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
