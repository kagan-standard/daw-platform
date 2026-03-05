const TAB_TIERS = ['taster', 'regular', 'local', 'patron', 'house_account', 'cellar_reserve'];

function getCurrentWeekStartUtc(date = new Date()) {
  const d = new Date(date);
  const utcDay = d.getUTCDay(); // 0=Sun, 1=Mon
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function isTruthyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function ensureProfileExists(rest, userId, displayName, email) {
  const id = encodeURIComponent(userId);
  const existing = await rest('GET', `/profiles?id=eq.${id}&limit=1`);
  if (existing.status >= 400) throw new Error('Failed to read profile');
  if (Array.isArray(existing.body) && existing.body.length > 0) return existing.body[0];

  const payload = {
    id: userId,
    display_name: displayName || 'Beer Lover',
    email: email || null,
  };
  const created = await rest('POST', '/profiles', {
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (created.status >= 400) throw new Error('Failed to create profile');
  return Array.isArray(created.body) ? created.body[0] : created.body;
}

async function createUserTabsProfile(rest, userId) {
  const created = await rest('POST', '/user_tabs_profile', {
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, week_start: getCurrentWeekStartUtc() }),
  });
  if (created.status >= 400) throw new Error('Failed to create user tabs profile');
  return Array.isArray(created.body) ? created.body[0] : created.body;
}

async function ensureUserTabsProfile(rest, userId, profileDefaults = {}) {
  await ensureProfileExists(rest, userId, profileDefaults.displayName, profileDefaults.email);

  const id = encodeURIComponent(userId);
  const out = await rest('GET', `/user_tabs_profile?user_id=eq.${id}&limit=1`);
  if (out.status >= 400) throw new Error('Failed to fetch user tabs profile');

  let profile = Array.isArray(out.body) && out.body[0] ? out.body[0] : null;
  if (!profile) {
    profile = await createUserTabsProfile(rest, userId);
  }

  const currentWeekStart = getCurrentWeekStartUtc();
  if (new Date(profile.week_start || 0).getTime() < new Date(currentWeekStart).getTime()) {
    const reset = await rest('PATCH', `/user_tabs_profile?user_id=eq.${id}`, {
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        ratings_this_week: 0,
        week_start: currentWeekStart,
      }),
    });
    if (reset.status >= 400) throw new Error('Failed to reset weekly tab counters');
    profile = Array.isArray(reset.body) && reset.body[0] ? reset.body[0] : profile;
  }

  return profile;
}

async function getTierMultiplier(rest, tier) {
  const safeTier = TAB_TIERS.includes(tier) ? tier : 'taster';
  const out = await rest('GET', `/tier_requirements?tier=eq.${encodeURIComponent(safeTier)}&select=multiplier,display_name,tier&limit=1`);
  if (out.status >= 400) throw new Error('Failed to fetch tier multiplier');
  const row = Array.isArray(out.body) && out.body[0] ? out.body[0] : null;
  return {
    tier: row?.tier || safeTier,
    display_name: row?.display_name || 'Taster',
    multiplier: row?.multiplier != null ? Number(row.multiplier) : 1.0,
  };
}

function calculateRatingComponents(ratingData) {
  const hasLocation = isTruthyString(ratingData.location_name) || (
    Number.isFinite(Number(ratingData.latitude)) && Number.isFinite(Number(ratingData.longitude))
  );
  const hasPhoto = isTruthyString(ratingData.photo_url);
  const hasPrice = Number.isInteger(Number(ratingData.price_cents)) && Number(ratingData.price_cents) > 0;
  const hasReview = isTruthyString(ratingData.notes) && ratingData.notes.trim().length >= 10;

  const components = [{ source: 'rating_base', base: 1 }];
  if (hasLocation) components.push({ source: 'rating_location', base: 1 });
  if (hasPhoto) components.push({ source: 'rating_photo', base: 2 });
  if (hasPrice) components.push({ source: 'rating_price', base: 1 });
  if (hasReview) components.push({ source: 'rating_review', base: 2 });
  return components;
}

async function insertTabTransactions(rest, txRows) {
  if (!Array.isArray(txRows) || txRows.length === 0) return;
  const out = await rest('POST', '/tab_transactions', {
    body: JSON.stringify(txRows),
  });
  if (out.status >= 400) throw new Error('Failed to insert tab transactions');
}

