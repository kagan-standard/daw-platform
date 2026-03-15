/**
 * Admin API validation: challenges, achievements, achievement categories, featured beers, cosmetics.
 * Used by routes/admin.js to keep handlers thin and enforce contract in one place.
 */

const SLUG_REGEX = /^[a-z0-9_]+$/;

const ACHIEVEMENT_SUBTYPES = new Set([
  'checkin_count', 'total_ratings', 'unique_styles', 'unique_venues', 'review_min_len',
  'stars_gte', 'stars_lte', 'price', 'cheers_given', 'cheers_received', 'streak_weeks',
]);
const ACHIEVEMENT_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const COSMETIC_TYPES = new Set(['border', 'title', 'avatar']);
const COSMETIC_RARITIES = new Set(['common', 'rare', 'epic', 'legendary']);
const COSMETIC_UNLOCK_TYPES = new Set(['achievement', 'purchase', 'both']);

function hasRuleTarget(rules) {
  if (!rules || typeof rules !== 'object') return false;
  const targets = ['count', 'gte', 'min_count', 'target', 'min_checkins', 'weeks'];
  for (const t of targets) {
    const v = rules[t];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return true;
  }
  if (typeof rules.min_length === 'number' && Number.isFinite(rules.min_length)) return true;
  if (typeof rules.stars === 'number' && Number.isFinite(rules.stars)) return true;
  return false;
}

/** Monday 00:00 UTC (ISO string). */
function isMondayUtc(iso) {
  if (!iso || typeof iso !== 'string') return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCDay() === 1 && d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
}

/** @returns {Promise<{ valid: boolean, error?: string, data?: object }>} */
async function validateChallengeCreate(body) {
  const week_start = body.week_start;
  if (!week_start) return { valid: false, error: 'week_start is required' };
  if (!isMondayUtc(week_start)) return { valid: false, error: 'week_start must be a Monday 00:00 UTC' };

  let week_end = body.week_end;
  if (!week_end) {
    const start = new Date(week_start);
    start.setUTCDate(start.getUTCDate() + 7);
    start.setUTCMilliseconds(-1);
    week_end = start.toISOString();
  } else {
    const end = new Date(week_end);
    if (Number.isNaN(end.getTime())) return { valid: false, error: 'week_end must be valid ISO date' };
    if (end <= new Date(week_start)) return { valid: false, error: 'week_end must be after week_start' };
  }

  const title = String(body.title || '').trim();
  if (!title || title.length > 200) return { valid: false, error: 'title is required, 1-200 chars' };

  const description = String(body.description || '').trim();
  if (!description || description.length > 1000) return { valid: false, error: 'description is required, 1-1000 chars' };

  const target_count = parseInt(body.target_count, 10);
  if (!Number.isInteger(target_count) || target_count < 1) return { valid: false, error: 'target_count must be a positive integer' };

  const target_style = body.target_style == null ? null : String(body.target_style).trim() || null;

  const reward_label = String(body.reward_label || '').trim();
  if (!reward_label) return { valid: false, error: 'reward_label is required' };

  let reward_badge_id = body.reward_badge_id;
  if (reward_badge_id != null && reward_badge_id !== '') {
    reward_badge_id = String(reward_badge_id).trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(reward_badge_id)) return { valid: false, error: 'reward_badge_id must be a valid UUID' };
  } else {
    reward_badge_id = null;
  }

  return {
    valid: true,
    data: { week_start, week_end, title, description, target_count, target_style, reward_label, reward_badge_id },
  };
}

/** @returns {Promise<{ valid: boolean, error?: string, data?: object }>} */
async function validateChallengePatch(body) {
  const data = {};
  if (body.week_start !== undefined) {
    if (!isMondayUtc(body.week_start)) return { valid: false, error: 'week_start must be a Monday 00:00 UTC' };
    data.week_start = body.week_start;
  }
  if (body.week_end !== undefined) {
    const end = new Date(body.week_end);
    if (Number.isNaN(end.getTime())) return { valid: false, error: 'week_end must be valid ISO date' };
    data.week_end = body.week_end;
  }
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title || title.length > 200) return { valid: false, error: 'title must be 1-200 chars' };
    data.title = title;
  }
  if (body.description !== undefined) {
    const description = String(body.description).trim();
    if (!description || description.length > 1000) return { valid: false, error: 'description must be 1-1000 chars' };
    data.description = description;
  }
  if (body.target_count !== undefined) {
    const target_count = parseInt(body.target_count, 10);
    if (!Number.isInteger(target_count) || target_count < 1) return { valid: false, error: 'target_count must be a positive integer' };
    data.target_count = target_count;
  }
  if (body.target_style !== undefined) data.target_style = body.target_style === '' || body.target_style == null ? null : String(body.target_style).trim();
  if (body.reward_label !== undefined) {
    const reward_label = String(body.reward_label).trim();
    if (!reward_label) return { valid: false, error: 'reward_label is required' };
    data.reward_label = reward_label;
  }
  if (body.reward_badge_id !== undefined) {
    const v = body.reward_badge_id;
    if (v == null || v === '') data.reward_badge_id = null;
    else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(String(v))) return { valid: false, error: 'reward_badge_id must be a valid UUID' };
      data.reward_badge_id = String(v).trim();
    }
  }
  return { valid: true, data };
}

