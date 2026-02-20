#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Mid-week streak risk notifications (Thursday)
 */

const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

async function rest(method, path, body) {
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
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (res.status >= 400) {
    throw new Error(`PostgREST ${res.status} ${path}: ${text}`);
  }
  return json;
}

async function run() {
  const profiles = await rest('GET', '/user_tabs_profile?select=user_id,ratings_this_week,weeks_inactive,current_tier&limit=10000');
  for (const profile of profiles) {
    const ratingsThisWeek = Number(profile.ratings_this_week) || 0;
    const weeksInactive = Number(profile.weeks_inactive) || 0;
    const userId = profile.user_id;

    if (ratingsThisWeek < 2) {
      await rest('POST', '/tab_notifications', {
        user_id: userId,
        notification_type: 'streak_at_risk',
        title: 'Streak at risk',
        message: `You need ${2 - ratingsThisWeek} more rating(s) this week to maintain your tier activity minimum.`,
      });
    }
    if (weeksInactive === 3) {
      await rest('POST', '/tab_notifications', {
        user_id: userId,
        notification_type: 'approaching_demotion',
        title: 'Demotion warning',
        message: `One more inactive week will drop you one tier from ${profile.current_tier.replace('_', ' ')}.`,
      });
    }
  }
  console.log(`Streak risk check completed for ${profiles.length} users`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
