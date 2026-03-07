#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Seed 76 title cosmetics into public.cosmetics.
 *
 * Usage:
 *   node scripts/seed-title-cosmetics.js
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL) {
  console.error('SUPABASE_URL is required');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY is required');
  process.exit(1);
}

const ACHIEVEMENT_KEYS_FOR_TITLES = [
  'first_pour',
  'profile_polish',
  'first_photo',
  'first_notes',
  'first_price',
  'first_location',
  'five_ratings',
  'ten_ratings',
  'twentyfive_ratings',
  'fifty_ratings',
  'first_new_beer',
  'first_five_star',
  'first_one_star',
  'photo_fanatic_10',
  'notes_10',
  'notes_50',
  'priced_10',
  'location_10',
  'full_house',
  'three_in_a_day',
  'five_in_a_day',
  'consistent_rater_7',
  'top_shelf_10',
  'harsh_10',
  'balanced_palette',
  'hundred_ratings',
  'style_sampler_5',
  'style_sampler_10',
  'lager_loyalist_10',
  'ale_adventurer_10',
  'hop_head_10',
  'stout_scout_10',
  'sour_power_10',
  'wheat_wave_10',
  'belgian_detour_10',
  'dark_side_25',
  'crisp_committee_25',
  'seasonal_sampler_12',
  'style_completionist_25',
  'first_venue',
  'venue_hopper_5',
  'venue_hopper_10',
  'brewery_run_5',
  'new_city',
  'three_cities',
  'five_cities',
  'map_explorer_25',
  'home_base_10',
  'brewery_loyalty_10',
  'late_night_log',
  'happy_hour_hunter',
  'venue_completionist_25',
  'first_cheers_given',
  'first_cheers_received',
  'cheers_giver_10',
  'cheers_receiver_10',
  'cheers_giver_50',
  'cheers_receiver_50',
  'cheers_spread',
  'mutual_cheers',
  'first_follow',
  'followers_10',
  'following_25',
  'share_rating',
  'weekly_streak_2',
  'weekly_streak_4',
  'daily_streak_3',
  'daily_streak_14',
  'week_cap_master',
  'dry_spell_breaker',
  'seasonal_fall',
  'seasonal_winter',
  'seasonal_spring',
  'seasonal_summer',
  'new_beer_week',
  'milestone_250',
];

const TITLE_TEXTS = [
  'First Pour',
  'Profile Polish',
  'Receipt of Proof',
  'First Notes',
  'Price Tagger',
  'On The Map',
  "Five O'Clock Somewhere",
  'Regular',
  'Known Face',
  'House Account',
  'Trailblazer',
  'Perfect Pour',
  'Brutal Honesty',
  'Photo Fanatic',
  'Tasting Journal',
  'Beer Critic',
  'Value Spotter',
  'Stamped Passport',
  'Full House Rating',
  'Flight Board',
  'Tasting Day',
  'One a Day',
  'Top Shelf',
  'No Free Passes',
  'Balanced Palate',
  'Archive Builder',
  'Style Sampler',
  'Style Explorer',
  'Lager Loyalist',
  'Ale Adventurer',
  'Hop Head',
  'Stout Scout',
  'Sour Power',
  'Wheat Wave',
  'Belgian Detour',
  'Dark Side',
  'Crisp Committee',
  'Seasonal Sampler',
  'Style Completionist',
  'First Venue',
  'Venue Hopper',
  'Venue Regular',
  'Brewery Run',
  'New City',
  'Three Cities',
  'Five Cities',
  'Map Explorer',
  'Home Base',
  'Brewery Regular',
  'Last Call',
  'Happy Hour Hunter',
  'Venue Completionist',
  'First Cheers',
  'Somebody Noticed',
  'Hype Person',
  'Crowd Favorite',
  'The Amplifier',
  'Local Legend',
  'Good Vibes',
  'Mutual Respect',
  'First Follow',
  'Noticed',
  'Connector',
  'Share The Pour',
  'Two-Week Run',
  'Month of Beer',
  'Mini Streak',
  'Two-Week Streak',
  'Cap Master',
  'Back In The Saddle',
  'Autumn Sips',
  'Winter Warmers',
  'Spring Refresh',
  'Summer Session',
  'New Beer Week',
  'Quarter Keg',
];

function getRarity(index) {
  if (index <= 30) return 'common';
  if (index <= 50) return 'rare';
  if (index <= 68) return 'epic';
  return 'legendary';
}

function getTabPrice(rarity) {
  if (rarity === 'common') return 5;
  if (rarity === 'rare') return 15;
  if (rarity === 'epic') return 30;
  return 75;
}

function buildTitles() {
  if (ACHIEVEMENT_KEYS_FOR_TITLES.length !== 76) {
    throw new Error(`Expected 76 achievement keys, got ${ACHIEVEMENT_KEYS_FOR_TITLES.length}`);
  }
  if (TITLE_TEXTS.length !== 76) {
    throw new Error(`Expected 76 title texts, got ${TITLE_TEXTS.length}`);
  }

  const rows = [];
  for (let i = 1; i <= 76; i += 1) {
    const rarity = getRarity(i);
    const titleText = TITLE_TEXTS[i - 1];
    rows.push({
      key: `title_${i}`,
      type: 'title',
      name: titleText,
      description: `Achievement title unlocked from "${titleText}".`,
      rarity,
      title_text: titleText,
      unlock_type: 'both',
      achievement_key: ACHIEVEMENT_KEYS_FOR_TITLES[i - 1],
      tab_price: getTabPrice(rarity),
      active: true,
      sort_order: i,
    });
  }

  return rows;
}

async function upsertCosmetics(rows) {
  const url = `${SUPABASE_URL}/cosmetics?on_conflict=key`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = text;
  }

  if (!res.ok) {
    throw new Error(`Upsert failed (${res.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }

  return Array.isArray(body) ? body : [];
}

async function run() {
  const titles = buildTitles();
  const result = await upsertCosmetics(titles);
  console.log(`Seeded title cosmetics: ${titles.length} items processed, ${result.length} rows returned.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
