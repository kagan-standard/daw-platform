#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Seed 76 border cosmetics into public.cosmetics.
 *
 * Usage:
 *   node scripts/seed-border-cosmetics.js
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

const ACHIEVEMENT_KEYS_FOR_BORDERS = [
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

const NAME_PREFIXES = [
  'Golden',
  'Hopforged',
  'Barrelborn',
  'Foamcrest',
  'Taproom',
  'Maltfire',
  'Kegkeeper',
  'Pintmaster',
  'Copperleaf',
  'Yeastwind',
  'Stoutbound',
  'Lagerlight',
  'Porterline',
  'Hopspark',
  'Brewmoon',
  'Cellarbound',
  'Trailpour',
  'Flightpath',
  'Last Call',
];

const NAME_SUFFIXES = [
  'Crown',
  'Halo',
  'Ring',
  'Laurel',
];

const DESCRIPTION_PATTERNS = [
  'A polished frame for every proud pour you log.',
  'A tavern-born glow that marks your tasting momentum.',
  'Forged for drinkers who keep the streak alive.',
  'A celebratory border for milestones worth toasting.',
  'A crisp emblem for nights spent chasing new drafts.',
  'A bold trim that shines brighter with every check-in.',
  'Made for regulars who turn ratings into legend.',
  'A clean finish for your most hard-earned achievements.',
];

function getRarity(index) {
  if (index <= 30) return 'common';
  if (index <= 50) return 'rare';
  if (index <= 68) return 'epic';
  return 'legendary';
}

function getUnlockType() {
  return 'achievement';
}

function getTabPrice() {
  return 0;
}

function buildBorderName(index) {
  const prefix = NAME_PREFIXES[Math.floor((index - 1) / NAME_SUFFIXES.length)];
  const suffix = NAME_SUFFIXES[(index - 1) % NAME_SUFFIXES.length];
  return `${prefix} ${suffix}`;
}

function buildDescription(index) {
  return DESCRIPTION_PATTERNS[(index - 1) % DESCRIPTION_PATTERNS.length];
}

function buildBorders() {
  const rows = [];
  if (ACHIEVEMENT_KEYS_FOR_BORDERS.length !== 76) {
    throw new Error(`Expected 76 achievement keys, got ${ACHIEVEMENT_KEYS_FOR_BORDERS.length}`);
  }

  for (let i = 1; i <= 76; i += 1) {
    const rarity = getRarity(i);
    const unlockType = getUnlockType();
    const achievementKey = ACHIEVEMENT_KEYS_FOR_BORDERS[i - 1];
    const asset = `/images/borders/border${i}.png`;

    rows.push({
      key: `border_${i}`,
      type: 'border',
      name: buildBorderName(i),
      description: buildDescription(i),
      rarity,
      asset_url: asset,
      preview_asset_url: asset,
      unlock_type: unlockType,
      achievement_key: achievementKey,
      tab_price: getTabPrice(),
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
  const borders = buildBorders();
  const result = await upsertCosmetics(borders);
  console.log(`Seeded border cosmetics: ${borders.length} items processed, ${result.length} rows returned.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