/** @returns {Promise<{ valid: boolean, error?: string, data?: object }>} */
async function validateAchievementCreate(body) {
  const key = String(body.key || '').trim().toLowerCase();
  if (!key || !SLUG_REGEX.test(key)) return { valid: false, error: 'key is required, slug format [a-z0-9_]' };

  const name = String(body.name || '').trim();
  if (!name || name.length > 200) return { valid: false, error: 'name is required, 1-200 chars' };

  const description = String(body.description || '').trim();
  if (!description) return { valid: false, error: 'description is required' };

  const category_key = String(body.category_key || '').trim();
  if (!category_key) return { valid: false, error: 'category_key is required' };

  const subtype = String(body.subtype || '').trim();
  if (!ACHIEVEMENT_SUBTYPES.has(subtype)) return { valid: false, error: `subtype must be one of: ${[...ACHIEVEMENT_SUBTYPES].join(', ')}` };

  const trigger_type = String(body.trigger_type || '').trim();
  if (!trigger_type) return { valid: false, error: 'trigger_type is required' };

  const rules = body.rules;
  if (!rules || typeof rules !== 'object') return { valid: false, error: 'rules is required (object)' };
  if (!hasRuleTarget(rules)) return { valid: false, error: 'rules must include at least one target (count, gte, min_count, target, min_checkins, weeks, min_length, or stars)' };

  const difficulty = String(body.difficulty || 'easy').trim().toLowerCase();
  if (!ACHIEVEMENT_DIFFICULTIES.has(difficulty)) return { valid: false, error: 'difficulty must be easy, medium, or hard' };

  const reward_tabs = parseInt(body.reward_tabs, 10);
  if (!Number.isInteger(reward_tabs) || reward_tabs < 0) return { valid: false, error: 'reward_tabs must be a non-negative integer' };

  const is_hidden = Boolean(body.is_hidden);

  return {
    valid: true,
    data: {
      key,
      name,
      description,
      category_key,
      subtype,
      trigger_type,
      rules,
      difficulty,
      reward_tabs,
      is_hidden,
    },
  };
}

/** @returns {Promise<{ valid: boolean, error?: string, data?: object }>} */
async function validateAchievementPatch(body) {
  const data = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 200) return { valid: false, error: 'name must be 1-200 chars' };
    data.name = name;
  }
  if (body.description !== undefined) data.description = String(body.description).trim();
  if (body.category_key !== undefined) data.category_key = String(body.category_key).trim();
  if (body.subtype !== undefined) {
    if (!ACHIEVEMENT_SUBTYPES.has(String(body.subtype).trim())) return { valid: false, error: 'invalid subtype' };
    data.subtype = String(body.subtype).trim();
  }
  if (body.trigger_type !== undefined) data.trigger_type = String(body.trigger_type).trim();
  if (body.rules !== undefined) {
    if (typeof body.rules !== 'object') return { valid: false, error: 'rules must be an object' };
    if (!hasRuleTarget(body.rules)) return { valid: false, error: 'rules must include at least one target' };
    data.rules = body.rules;
  }
  if (body.difficulty !== undefined) {
    if (!ACHIEVEMENT_DIFFICULTIES.has(String(body.difficulty).trim().toLowerCase())) return { valid: false, error: 'difficulty must be easy, medium, or hard' };
    data.difficulty = String(body.difficulty).trim().toLowerCase();
  }
  if (body.reward_tabs !== undefined) {
    const reward_tabs = parseInt(body.reward_tabs, 10);
    if (!Number.isInteger(reward_tabs) || reward_tabs < 0) return { valid: false, error: 'reward_tabs must be non-negative integer' };
    data.reward_tabs = reward_tabs;
  }
  if (body.is_hidden !== undefined) data.is_hidden = Boolean(body.is_hidden);
  return { valid: true, data };
}

