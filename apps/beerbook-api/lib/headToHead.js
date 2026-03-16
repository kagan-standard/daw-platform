/**
 * Head-to-head comparison: match quality, prompt creation, and payload building.
 * Phase 1: persistence and API only; no Elo.
 * Used by POST /api/ratings (when to attach head_to_head) and by complete/skip handlers.
 */

const HEAD_TO_HEAD_REWARD_TABS = Number(process.env.HEAD_TO_HEAD_REWARD_TABS) || 2;
const HEAD_TO_HEAD_COOLDOWN_HOURS = Number(process.env.HEAD_TO_HEAD_COOLDOWN_HOURS) || 24;

/**
 * Build the minimal beer object for head-to-head prompt (no YG value).
 * @param {object} r - Rating row (id, beer_name, brewery, style, location_name, created_at, photo_url, venue_id)
 * @returns {{ rating_id: string, beer_name: string, brewery?: string, style?: string, venue_name?: string, location_name?: string, created_at?: string, photo_url?: string }}
 */
function ratingToHeadToHeadBeer(r) {
  if (!r || !r.id) return { rating_id: '', beer_name: '' };
  return {
    rating_id: String(r.id),
    beer_name: r.beer_name ?? '',
    brewery: r.brewery ?? undefined,
    style: r.style ?? undefined,
    venue_name: r.location_name ?? undefined,
    location_name: r.location_name ?? undefined,
    created_at: r.created_at ?? undefined,
    photo_url: r.photo_url ?? undefined,
  };
}

/**
 * Check cooldown: do not offer if user has a pending prompt or completed/skipped one in the last N hours.
 * @param {function} rest - (method, path, opts) => Promise<{ status, body }>
 * @param {string} userId - user_id (Keycloak sub)
 * @returns {Promise<boolean>} true if we should NOT offer (cooldown active)
 */
async function isHeadToHeadCooldownActive(rest, userId) {
  const since = new Date(Date.now() - HEAD_TO_HEAD_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
  const path = `/head_to_head_prompts?user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(since)}&limit=1`;
  const res = await rest('GET', path);
  if (res.status >= 400) return true; // on error, don't offer
  const rows = Array.isArray(res.body) ? res.body : [];
  return rows.length > 0;
}

/**
 * Find a challenger rating for head-to-head: same user, same style (or same beer_id), different rating, older than current.
 * @param {function} rest - (method, path, opts) => Promise<{ status, body }>
 * @param {string} userId - user_id
 * @param {object} currentRating - current rating row (id, style, beer_id, created_at)
 * @returns {Promise<object|null>} challenger rating row or null
 */
async function getChallengerRating(rest, userId, currentRating) {
  if (!userId || !currentRating?.id) return null;
  const style = (currentRating.style || '').trim();
  const beerId = currentRating.beer_id || null;
  if (!style && !beerId) return null;

  // Same user, exclude current rating. Match same style or same beer_id.
  let filter = `user_id=eq.${encodeURIComponent(userId)}&id=neq.${encodeURIComponent(currentRating.id)}`;
  if (style && beerId) {
    filter += `&or=(style.eq.${encodeURIComponent(style)},beer_id.eq.${encodeURIComponent(beerId)})`;
  } else if (beerId) {
    filter += `&beer_id=eq.${encodeURIComponent(beerId)}`;
  } else {
    filter += `&style=eq.${encodeURIComponent(style)}`;
  }
  const path = `/ratings?${filter}&select=id,beer_name,brewery,style,location_name,created_at,photo_url,beer_id&order=created_at.desc&limit=20`;
  const res = await rest('GET', path);
  if (res.status >= 400) return null;
  const rows = Array.isArray(res.body) ? res.body : [];
  if (rows.length === 0) return null;
  // Pick one at random among recent same-style ratings for variety
  const idx = Math.floor(Math.random() * Math.min(rows.length, 5));
  return rows[idx] || null;
}

/**
 * Create a head-to-head prompt row and return the API payload for the create response.
 * @param {function} rest - (method, path, opts) => Promise<{ status, body }>
 * @param {string} userId - user_id
 * @param {object} currentRating - full rating row (current, just created)
 * @param {object} challengerRating - challenger rating row
 * @param {number} [rewardTabs] - optional bonus tabs for completing
 * @returns {Promise<{ id: string, reward_tabs: number, current_beer: object, challenger_beer: object }|null>}
 */
async function createPromptAndBuildPayload(rest, userId, currentRating, challengerRating, rewardTabs = HEAD_TO_HEAD_REWARD_TABS) {
  if (!currentRating?.id || !challengerRating?.id) return null;
  const insertRes = await rest('POST', '/head_to_head_prompts', {
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({
      user_id: userId,
      current_rating_id: currentRating.id,
      challenger_rating_id: challengerRating.id,
      reward_tabs: Number.isFinite(rewardTabs) ? rewardTabs : HEAD_TO_HEAD_REWARD_TABS,
      status: 'pending',
    }),
  });
  if (insertRes.status >= 400) return null;
  const row = Array.isArray(insertRes.body) ? insertRes.body[0] : insertRes.body;
  if (!row?.id) return null;
  return {
    id: row.id,
    reward_tabs: row.reward_tabs ?? HEAD_TO_HEAD_REWARD_TABS,
    current_beer: ratingToHeadToHeadBeer(currentRating),
    challenger_beer: ratingToHeadToHeadBeer(challengerRating),
  };
}

/**
 * Decide whether to offer head-to-head after this rating and, if so, create prompt and return payload.
 * Only for authenticated users. Returns null if cooldown, no challenger, or error.
 * @param {function} rest - (method, path, opts) => Promise<{ status, body }>
 * @param {string} userId - user_id
 * @param {object} currentRatingRow - the rating just created (with id, style, beer_id, etc.)
 * @returns {Promise<object|null>} head_to_head payload or null
 */
async function maybeOfferHeadToHead(rest, userId, currentRatingRow) {
  if (!userId || !currentRatingRow?.id) return null;
  if (await isHeadToHeadCooldownActive(rest, userId)) return null;
  const challenger = await getChallengerRating(rest, userId, currentRatingRow);
  if (!challenger) return null;
  return createPromptAndBuildPayload(rest, userId, currentRatingRow, challenger);
}

module.exports = {
  ratingToHeadToHeadBeer,
  isHeadToHeadCooldownActive,
  getChallengerRating,
  createPromptAndBuildPayload,
  maybeOfferHeadToHead,
  HEAD_TO_HEAD_REWARD_TABS,
};
