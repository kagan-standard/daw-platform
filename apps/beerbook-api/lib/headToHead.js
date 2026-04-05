/**
 * Head-to-head comparison: match quality, prompt creation, and payload building.
 * Phase 1: persistence and API only; no Elo.
 * Used by POST /api/ratings (when to attach head_to_head) and by complete/skip handlers.
 */

const { styleToFamily } = require('./styleFamily');

const HEAD_TO_HEAD_REWARD_TABS = Number(process.env.HEAD_TO_HEAD_REWARD_TABS) || 2;
const HEAD_TO_HEAD_YG_TOLERANCE = 2;

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
 * Find a challenger rating for head-to-head: same user, same style family (or same beer_id),
 * different rating, YG within HEAD_TO_HEAD_YG_TOLERANCE.
 * @param {function} rest - (method, path, opts) => Promise<{ status, body }>
 * @param {string} userId - user_id
 * @param {object} currentRating - current rating row (id, style, beer_id, yg_value, created_at, ...)
 * @returns {Promise<object|null>} challenger rating row or null
 */
async function getChallengerRating(rest, userId, currentRating) {
  if (!userId || !currentRating?.id) return null;
  const style = (currentRating.style || '').trim();
  const beerId = currentRating.beer_id || null;
  const currentYg = currentRating.yg_value != null && Number.isFinite(Number(currentRating.yg_value)) ? Number(currentRating.yg_value) : null;
  if (!style && !beerId) return null;

  const filter = `user_id=eq.${encodeURIComponent(userId)}&id=neq.${encodeURIComponent(currentRating.id)}`;
  const path = `/ratings?${filter}&select=id,beer_name,brewery,style,location_name,created_at,photo_url,beer_id,yg_value&order=created_at.desc&limit=80`;
  const res = await rest('GET', path);
  if (res.status >= 400) return null;
  const rows = Array.isArray(res.body) ? res.body : [];
  if (rows.length === 0) return null;

  const currentFamily = style ? styleToFamily(style) : null;
  const candidates = rows.filter((r) => {
    const sameBeer = beerId && r.beer_id === beerId;
    const sameFamily = currentFamily && (r.style || '').trim() && styleToFamily((r.style || '').trim()) === currentFamily;
    if (!sameBeer && !sameFamily) return false;
    const candidateYg = r.yg_value != null && Number.isFinite(Number(r.yg_value)) ? Number(r.yg_value) : null;
    if (currentYg == null || candidateYg == null) return true;
    return Math.abs(currentYg - candidateYg) <= HEAD_TO_HEAD_YG_TOLERANCE;
  });
  if (candidates.length === 0) return null;
  const idx = Math.floor(Math.random() * Math.min(candidates.length, 5));
  return candidates[idx] || null;
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
 * Only for authenticated users. Returns null if no valid challenger or error.
 * @param {function} rest - (method, path, opts) => Promise<{ status, body }>
 * @param {string} userId - user_id
 * @param {object} currentRatingRow - the rating just created (with id, style, beer_id, etc.)
 * @returns {Promise<object|null>} head_to_head payload or null
 */
async function maybeOfferHeadToHead(rest, userId, currentRatingRow) {
  if (!userId || !currentRatingRow?.id) return null;
  const challenger = await getChallengerRating(rest, userId, currentRatingRow);
  if (!challenger) return null;
  return createPromptAndBuildPayload(rest, userId, currentRatingRow, challenger);
}

module.exports = {
  ratingToHeadToHeadBeer,
  getChallengerRating,
  createPromptAndBuildPayload,
  maybeOfferHeadToHead,
  HEAD_TO_HEAD_REWARD_TABS,
};
