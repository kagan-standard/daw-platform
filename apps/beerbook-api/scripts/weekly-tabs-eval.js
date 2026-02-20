#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Weekly tabs evaluation (Monday 00:00 UTC)
 * - Evaluates maintenance + progression
 * - Applies demotions/promotions
 * - Resets weekly counters
 */

const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const TIERS = ['taster', 'regular', 'local', 'patron', 'house_account', 'cellar_reserve'];

function previousWeekRange() {
  const now = new Date();
  const day = now.getUTCDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  const currentMonday = new Date(now);
  currentMonday.setUTCDate(currentMonday.getUTCDate() + toMonday);
  currentMonday.setUTCHours(0, 0, 0, 0);
  const prevMonday = new Date(currentMonday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const prevSundayEnd = new Date(currentMonday.getTime() - 1);
  return { from: prevMonday.toISOString(), to: prevSundayEnd.toISOString(), weekStart: currentMonday.toISOString() };
}

async function rest(method, path, body) {
  const res = await fetch(`${REST_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      Prefer: 'return=representation',
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
  const { from, to, weekStart } = previousWeekRange();
  const profiles = await rest('GET', '/user_tabs_profile?limit=10000');
  const requirements = await rest('GET', '/tier_requirements?order=display_order.asc');
  const reqByTier = new Map(requirements.map((r) => [r.tier, r]));

  for (const profile of profiles) {
    const userId = profile.user_id;
    const encodedUser = encodeURIComponent(userId);
    const [ratings, submissions] = await Promise.all([
      rest(
        'GET',
        `/ratings?user_id=eq.${encodedUser}&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}&select=id,notes&limit=1000`
      ),
      rest(
        'GET',
        `/beer_submissions?submitted_by=eq.${encodedUser}&status=eq.approved&reviewed_at=gte.${encodeURIComponent(from)}&reviewed_at=lte.${encodeURIComponent(to)}&select=id&limit=1000`
      ),
    ]);
    const txEarnRows = await rest(
      'GET',
      `/tab_transactions?user_id=eq.${encodedUser}&transaction_type=eq.earn&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}&select=amount&limit=5000`
    );

    const ratingsCount = Array.isArray(ratings) ? ratings.length : 0;
    const reviewsCount = (Array.isArray(ratings) ? ratings : []).filter((r) => (r.notes || '').trim().length >= 10).length;
    const contributionsCount = Array.isArray(submissions) ? submissions.length : 0;
    const tabsEarnedThisWeek = (Array.isArray(txEarnRows) ? txEarnRows : []).reduce(
      (sum, row) => sum + (Number(row.amount) || 0),
      0
    );

    let currentTier = profile.current_tier || 'taster';
    let weeksInactive = Number(profile.weeks_inactive) || 0;
    let currentStreak = Number(profile.current_streak_weeks) || 0;
    let notification = null;

    if (ratingsCount >= 2) {
      weeksInactive = 0;
    } else {
      weeksInactive += 1;
      if (weeksInactive >= 4) {
        const idx = TIERS.indexOf(currentTier);
        if (idx > 0) {
          currentTier = TIERS[idx - 1];
          notification = {
            user_id: userId,
            notification_type: 'tier_demotion',
            title: 'Tier adjusted',
            message: `You have been moved to ${currentTier.replace('_', ' ')} after inactivity.`,
          };
        }
        weeksInactive = 0;
        currentStreak = 0;
      }
    }

    const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];
    if (nextTier) {
      const nextReq = reqByTier.get(nextTier);
      const meetsNext = ratingsCount >= Number(nextReq?.required_ratings_per_week || 0)
        && reviewsCount >= Number(nextReq?.required_reviews_per_week || 0)
        && contributionsCount >= Number(nextReq?.required_contributions_per_week || 0);

      if (meetsNext) {
        currentStreak += 1;
        if (currentStreak >= Number(nextReq?.required_consecutive_weeks || 0)) {
          currentTier = nextTier;
          currentStreak = 0;
          notification = {
            user_id: userId,
            notification_type: 'tier_promotion',
            title: 'Tier promotion',
            message: `Congratulations! You reached ${nextReq.display_name}.`,
          };
        }
      } else {
        currentStreak = 0;
      }
    } else {
      currentStreak = 0;
    }

    await rest('PATCH', `/user_tabs_profile?user_id=eq.${encodedUser}`, {
      current_tier: currentTier,
      current_streak_weeks: currentStreak,
      longest_streak_weeks: Math.max(Number(profile.longest_streak_weeks) || 0, currentStreak),
      weeks_inactive: weeksInactive,
      ratings_this_week: 0,
      week_start: weekStart,
      last_active_week: ratingsCount >= 2 ? weekStart : profile.last_active_week,
      tier_promoted_at: currentTier !== profile.current_tier ? new Date().toISOString() : profile.tier_promoted_at,
    });

    if (notification) {
      await rest('POST', '/tab_notifications', notification);
    }

    await rest('POST', '/tab_notifications', {
      user_id: userId,
      notification_type: 'weekly_summary',
      title: 'Weekly tabs summary',
      message: `You earned ${tabsEarnedThisWeek} tabs last week.`,
      metadata: {
        week_start: from,
        week_end: to,
        tabs_earned: tabsEarnedThisWeek,
        ratings_count: ratingsCount,
        reviews_count: reviewsCount,
        contributions_count: contributionsCount,
      },
    });
  }

  console.log(`Weekly tabs eval completed for ${profiles.length} users`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