async function patchUserTabsProfile(rest, userId, patch) {
  const id = encodeURIComponent(userId);
  const out = await rest('PATCH', `/user_tabs_profile?user_id=eq.${id}`, {
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (out.status >= 400) throw new Error('Failed to update user tabs profile');
  return Array.isArray(out.body) && out.body[0] ? out.body[0] : null;
}

async function awardTabsForRating(rest, userId, ratingId, ratingData, profileDefaults = {}, isNewBeer = false) {
  const profile = await ensureUserTabsProfile(rest, userId, profileDefaults);
  const skipCap = profileDefaults.isAdmin === true;
  if (!skipCap && (profile.ratings_this_week || 0) >= 10) {
    return {
      tabs_earned: 0,
      reason: 'weekly_cap',
      breakdown: {},
      ratings_this_week: profile.ratings_this_week || 10,
    };
  }

  const tierInfo = await getTierMultiplier(rest, profile.current_tier);
  const tierMultiplier = Number(tierInfo.multiplier) || 1.0;
  const seederMultiplier = profile.is_seeder ? 1.5 : 1.0;
  const newBeerMultiplier = isNewBeer ? 1.5 : 1.0;
  const components = calculateRatingComponents(ratingData);

  const txRows = components.map((component) => ({
    user_id: userId,
    transaction_type: 'earn',
    amount: Math.round(component.base * newBeerMultiplier * tierMultiplier * seederMultiplier),
    earn_source: component.source,
    base_amount: component.base,
    tier_multiplier: tierMultiplier,
    seeder_multiplier: seederMultiplier,
    new_beer_multiplier: newBeerMultiplier,
    rating_id: ratingId,
  }));
  const tabsEarned = txRows.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  await insertTabTransactions(rest, txRows);

  await patchUserTabsProfile(rest, userId, {
    tab_balance: (Number(profile.tab_balance) || 0) + tabsEarned,
    lifetime_tabs_earned: (Number(profile.lifetime_tabs_earned) || 0) + tabsEarned,
    ratings_this_week: (Number(profile.ratings_this_week) || 0) + 1,
  });

  const breakdown = {};
  txRows.forEach((row) => { breakdown[row.earn_source] = row.amount; });
  return {
    tabs_earned: tabsEarned,
    reason: 'awarded',
    breakdown,
    ratings_this_week: (Number(profile.ratings_this_week) || 0) + 1,
    tier_multiplier: tierMultiplier,
    seeder_multiplier: seederMultiplier,
    new_beer_multiplier: newBeerMultiplier,
    is_new_beer: !!isNewBeer,
  };
}

async function awardSingleSourceTabs(rest, userId, source, baseAmount, reference = {}, profileDefaults = {}) {
  const profile = await ensureUserTabsProfile(rest, userId, profileDefaults);
  const tierInfo = await getTierMultiplier(rest, profile.current_tier);
  const tierMultiplier = Number(tierInfo.multiplier) || 1.0;
  const seederMultiplier = profile.is_seeder ? 1.5 : 1.0;
  const amount = Math.round(Number(baseAmount) * tierMultiplier * seederMultiplier);

  await insertTabTransactions(rest, [{
    user_id: userId,
    transaction_type: 'earn',
    amount,
    earn_source: source,
    base_amount: Number(baseAmount),
    tier_multiplier: tierMultiplier,
    seeder_multiplier: seederMultiplier,
    rating_id: reference.rating_id || null,
    related_entity_id: reference.related_entity_id || null,
  }]);

  await patchUserTabsProfile(rest, userId, {
    tab_balance: (Number(profile.tab_balance) || 0) + amount,
    lifetime_tabs_earned: (Number(profile.lifetime_tabs_earned) || 0) + amount,
  });
  return amount;
}

async function awardTabsForCheers(rest, giverId, receiverId, ratingId, defaults = {}) {
  const given = await awardSingleSourceTabs(
    rest,
    giverId,
    'cheers_given',
    1,
    { rating_id: ratingId, related_entity_id: ratingId },
    defaults[giverId] || {}
  );
  const received = await awardSingleSourceTabs(
    rest,
    receiverId,
    'cheers_received',
    1,
    { rating_id: ratingId, related_entity_id: ratingId },
    defaults[receiverId] || {}
  );
  return { giver_tabs: given, receiver_tabs: received };
}

async function awardTabsForBeerApproval(rest, userId, submissionId, profileDefaults = {}) {
  return awardSingleSourceTabs(
    rest,
    userId,
    'new_beer_approved',
    3,
    { related_entity_id: submissionId },
    profileDefaults
  );
}

module.exports = {
  TAB_TIERS,
  getCurrentWeekStartUtc,
  ensureUserTabsProfile,
  ensureProfileExists,
  getTierMultiplier,
  calculateRatingComponents,
  awardTabsForRating,
  awardTabsForCheers,
  awardTabsForBeerApproval,
};