/** @returns {Promise<{ valid: boolean, error?: string, data?: object }>} */
async function validateAchievementCategoryCreate(body) {
  const key = String(body.key || '').trim().toLowerCase();
  if (!key || !SLUG_REGEX.test(key)) return { valid: false, error: 'key is required, slug format [a-z0-9_]' };

  const name = String(body.name || '').trim();
  if (!name || name.length > 200) return { valid: false, error: 'name is required, 1-200 chars' };

  let icon = body.icon;
  if (icon != null && icon !== '') {
    icon = String(icon).trim();
    if (icon.length > 500) return { valid: false, error: 'icon max 500 chars' };
  } else icon = null;

  const sort_order = parseInt(body.sort_order, 10);
  const sortOrder = Number.isInteger(sort_order) && sort_order >= 0 ? sort_order : 0;

  return { valid: true, data: { key, name, icon, sort_order: sortOrder } };
}

/** @returns {Promise<{ valid: boolean, error?: string, data?: object }>} */
async function validateAchievementCategoryPatch(body) {
  const data = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 200) return { valid: false, error: 'name must be 1-200 chars' };
    data.name = name;
  }
  if (body.icon !== undefined) {
    if (body.icon == null || body.icon === '') data.icon = null;
    else {
      const icon = String(body.icon).trim();
      if (icon.length > 500) return { valid: false, error: 'icon max 500 chars' };
      data.icon = icon;
    }
  }
  if (body.sort_order !== undefined) {
    const n = parseInt(body.sort_order, 10);
    if (!Number.isInteger(n) || n < 0) return { valid: false, error: 'sort_order must be non-negative integer' };
    data.sort_order = n;
  }
  return { valid: true, data };
}

/** @returns {Promise<{ valid: boolean, error?: string, data?: object }>} */
async function validateFeaturedBeerCreate(body, createdBy) {
  const beer_name = String(body.beer_name || '').trim();
  if (!beer_name) return { valid: false, error: 'beer_name is required' };

  const week_start = body.week_start;
  if (!week_start) return { valid: false, error: 'week_start is required' };
  const startDate = new Date(week_start);
  if (Number.isNaN(startDate.getTime())) return { valid: false, error: 'week_start must be valid ISO date' };

  let week_end = body.week_end;
  if (!week_end) {
    const end = new Date(week_start);
    end.setUTCDate(end.getUTCDate() + 7);
    end.setUTCMilliseconds(-1);
    week_end = end.toISOString();
  } else {
    const endDate = new Date(week_end);
    if (Number.isNaN(endDate.getTime())) return { valid: false, error: 'week_end must be valid ISO date' };
    if (endDate <= new Date(week_start)) return { valid: false, error: 'week_end must be after week_start' };
  }

  const beer_id = body.beer_id == null || body.beer_id === '' ? null : String(body.beer_id).trim();
  const brewery = body.brewery == null ? null : String(body.brewery).trim() || null;
  const style = body.style == null ? null : String(body.style).trim() || null;
  const feature_type = String(body.feature_type || 'beer_of_the_week').trim();
  const headline = body.headline == null ? null : String(body.headline).trim() || null;
  const body_text = body.body == null ? null : String(body.body).trim() || null;
  const photo_url = body.photo_url == null ? null : String(body.photo_url).trim() || null;

  return {
    valid: true,
    data: {
      beer_id,
      beer_name,
      brewery,
      style,
      feature_type,
      week_start: new Date(week_start).toISOString(),
      week_end: new Date(week_end).toISOString(),
      headline,
      body: body_text,
      photo_url,
      created_by: createdBy,
    },
  };
}

/** @returns {Promise<{ valid: boolean, error?: string, data?: object }>} */
async function validateFeaturedBeerPatch(body) {
  const data = {};
  if (body.beer_id !== undefined) data.beer_id = body.beer_id === '' || body.beer_id == null ? null : String(body.beer_id).trim();
  if (body.beer_name !== undefined) {
    const beer_name = String(body.beer_name).trim();
    if (!beer_name) return { valid: false, error: 'beer_name cannot be empty' };
    data.beer_name = beer_name;
  }
  if (body.brewery !== undefined) data.brewery = body.brewery === '' || body.brewery == null ? null : String(body.brewery).trim();
  if (body.style !== undefined) data.style = body.style === '' || body.style == null ? null : String(body.style).trim();
  if (body.feature_type !== undefined) data.feature_type = String(body.feature_type).trim();
  if (body.week_start !== undefined) {
    const d = new Date(body.week_start);
    if (Number.isNaN(d.getTime())) return { valid: false, error: 'week_start must be valid ISO date' };
    data.week_start = d.toISOString();
  }
  if (body.week_end !== undefined) {
    const d = new Date(body.week_end);
    if (Number.isNaN(d.getTime())) return { valid: false, error: 'week_end must be valid ISO date' };
    data.week_end = d.toISOString();
  }
  if (body.headline !== undefined) data.headline = body.headline === '' || body.headline == null ? null : String(body.headline).trim();
  if (body.body !== undefined) data.body = body.body === '' || body.body == null ? null : String(body.body).trim();
  if (body.photo_url !== undefined) data.photo_url = body.photo_url === '' || body.photo_url == null ? null : String(body.photo_url).trim();
  return { valid: true, data };
}

/** @returns {Promise<{ valid: boolean, error?: string, data?: object }>} */
async function validateCosmeticCreate(body) {
  const key = String(body.key || '').trim().toLowerCase();
  if (!key || !SLUG_REGEX.test(key)) return { valid: false, error: 'key is required, slug format [a-z0-9_]' };

  const type = String(body.type || '').trim();
  if (!COSMETIC_TYPES.has(type)) return { valid: false, error: 'type must be border, title, or avatar' };

  const name = String(body.name || '').trim();
  if (!name) return { valid: false, error: 'name is required' };

  const description = String(body.description || '').trim();
  if (!description) return { valid: false, error: 'description is required' };

  const rarity = String(body.rarity || 'common').trim().toLowerCase();
  if (!COSMETIC_RARITIES.has(rarity)) return { valid: false, error: 'rarity must be common, rare, epic, or legendary' };

  const unlock_type = String(body.unlock_type || '').trim();
  if (!COSMETIC_UNLOCK_TYPES.has(unlock_type)) return { valid: false, error: 'unlock_type must be achievement, purchase, or both' };

  let tab_price = body.tab_price;
  if (unlock_type === 'purchase' || unlock_type === 'both') {
    const n = parseInt(tab_price, 10);
    if (!Number.isInteger(n) || n < 0) return { valid: false, error: 'tab_price must be non-negative when unlock_type is purchase or both' };
    tab_price = n;
  } else {
    tab_price = body.tab_price != null ? (Number.isInteger(Number(body.tab_price)) && Number(body.tab_price) >= 0 ? Number(body.tab_price) : null) : null;
  }

  const achievement_key = body.achievement_key == null || body.achievement_key === '' ? null : String(body.achievement_key).trim();
  const asset_url = body.asset_url == null ? null : String(body.asset_url).trim() || null;
  const preview_asset_url = body.preview_asset_url == null ? null : String(body.preview_asset_url).trim() || null;
  const title_text = body.title_text == null ? null : String(body.title_text).trim() || null;
  const sort_order = parseInt(body.sort_order, 10);
  const sortOrder = Number.isInteger(sort_order) && sort_order >= 0 ? sort_order : 0;
  const active = body.active !== false;

  return {
    valid: true,
    data: {
      key,
      type,
      name,
      description,
      rarity,
      unlock_type,
      tab_price: tab_price ?? null,
      achievement_key,
      asset_url,
      preview_asset_url,
      title_text,
      sort_order: sortOrder,
      active,
    },
  };
}

/** @returns {Promise<{ valid: boolean, error?: string, data?: object }>} */
async function validateCosmeticPatch(body) {
  const data = {};
  if (body.key !== undefined) {
    const key = String(body.key).trim().toLowerCase();
    if (!key || !SLUG_REGEX.test(key)) return { valid: false, error: 'key must be slug format' };
    data.key = key;
  }
  if (body.type !== undefined) {
    if (!COSMETIC_TYPES.has(String(body.type).trim())) return { valid: false, error: 'type must be border, title, or avatar' };
    data.type = String(body.type).trim();
  }
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.description !== undefined) data.description = String(body.description).trim();
  if (body.rarity !== undefined) {
    if (!COSMETIC_RARITIES.has(String(body.rarity).trim().toLowerCase())) return { valid: false, error: 'rarity must be common, rare, epic, or legendary' };
    data.rarity = String(body.rarity).trim().toLowerCase();
  }
  if (body.unlock_type !== undefined) {
    if (!COSMETIC_UNLOCK_TYPES.has(String(body.unlock_type).trim())) return { valid: false, error: 'unlock_type must be achievement, purchase, or both' };
    data.unlock_type = String(body.unlock_type).trim();
  }
  if (body.tab_price !== undefined) {
    const n = parseInt(body.tab_price, 10);
    if (!Number.isInteger(n) || n < 0) return { valid: false, error: 'tab_price must be non-negative' };
    data.tab_price = n;
  }
  if (body.achievement_key !== undefined) data.achievement_key = body.achievement_key === '' || body.achievement_key == null ? null : String(body.achievement_key).trim();
  if (body.asset_url !== undefined) data.asset_url = body.asset_url === '' || body.asset_url == null ? null : String(body.asset_url).trim();
  if (body.preview_asset_url !== undefined) data.preview_asset_url = body.preview_asset_url === '' || body.preview_asset_url == null ? null : String(body.preview_asset_url).trim();
  if (body.title_text !== undefined) data.title_text = body.title_text === '' || body.title_text == null ? null : String(body.title_text).trim();
  if (body.sort_order !== undefined) {
    const n = parseInt(body.sort_order, 10);
    if (!Number.isInteger(n) || n < 0) return { valid: false, error: 'sort_order must be non-negative' };
    data.sort_order = n;
  }
  if (body.active !== undefined) data.active = Boolean(body.active);

  if (body.border_fit !== undefined) {
    const bf = body.border_fit;
    if (bf === null) {
      data.border_fit = null;
    } else if (typeof bf === 'object' && bf !== null) {
      const scale = bf.scale;
      const rotationDeg = bf.rotationDeg;
      const offsetX = bf.offsetX;
      const offsetY = bf.offsetY;
      const avatarScale = bf.avatarScale;
      if (
        typeof scale !== 'number' || !Number.isFinite(scale) ||
        typeof rotationDeg !== 'number' || !Number.isFinite(rotationDeg) ||
        typeof offsetX !== 'number' || !Number.isFinite(offsetX) ||
        typeof offsetY !== 'number' || !Number.isFinite(offsetY)
      ) {
        return { valid: false, error: 'border_fit must have finite numbers for scale, rotationDeg, offsetX, offsetY' };
      }
      if (scale <= 0 || scale > 5) return { valid: false, error: 'border_fit.scale must be in (0, 5]' };
      if (rotationDeg < -360 || rotationDeg > 360) return { valid: false, error: 'border_fit.rotationDeg must be in [-360, 360]' };
      const out = { scale, rotationDeg, offsetX, offsetY };
      if (avatarScale !== undefined && avatarScale !== null) {
        if (typeof avatarScale !== 'number' || !Number.isFinite(avatarScale)) {
          return { valid: false, error: 'border_fit.avatarScale must be a finite number when provided' };
        }
        out.avatarScale = avatarScale;
      }
      data.border_fit = out;
    } else {
      return { valid: false, error: 'border_fit must be null or an object' };
    }
  }

  return { valid: true, data };
}

/**
 * Admin PATCH beer (catalog): name, brewery_name, style, abv.
 * All fields optional; name non-empty if provided; abv 0–30 if present.
 * @returns {{ valid: boolean, error?: string, data?: object }}
 */
function validateBeerPatch(body) {
  const data = {};
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) return { valid: false, error: 'name cannot be empty' };
    data.name = name;
  }
  if (body.brewery_name !== undefined) {
    data.brewery_name = body.brewery_name === '' || body.brewery_name == null ? null : String(body.brewery_name).trim();
  }
  if (body.style !== undefined) {
    data.style = body.style === '' || body.style == null ? null : String(body.style).trim();
  }
  if (body.abv !== undefined) {
    if (body.abv === '' || body.abv == null) {
      data.abv = null;
    } else {
      const abv = Number(body.abv);
      if (!Number.isFinite(abv) || abv < 0 || abv > 30) {
        return { valid: false, error: 'abv must be a number between 0 and 30' };
      }
      data.abv = abv;
    }
  }
  return { valid: true, data };
}

module.exports = {
  validateChallengeCreate,
  validateChallengePatch,
  validateAchievementCreate,
  validateAchievementPatch,
  validateAchievementCategoryCreate,
  validateAchievementCategoryPatch,
  validateFeaturedBeerCreate,
  validateFeaturedBeerPatch,
  validateCosmeticCreate,
  validateCosmeticPatch,
  validateBeerPatch,
};
