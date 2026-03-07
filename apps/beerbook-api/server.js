/**
 * BeerBook API — BFF: Keycloak JWT validation, pagination, rate limit, CORS.
 * Proxies to PostgREST (internal) with SUPABASE_SERVICE_ROLE_KEY.
 */
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const {
  awardTabsForRating,
  ensureProfileExists,
  ensureUserTabsProfile,
  getTierMultiplier,
  calculateRatingComponents,
} = require('./lib/tabs');
const { invokeProcessEvent } = require('./lib/processEvent');

const app = express();
app.set('trust proxy', 1);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'data', 'uploads');
const PORT = Number(process.env.PORT) || 3000;
// PostgREST only; no SUPABASE_URL required. Self-hosted: set SUPABASE_REST_URL if different (e.g. http://supabase-rest:3000).
const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://beerbook.drinksafterwork.net';
// Allowlist for CORS: web origin + optional comma-separated CORS_ORIGINS (e.g. mobile app origins)
const CORS_ORIGINS_RAW = process.env.CORS_ORIGINS || '';
const CORS_ALLOWED_ORIGINS = new Set(
  [CORS_ORIGIN, ...CORS_ORIGINS_RAW.split(',').map((o) => o.trim()).filter(Boolean)]
);
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || 'https://auth.drinksafterwork.net/realms/daw';
const KEYCLOAK_JWKS_URI = process.env.KEYCLOAK_JWKS_URI || 'https://auth.drinksafterwork.net/realms/daw/protocol/openid-connect/certs';
const CLOCK_SKEW = Number(process.env.TOKEN_CLOCK_SKEW_SECONDS) || 30;
const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
// Raised default (200) for mobile/bootstrap burst; set RATE_LIMIT_MAX=100 to keep previous behavior
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX) || 200;
const ADMIN_USER_IDS = new Set(
  [
    process.env.ADMIN_USER_ID || '',
    process.env.ADMIN_USER_IDS || '',
  ]
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean)
);

const SORT_WHITELIST = ['created_at', 'rating', 'beer_name'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CATALOG_SORT_WHITELIST = ['name', 'abv', 'review_overall', 'review_count'];

function isAdmin(sub) {
  return ADMIN_USER_IDS.has(String(sub || '').trim());
}

function sanitizeRatingsReadPath(method, requestPath) {
  const upperMethod = String(method || '').toUpperCase();
  if (upperMethod !== 'GET') return requestPath;
  const pathText = String(requestPath || '');
  if (!pathText.startsWith('/ratings') || !pathText.includes('is_new_beer')) return requestPath;

  const [pathname, rawQuery = ''] = pathText.split('?');
  if (!rawQuery) return pathname;
  const params = new URLSearchParams(rawQuery);

  // Strip filter-only/business flags that are not real ratings columns.
  params.delete('is_new_beer');

  const selectRaw = params.get('select');
  if (selectRaw) {
    const safeColumns = selectRaw
      .split(',')
      .map((col) => col.trim())
      .filter(Boolean)
      .filter((col) => col !== 'is_new_beer');
    if (safeColumns.length) params.set('select', safeColumns.join(','));
    else params.delete('select');
  }

  const orderRaw = params.get('order');
  if (orderRaw) {
    const [field] = orderRaw.split('.');
    if (field === 'is_new_beer') params.set('order', 'created_at.desc');
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

// ---------- Helpers: call PostgREST ----------
// BUG FIX #2: Don't spread opts into fetch — it overrides the constructed headers.
// Instead, only pass method, headers, and body explicitly.
async function rest(method, path, opts = {}) {
  const safePath = sanitizeRatingsReadPath(method, path);
  const url = `${REST_URL}${safePath}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'apikey': SERVICE_ROLE_KEY,
    ...opts.headers,
  };
  const res = await fetch(url, { method, headers, body: opts.body });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body };
}

function totalFromContentRange(contentRange) {
  if (!contentRange) return null;
  const m = contentRange.match(/\/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

async function attachCheersDataToRatings(ratings, requester = null) {
  if (!Array.isArray(ratings) || !ratings.length) return ratings;
  const ratingIds = [...new Set(ratings.map((r) => String(r?.id || '').trim()).filter(Boolean))];
  if (!ratingIds.length) return ratings;
  const idList = ratingIds.map((id) => encodeURIComponent(id)).join(',');
  if (!idList) return ratings;

  const [allCheersRes, myCheersRes] = await Promise.all([
    rest('GET', `/reactions?rating_id=in.(${idList})&reaction_type=eq.cheers&select=rating_id&limit=20000`),
    requester
      ? rest('GET', `/reactions?rating_id=in.(${idList})&reaction_type=eq.cheers&user_id=eq.${encodeURIComponent(requester)}&select=rating_id&limit=20000`)
      : Promise.resolve({ status: 200, body: [] }),
  ]);

  if (allCheersRes.status >= 400) return ratings;
  if (requester && myCheersRes.status >= 400) return ratings;

  const cheersByRating = Object.create(null);
  const allRows = Array.isArray(allCheersRes.body) ? allCheersRes.body : [];
  allRows.forEach((row) => {
    const rid = row && row.rating_id ? String(row.rating_id) : '';
    if (!rid) return;
    cheersByRating[rid] = (cheersByRating[rid] || 0) + 1;
  });

  const myCheered = new Set(
    (Array.isArray(myCheersRes.body) ? myCheersRes.body : [])
      .map((row) => (row && row.rating_id ? String(row.rating_id) : ''))
      .filter(Boolean)
  );

  return ratings.map((r) => {
    const rid = String(r?.id || '');
    return {
      ...r,
      cheers_count: cheersByRating[rid] || 0,
      you_cheered: requester ? myCheered.has(rid) : false,
    };
  });
}

async function attachRatingAchievementDataToRatings(ratings) {
  if (!Array.isArray(ratings) || !ratings.length) return ratings;
  const ratingIds = [...new Set(ratings.map((r) => String(r?.id || '').trim()).filter(Boolean))];
  const userIds = [...new Set(ratings.map((r) => String(r?.user_id || '').trim()).filter(Boolean))];
  if (!ratingIds.length || !userIds.length) return ratings;

  const usersList = userIds.map((id) => encodeURIComponent(id)).join(',');
  if (!usersList) return ratings;

  const uaRes = await rest(
    'GET',
    `/user_achievements?user_id=in.(${usersList})&select=user_id,achievement_id,context,unlocked_at&order=unlocked_at.desc&limit=20000`
  );
  if (uaRes.status >= 400) return ratings;

  const rows = Array.isArray(uaRes.body) ? uaRes.body : [];
  const ratingIdSet = new Set(ratingIds);
  const byRatingId = Object.create(null);
  rows.forEach((row) => {
    const context = row?.context && typeof row.context === 'object' ? row.context : {};
    const ratingId = String(context.rating_id || '').trim();
    const userId = String(row?.user_id || '').trim();
    const achievementId = row?.achievement_id;
    if (!ratingId || !userId || !achievementId) return;
    if (!ratingIdSet.has(ratingId)) return;
    if (!byRatingId[ratingId]) byRatingId[ratingId] = [];
    byRatingId[ratingId].push({ user_id: userId, achievement_id: achievementId });
  });

  return ratings.map((rating) => {
    const ratingId = String(rating?.id || '').trim();
    const ratingUserId = String(rating?.user_id || '').trim();
    const existingIds = Array.isArray(rating?.earned_achievement_ids)
      ? rating.earned_achievement_ids.filter(Boolean)
      : [];
    const derivedIds = (byRatingId[ratingId] || [])
      .filter((row) => row.user_id === ratingUserId)
      .map((row) => row.achievement_id)
      .filter(Boolean);
    const mergedIds = [...new Set([...existingIds, ...derivedIds])];
    return {
      ...rating,
      earned_achievement_ids: mergedIds,
      achievement_id: rating?.achievement_id || mergedIds[0] || null,
    };
  });
}

async function attachEquippedCosmeticsToProfile(profile) {
  if (!profile || typeof profile !== 'object') return profile;
  const borderId = profile.equipped_border_id;
  const titleId = profile.equipped_title_id;
  const ids = [borderId, titleId].filter(Boolean);
  if (!ids.length) {
    return {
      ...profile,
      equipped_border_asset_url: null,
      equipped_title_text: null,
    };
  }

  const idList = [...new Set(ids)].map((id) => encodeURIComponent(id)).join(',');
  if (!idList) {
    return {
      ...profile,
      equipped_border_asset_url: null,
      equipped_title_text: null,
    };
  }

  const out = await rest('GET', `/cosmetics?id=in.(${idList})&select=id,asset_url,title_text,name&limit=10`);
  const cosmetics = out.status < 400 && Array.isArray(out.body) ? out.body : [];
  const byId = Object.fromEntries(cosmetics.map((row) => [row.id, row]));
  const border = borderId ? byId[borderId] : null;
  const title = titleId ? byId[titleId] : null;

  return {
    ...profile,
    equipped_border_asset_url: border?.asset_url ?? null,
    equipped_title_text: title?.title_text || title?.name || null,
  };
}

function requestIdMiddleware(req, res, next) {
  const headerId = String(req.headers['x-request-id'] || '').trim();
  req.requestId = headerId || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}

// ---------- CORS: allowlist; native/mobile (no Origin) allowed for preflight ----------
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const hasOrigin = typeof origin === 'string' && origin.length > 0;
  const allowed = !hasOrigin || CORS_ALLOWED_ORIGINS.has(origin);
  const allowMethods = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
  const allowHeaders = 'Content-Type, Authorization';
  if (req.method === 'OPTIONS') {
    if (allowed) {
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Origin', hasOrigin ? origin : CORS_ORIGIN);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', allowMethods);
      res.setHeader('Access-Control-Allow-Headers', allowHeaders);
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }
    return res.status(403).end();
  }
  if (allowed && hasOrigin && CORS_ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', allowMethods);
    res.setHeader('Access-Control-Allow-Headers', allowHeaders);
  }
  next();
}

app.use(corsMiddleware);
app.use(requestIdMiddleware);
app.use(express.json());
// Serve static assets from /public at the root path (e.g., /images/...)
app.use(express.static(path.join(__dirname, 'public')));
// Phase 2.1: serve uploaded images (same origin as API)
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- Rate limiting (all /api routes) ----------
const limiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Keep 429 shape stable for clients: error_code, error, retryAfter, request_id
  handler: (req, res) => {
    const retryAfter = Math.ceil(RATE_WINDOW_MS / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error_code: 'RATE_LIMITED',
      error: 'Too Many Requests',
      retryAfter,
      request_id: req.requestId || null,
    });
  },
});
app.use('/api', limiter);

// ---------- Route helpers (shared with route modules) ----------
const routeHelpers = {
  rest,
  totalFromContentRange,
  parsePagination: () => {}, // set after parsePagination is defined
  authMiddleware: () => {}, // set after authMiddleware is defined
  softAuthMiddleware: (req, res, next) => next(),
  adminMiddleware: (req, res, next) => next(),
};

// ---------- JWKS + auth middleware ----------
let jwks;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(KEYCLOAK_JWKS_URI));
  return jwks;
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({
      error_code: 'AUTH_REQUIRED',
      error: 'Missing or invalid Authorization header',
      request_id: req.requestId || null,
    });
  }
  const token = auth.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: KEYCLOAK_ISSUER,
      clockTolerance: CLOCK_SKEW,
    });
    const aud = payload.aud;
    const azp = payload.azp;
    const audOk = aud === 'beerbook' || aud === 'beerbook-mobile' || (Array.isArray(aud) && (aud.includes('beerbook') || aud.includes('beerbook-mobile')));
    if (!audOk) {
      return res.status(403).json({
        error_code: 'TOKEN_AUDIENCE_NOT_ALLOWED',
        error: 'Token audience not allowed',
        request_id: req.requestId || null,
      });
    }
    const azpOk = azp === 'beerbook' || azp === 'beerbook-mobile';
    if (!azpOk) {
      return res.status(403).json({
        error_code: 'TOKEN_AZP_NOT_ALLOWED',
        error: 'Token azp not allowed',
        request_id: req.requestId || null,
      });
    }
    req.claims = {
      sub: payload.sub,
      preferred_username: payload.preferred_username || payload.sub,
      email: payload.email || '',
      realm_access: payload.realm_access || { roles: [] },
    };
    next();
  } catch (e) {
    if (e.code === 'ERR_JWT_EXPIRED') {
      return res.status(401).json({
        error_code: 'TOKEN_EXPIRED',
        error: 'Token expired',
        request_id: req.requestId || null,
      });
    }
    if (e.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
      return res.status(401).json({
        error_code: 'TOKEN_CLAIMS_INVALID',
        error: 'Invalid token claims',
        request_id: req.requestId || null,
      });
    }
    return res.status(401).json({
      error_code: 'TOKEN_INVALID',
      error: 'Invalid token',
      request_id: req.requestId || null,
    });
  }
}

async function softAuthMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return next();
  const token = auth.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: KEYCLOAK_ISSUER,
      clockTolerance: CLOCK_SKEW,
    });
    const aud = payload.aud;
    const azp = payload.azp;
    const audOk = aud === 'beerbook' || aud === 'beerbook-mobile' || (Array.isArray(aud) && (aud.includes('beerbook') || aud.includes('beerbook-mobile')));
    const azpOk = azp === 'beerbook' || azp === 'beerbook-mobile';
    if (!audOk || !azpOk) return next();
    req.claims = {
      sub: payload.sub,
      preferred_username: payload.preferred_username || payload.sub,
      email: payload.email || '',
      realm_access: payload.realm_access || { roles: [] },
    };
    return next();
  } catch (_) {
    return next();
  }
}

/** Verify Keycloak JWT and return sub (for internal process-event); same contract as Edge Function. */
async function getKeycloakUserId(token) {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: KEYCLOAK_ISSUER,
      clockTolerance: CLOCK_SKEW,
    });
    const aud = payload.aud;
    const azp = payload.azp;
    const audOk = aud === 'beerbook' || aud === 'beerbook-mobile' || (Array.isArray(aud) && (aud.includes('beerbook') || aud.includes('beerbook-mobile')));
    if (!audOk) return null;
    const azpOk = azp === 'beerbook' || azp === 'beerbook-mobile';
    if (!azpOk) return null;
    const sub = payload.sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

function adminMiddleware(req, res, next) {
  if (!req.claims) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!isAdmin(req.claims.sub)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

// ---------- Pagination parse ----------
function parsePagination(req) {
  let limit = parseInt(req.query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  let offset = parseInt(req.query.offset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  const sort = SORT_WHITELIST.includes(req.query.sort) ? req.query.sort : 'created_at';
  const order = (req.query.order === 'asc' || req.query.order === 'desc') ? req.query.order : 'desc';
  return { limit, offset, sort, order };
}

// ---------- Sort validation middleware ----------
// BUG FIX #3: Reject invalid sort fields with 400 on all endpoints consistently.
function validateSort(req, res, next) {
  if (req.query.sort && !SORT_WHITELIST.includes(req.query.sort)) {
    return res.status(400).json({ error: 'Invalid sort field. Allowed: ' + SORT_WHITELIST.join(', ') });
  }
  next();
}

// ---------- Phase 2.1 route modules (mount before /api/ratings so /api/ratings/:id/cheers takes precedence) ----------
routeHelpers.parsePagination = parsePagination;
routeHelpers.authMiddleware = authMiddleware;
routeHelpers.softAuthMiddleware = softAuthMiddleware;
routeHelpers.adminMiddleware = adminMiddleware;

const activityRoutes = require('./routes/activity')({ ...routeHelpers });
const beersRoutes = require('./routes/beers')({ ...routeHelpers });
const exchangeRoutes = require('./routes/exchange')({ ...routeHelpers });
const venuesRoutes = require('./routes/venues')({ ...routeHelpers });
const dealsRoutes = require('./routes/deals')({ ...routeHelpers });
const mapRoutes = require('./routes/map')({ ...routeHelpers });
const leaderboardRoutes = require('./routes/leaderboard')({ ...routeHelpers });
const uploadRoutes = require('./routes/upload')({ ...routeHelpers });
const highlightsRoutes = require('./routes/highlights')({ ...routeHelpers });
const adminRoutes = require('./routes/admin')({ ...routeHelpers });
const trackingRoutes = require('./routes/tracking')({ ...routeHelpers });
const tabsRoutes = require('./routes/tabs')({ ...routeHelpers });
const followsRoutes = require('./routes/follows')({ ...routeHelpers });
const crewsRoutes = require('./routes/crews')({ ...routeHelpers });
const internalRoutesModule = require('./routes/internal');
const internalOpts = { rest, totalFromContentRange, getKeycloakUserId };
const internalRoutes = internalRoutesModule(internalOpts);
require('./lib/processEvent').setInProcessHandler((authHeader, body) =>
  internalRoutesModule.handleProcessEventRequest(internalOpts, authHeader, body)
);

app.use('/api', activityRoutes);
app.use('/api/beers', beersRoutes);
app.use('/api/exchange', exchangeRoutes);
app.use('/api/venues', venuesRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/highlights', highlightsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', trackingRoutes);
app.use('/api', tabsRoutes);
app.use('/api', followsRoutes);
app.use('/api', crewsRoutes);
app.use('/internal', internalRoutes);

// ---------- Phase 3.2: Catalog (no auth — public catalog) ----------
function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getCurrentWeekStartUtcIso() {
  const d = new Date();
  const utcDay = d.getUTCDay();
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function mapCatalogBeer(row) {
  const reviews = {
    aroma: toNumberOrNull(row.review_aroma),
    appearance: toNumberOrNull(row.review_appearance),
    palate: toNumberOrNull(row.review_palate),
    taste: toNumberOrNull(row.review_taste),
    overall: toNumberOrNull(row.review_overall),
    count: toNumberOrNull(row.review_count),
  };
  return {
    id: row.id,
    name: row.name,
    brewery_name: row.brewery_name ?? null,
    style: row.style ?? null,
    abv: toNumberOrNull(row.abv),
    description: row.description ?? null,
    ibu_min: toNumberOrNull(row.ibu_min),
    ibu_max: toNumberOrNull(row.ibu_max),
    flavors: {
      astringency: toNumberOrNull(row.flavor_astringency),
      body: toNumberOrNull(row.flavor_body),
      alcohol: toNumberOrNull(row.flavor_alcohol),
      bitter: toNumberOrNull(row.flavor_bitter),
      sweet: toNumberOrNull(row.flavor_sweet),
      sour: toNumberOrNull(row.flavor_sour),
      salty: toNumberOrNull(row.flavor_salty),
      fruits: toNumberOrNull(row.flavor_fruity),
      hoppy: toNumberOrNull(row.flavor_hoppy),
      spices: toNumberOrNull(row.flavor_spicy),
      malty: toNumberOrNull(row.flavor_malty),
    },
    reviews,
    // Backward-compat fields still used by existing frontend code paths.
    review_aroma: reviews.aroma,
    review_appearance: reviews.appearance,
    review_palate: reviews.palate,
    review_taste: reviews.taste,
    review_overall: reviews.overall ?? toNumberOrNull(row.review_overall),
    review_count: reviews.count ?? (toNumberOrNull(row.review_count) ?? 0),
  };
}

async function findSimilarBeers(name, brewery, limit = 5) {
  const safeName = String(name || '').trim();
  const safeBrewery = String(brewery || '').trim();
  if (!safeName || !safeBrewery) return [];

  const { status, body } = await rest('POST', '/rpc/validate_new_beer_matches', {
    body: JSON.stringify({
      p_name: safeName,
      p_brewery: safeBrewery,
      p_limit: Math.min(Math.max(Number(limit) || 5, 1), 10),
    }),
  });
  if (status >= 400) throw new Error('validate_new_beer_matches failed');

  const rows = Array.isArray(body) ? body : [];
  return rows.map((row) => {
    const nameSim = Number(row.name_sim || 0);
    const brewerySim = Number(row.brewery_sim || 0);
    return {
      id: row.id,
      name: row.name,
      brewery_name: row.brewery_name ?? null,
      style: row.style ?? null,
      abv: row.abv != null ? Number(row.abv) : null,
      name_sim: nameSim,
      brewery_sim: brewerySim,
      similarity: Number(Math.max(nameSim, brewerySim).toFixed(4)),
    };
  });
}

// GET /api/catalog/search?q=<query>&limit=<n>
app.get('/api/catalog/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  if (q.length < 2) {
    return res.json({ data: [] });
  }
  try {
    const { status, body } = await rest('POST', '/rpc/search_beer_catalog', {
      body: JSON.stringify({ search_term: q, max_results: limit }),
    });
    if (status >= 400) {
      return res.status(status >= 500 ? 502 : status).json(body || { error: 'Catalog search failed' });
    }
    const rows = Array.isArray(body) ? body : [];
    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      brewery_name: r.brewery_name ?? null,
      style: r.style ?? null,
      abv: r.abv != null ? Number(r.abv) : null,
      description: r.description ?? null,
      review_overall: r.review_overall != null ? Number(r.review_overall) : null,
      review_count: r.review_count != null ? Number(r.review_count) : null,
    }));
    res.json({ data });
  } catch (e) {
    console.error('Catalog search error:', e);
    res.status(502).json({ error: 'Catalog search failed' });
  }
});

// GET /api/catalog/browse?limit=30&offset=0&sort=name&order=asc&style=IPA&q=hazy
app.get('/api/catalog/browse', async (req, res) => {
  const rawLimit = parseInt(req.query.limit, 10);
  const rawOffset = parseInt(req.query.offset, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const sort = CATALOG_SORT_WHITELIST.includes(req.query.sort) ? req.query.sort : 'name';
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const style = (req.query.style || '').trim();
  const q = (req.query.q || '').trim().replace(/%/g, '');
  const like = encodeURIComponent(`*${q}*`);

  let path = '/beers?';
  path += 'select=id,name,brewery_name,style,abv,description,ibu_min,ibu_max,';
  path += 'flavor_astringency,flavor_body,flavor_alcohol,flavor_bitter,flavor_sweet,flavor_sour,';
  path += 'flavor_salty,flavor_fruity,flavor_hoppy,flavor_spicy,flavor_malty,';
  path += 'review_aroma,review_appearance,review_palate,review_taste,review_overall,review_count';
  path += `&limit=${limit}&offset=${offset}&order=${sort}.${order}`;

  if (style) {
    path += `&style=eq.${encodeURIComponent(style)}`;
  }
  if (q) {
    path += `&or=(name.ilike.${like},brewery_name.ilike.${like},style.ilike.${like})`;
  }

  try {
    const { status, headers, body } = await rest('GET', path, { headers: { Prefer: 'count=exact' } });
    if (status >= 400) {
      return res.status(status >= 500 ? 502 : status).json(body || { error: 'Catalog browse failed' });
    }
    const rows = Array.isArray(body) ? body : [];
    const total = totalFromContentRange(headers['content-range']) ?? rows.length;
    res.json({
      data: rows.map(mapCatalogBeer),
      pagination: { limit, offset, total },
    });
  } catch (e) {
    console.error('Catalog browse error:', e);
    res.status(502).json({ error: 'Catalog browse failed' });
  }
});

// GET /api/catalog/styles — distinct style list for filters
app.get('/api/catalog/styles', async (req, res) => {
  try {
    const { status, body } = await rest('GET', '/beers?select=style&style=not.is.null&order=style.asc&limit=10000');
    if (status >= 400) {
      return res.status(status >= 500 ? 502 : status).json(body || { error: 'Catalog styles failed' });
    }
    const rows = Array.isArray(body) ? body : [];
    const uniq = [];
    const seen = new Set();
    for (const row of rows) {
      const style = (row && row.style ? String(row.style) : '').trim();
      if (!style) continue;
      const key = style.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(style);
    }
    res.json({ data: uniq });
  } catch (e) {
    console.error('Catalog styles error:', e);
    res.status(502).json({ error: 'Catalog styles failed' });
  }
});

// GET /api/catalog/validate-new?name=...&brewery=...
// Returns similar beers from the catalog to prevent duplicates when adding new beers
app.get('/api/catalog/validate-new', async (req, res) => {
  const name = (req.query.name || '').trim();
  const brewery = (req.query.brewery || '').trim();
  if (name.length < 2) return res.json({ data: [] });

  try {
    const nameSearchRes = await rest('POST', '/rpc/search_beer_catalog', {
      body: JSON.stringify({ search_term: name, max_results: 20 }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (nameSearchRes.status >= 400) {
      return res.json({ data: [] });
    }

    const candidates = Array.isArray(nameSearchRes.body) ? nameSearchRes.body : [];

    const results = candidates
      .map(beer => {
        const nameSim = beer.similarity_score || 0;
        const beerBrewery = (beer.brewery_name || '').toLowerCase();
        const inputBrewery = brewery.toLowerCase();
        const breweryMatch = brewery.length >= 2 && (
          beerBrewery.includes(inputBrewery) ||
          inputBrewery.includes(beerBrewery) ||
          beerBrewery === inputBrewery
        );
        return {
          id: beer.id,
          name: beer.name,
          brewery_name: beer.brewery_name,
          style: beer.style,
          abv: beer.abv != null ? Number(beer.abv) : null,
          name_similarity: nameSim,
          brewery_match: breweryMatch,
          similarity: nameSim,
        };
      })
      .filter(b => b.name_similarity > 0.4 || (b.name_similarity > 0.25 && b.brewery_match))
      .sort((a, b) => b.name_similarity - a.name_similarity)
      .slice(0, 5);

    res.json({ data: results });
  } catch (e) {
    console.error('Validate new beer error:', e);
    res.json({ data: [] });
  }
});

// GET /api/catalog/beer/:id — single catalog beer (expanded detail)
app.get('/api/catalog/beer/:id', async (req, res) => {
  const id = encodeURIComponent((req.params.id || '').trim());
  try {
    const { status, body } = await rest(
      'GET',
      `/beers?id=eq.${id}&select=id,name,brewery_name,style,abv,description,ibu_min,ibu_max,flavor_astringency,flavor_body,flavor_alcohol,flavor_bitter,flavor_sweet,flavor_sour,flavor_salty,flavor_fruity,flavor_hoppy,flavor_spicy,flavor_malty,review_aroma,review_appearance,review_palate,review_taste,review_overall,review_count&limit=1`
    );
    if (status >= 400) {
      return res.status(status >= 500 ? 502 : status).json(body || { error: 'Upstream error' });
    }
    const row = Array.isArray(body) && body[0] ? body[0] : null;
    if (!row) return res.status(404).json({ error: 'Beer not found' });
    res.json(mapCatalogBeer(row));
  } catch (e) {
    console.error('Catalog beer error:', e);
    res.status(502).json({ error: 'Catalog fetch failed' });
  }
});

// ---------- Phase 3.9: Brewery map + search (no auth — public) ----------
// GET /api/breweries/search?q=<term>&limit=<n> — trigram + alias search, min 2 chars
app.get('/api/breweries/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 25);
  if (q.length < 2) {
    return res.status(400).json({ error: 'Query q is required and must be at least 2 characters' });
  }
  try {
    const { status, body } = await rest('POST', '/rpc/search_breweries', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search_term: q, max_results: limit }),
    });
    if (status >= 400) {
      return res.status(status >= 500 ? 502 : status).json(body || { error: 'Brewery search failed' });
    }
    const rows = Array.isArray(body) ? body : [];
    const data = rows.map((b) => ({
      id: b.id,
      name: b.name ?? null,
      slug: b.slug ?? null,
      city: b.city ?? null,
      state: b.state ?? null,
      brewery_type: b.brewery_type ?? null,
      logo_url: b.logo_url ?? null,
      latitude: b.latitude != null ? Number(b.latitude) : null,
      longitude: b.longitude != null ? Number(b.longitude) : null,
      verified: b.verified === true,
      similarity_score: b.similarity_score != null ? Number(b.similarity_score) : null,
    }));
    res.json({ data });
  } catch (e) {
    console.error('Brewery search error:', e);
    res.status(502).json({ error: 'Brewery search failed' });
  }
});

// GET /api/breweries/map?bounds=sw_lat,sw_lng,ne_lat,ne_lng — breweries in viewport, max 500
const handleBreweriesMap = async (req, res) => {
  const boundsStr = (req.query.bounds || '').trim();
  const limit = 500;
  try {
    const hasBounds = (() => {
      if (!boundsStr) return false;
      const parts = boundsStr.split(',').map((s) => parseFloat(s.trim()));
      return parts.length >= 4 && parts.every((n) => Number.isFinite(n));
    })();

    let path = '/breweries?brewery_type=not.in.(closed,planning)';
    if (!hasBounds) {
      path += '&latitude=not.is.null&longitude=not.is.null';
    }
    path += '&select=id,name,latitude,longitude,brewery_type,city,state,website_url,phone';
    path += `&limit=${limit}`;

    if (hasBounds) {
      const parts = boundsStr.split(',').map((s) => parseFloat(s.trim()));
      const [swLat, swLng, neLat, neLng] = parts;
      const minLat = Math.min(swLat, neLat);
      const maxLat = Math.max(swLat, neLat);
      const minLng = Math.min(swLng, neLng);
      const maxLng = Math.max(swLng, neLng);
      path += `&latitude=gte.${minLat}&latitude=lte.${maxLat}&longitude=gte.${minLng}&longitude=lte.${maxLng}`;
    }

    const { status, body } = await rest('GET', path);
    if (status >= 400) {
      return res.status(status >= 500 ? 502 : status).json(body || { error: 'Breweries fetch failed' });
    }
    let list = Array.isArray(body) ? body : [];
    if (boundsStr) {
      const parts = boundsStr.split(',').map((s) => parseFloat(s.trim()));
      if (parts.length >= 4) {
        const [swLat, swLng, neLat, neLng] = parts;
        const centerLat = (swLat + neLat) / 2;
        const centerLng = (swLng + neLng) / 2;
        const dist = (b) => {
          const lat = Number(b.latitude);
          const lng = Number(b.longitude);
          return (lat - centerLat) ** 2 + (lng - centerLng) ** 2;
        };
        list.sort((a, b) => dist(a) - dist(b));
      }
    }
    const data = list.map((b) => ({
      id: b.id,
      name: b.name,
      latitude: b.latitude != null ? Number(b.latitude) : null,
      longitude: b.longitude != null ? Number(b.longitude) : null,
      brewery_type: b.brewery_type ?? null,
      city: b.city ?? null,
      state: b.state ?? b.state_province ?? null,
      website_url: b.website_url ?? null,
      phone: b.phone ?? null,
    }));
    res.json({ data });
  } catch (e) {
    console.error('Breweries map error:', e);
    res.status(502).json({ error: 'Breweries map failed' });
  }
};
app.get('/api/breweries/map', handleBreweriesMap);
// Alias for mobile compatibility.
app.get('/api/map/breweries', handleBreweriesMap);

// GET /api/breweries/:id — full brewery detail + linked beers
app.get('/api/breweries/:id', async (req, res) => {
  const id = encodeURIComponent(req.params.id);
  try {
    const { status: brewStatus, body: brewBody } = await rest('GET', `/breweries?id=eq.${id}&limit=1`);
    if (brewStatus >= 400) {
      return res.status(brewStatus >= 500 ? 502 : brewStatus).json(brewBody || { error: 'Upstream error' });
    }
    const brewery = Array.isArray(brewBody) && brewBody[0] ? brewBody[0] : null;
    if (!brewery) return res.status(404).json({ error: 'Brewery not found' });

    const { status: beersStatus, body: beersBody } = await rest('GET',
      `/beers?brewery_id=eq.${id}&select=name,style,abv&order=name.asc&limit=100`);
    const beers = (beersStatus < 400 && Array.isArray(beersBody)) ? beersBody : [];

    res.json({
      id: brewery.id,
      name: brewery.name,
      slug: brewery.slug ?? null,
      street: brewery.street ?? null,
      city: brewery.city ?? null,
      state: brewery.state ?? brewery.state_province ?? null,
      postal_code: brewery.postal_code ?? null,
      country: brewery.country ?? null,
      latitude: brewery.latitude != null ? Number(brewery.latitude) : null,
      longitude: brewery.longitude != null ? Number(brewery.longitude) : null,
      phone: brewery.phone ?? null,
      website_url: brewery.website_url ?? null,
      brewery_type: brewery.brewery_type ?? null,
      description: brewery.description ?? null,
      beers: beers.map((b) => ({
        name: b.name,
        style: b.style ?? null,
        abv: b.abv != null ? Number(b.abv) : null,
      })),
    });
  } catch (e) {
    console.error('Brewery detail error:', e);
    res.status(502).json({ error: 'Brewery fetch failed' });
  }
});

// ---------- Routes ----------

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'beerbook-api' });
});

// GET /api/ratings — public, paginated
// BUG FIX #3: Added validateSort middleware
app.get('/api/ratings', softAuthMiddleware, validateSort, async (req, res) => {
  const { limit, offset, sort, order } = parsePagination(req);
  const orderDir = order === 'asc' ? 'asc' : 'desc';
  const feed = String(req.query.feed || '').trim();
  const crewId = String(req.query.crew_id || '').trim();
  const requester = req.claims?.sub || null;

  if (feed) {
    if (!requester) return res.status(401).json({ error: 'Authentication required for feed filters' });
    const ratingsRaw = await rest('GET', `/ratings?limit=5000&order=${sort}.${orderDir}`);
    if (ratingsRaw.status >= 400) {
      return res.status(ratingsRaw.status).json(ratingsRaw.body || { error: 'Upstream error' });
    }
    let filtered = Array.isArray(ratingsRaw.body) ? ratingsRaw.body : [];
    if (feed === 'crew') {
      if (!crewId) return res.status(400).json({ error: 'crew_id is required for feed=crew' });
      const membersRes = await rest('GET', `/crew_members?crew_id=eq.${encodeURIComponent(crewId)}&select=user_id`);
      if (membersRes.status >= 400) return res.status(membersRes.status).json(membersRes.body || { error: 'Upstream error' });
      const memberIds = new Set((Array.isArray(membersRes.body) ? membersRes.body : []).map((m) => m.user_id));
      filtered = filtered.filter((r) => memberIds.has(r.user_id));
    } else if (feed === 'following') {
      const followsRes = await rest('GET', `/follows?follower_id=eq.${encodeURIComponent(requester)}&select=followed_id`);
      if (followsRes.status >= 400) return res.status(followsRes.status).json(followsRes.body || { error: 'Upstream error' });
      const followingIds = new Set((Array.isArray(followsRes.body) ? followsRes.body : []).map((f) => f.followed_id));
      filtered = filtered.filter((r) => followingIds.has(r.user_id));
    }
    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);
    const withCheers = await attachCheersDataToRatings(page, requester);
    const data = await attachRatingAchievementDataToRatings(withCheers);
    return res.json({
      data,
      pagination: { limit, offset, total },
    });
  }

  const { status, headers, body } = await rest('GET', `/ratings?limit=${limit}&offset=${offset}&order=${sort}.${orderDir}`, {
    headers: { 'Prefer': 'count=exact' },
  });
  const total = totalFromContentRange(headers['content-range']) ?? (Array.isArray(body) ? body.length : 0);
  if (status >= 400) {
    return res.status(status).json(body || { error: 'Upstream error' });
  }
  const withCheers = await attachCheersDataToRatings(Array.isArray(body) ? body : [], requester);
  const enriched = await attachRatingAchievementDataToRatings(withCheers);
  res.json({
    data: enriched,
    pagination: { limit, offset, total },
  });
});

// GET /api/ratings/user/:id — public, paginated
app.get('/api/ratings/user/:id', softAuthMiddleware, validateSort, async (req, res) => {
  const { limit, offset, sort, order } = parsePagination(req);
  const orderDir = order === 'asc' ? 'asc' : 'desc';
  const id = encodeURIComponent(req.params.id);
  const requester = req.claims?.sub || null;
  const { status, headers, body } = await rest('GET', `/ratings?user_id=eq.${id}&limit=${limit}&offset=${offset}&order=${sort}.${orderDir}`, {
    headers: { 'Prefer': 'count=exact' },
  });
  const total = totalFromContentRange(headers['content-range']) ?? (Array.isArray(body) ? body.length : 0);
  if (status >= 400) {
    return res.status(status).json(body || { error: 'Upstream error' });
  }
  const withCheers = await attachCheersDataToRatings(Array.isArray(body) ? body : [], requester);
  const enriched = await attachRatingAchievementDataToRatings(withCheers);
  res.json({
    data: enriched,
    pagination: { limit, offset, total },
  });
});

const RATING_DB_COLUMNS = new Set([
  'user_id',
  'user_name',
  'beer_name',
  'brewery',
  'style',
  'abv',
  'rating',
  'flavor_hoppy',
  'flavor_malty',
  'flavor_bitter',
  'flavor_sweet',
  'flavor_fruity',
  'notes',
  'yg_value',
  'latitude',
  'longitude',
  'location_name',
  'venue_id',
  'photo_url',
  'beer_id',
  'price_cents',
  'serve_type',
]);

function sanitizeRatingDbFields(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  Object.keys(input).forEach((key) => {
    if (RATING_DB_COLUMNS.has(key) && input[key] !== undefined) {
      out[key] = input[key];
    }
  });
  return out;
}

// POST /api/ratings — auth required
// Phase 2.1: optional yg_value, lat/lng, location_name, venue_id, photo_url
app.post('/api/ratings', authMiddleware, async (req, res) => {
  const { sub, preferred_username } = req.claims;
  const {
    is_new_beer: isNewBeerRaw,
    new_beer_multiplier: _reqNewBeerMultiplier,
    tabs_earned: _reqTabsEarned,
    tabs_breakdown: _reqTabsBreakdown,
    tabs_reason: _reqTabsReason,
    tier_multiplier: _reqTierMultiplier,
    seeder_multiplier: _reqSeederMultiplier,
    achievements_unlocked: _reqAchievementsUnlocked,
    weekly_count: _reqWeeklyCount,
    weekly_cap: _reqWeeklyCap,
    ...b
  } = req.body || {};
  const isNewBeer = isNewBeerRaw === true;
  const toMaybeTrimmedString = (value) => {
    if (value == null) return null;
    const s = String(value).trim();
    return s ? s : null;
  };
  const metersBetween = (latA, lngA, latB, lngB) => {
    const toRad = (deg) => deg * (Math.PI / 180);
    const dLat = toRad(latB - latA);
    const dLng = toRad(lngB - lngA);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(toRad(latA)) * Math.cos(toRad(latB))
      * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };
  const ratingRaw = b.rating;
  const rating = Number(ratingRaw);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be a number between 1 and 5' });
  }
  const ygValue = b.yg_value ?? b.ygValue ?? null;
  // Keep this range in sync with DB constraint `ratings_yg_value_check`.
  // Supabase migration: `supabase/migrations/20260306000000_update_ratings_yg_value_check.sql`.
  if (ygValue != null) {
    const yg = Number(ygValue);
    if (!Number.isFinite(yg) || yg < 0 || yg > 12 || !Number.isInteger(yg)) {
      return res.status(400).json({ error: 'yg_value must be an integer between 0 and 12' });
    }
  }
  const lat = b.latitude ?? b.lat;
  const lng = b.longitude ?? b.lng;
  const latNum = lat != null ? Number(lat) : null;
  const lngNum = lng != null ? Number(lng) : null;
  const locationName = toMaybeTrimmedString(b.location_name ?? b.locationName);
  const venueType = toMaybeTrimmedString(b.venue_type ?? b.venueType);
  let resolvedVenueId = b.venue_id ?? b.venueId ?? null;
  const priceCentsRaw = b.price_cents ?? b.priceCents ?? null;
  const serveTypeRaw = toMaybeTrimmedString(b.serve_type ?? b.serveType);
  const VALID_SERVE_TYPES = ['draft', 'can', 'bottle', 'crowler', 'growler', 'nitro'];
  if (serveTypeRaw && !VALID_SERVE_TYPES.includes(serveTypeRaw)) {
    return res.status(400).json({ error: 'Invalid serve_type. Must be one of: draft, can, bottle, crowler, growler, nitro' });
  }
  const incomingBeerName = toMaybeTrimmedString(b.beer_name || b.beerName);
  const incomingBrewery = toMaybeTrimmedString(b.brewery);
  const incomingStyle = toMaybeTrimmedString(b.style);
  const incomingAbv = b.abv != null && b.abv !== '' ? Number(b.abv) : null;
  const incomingBeerId = toMaybeTrimmedString(b.beer_id ?? b.beerId);
  if ((lat != null && lng == null) || (lat == null && lng != null)) {
    return res.status(400).json({ error: 'latitude and longitude must be provided together' });
  }
  if ((lat != null && lng != null) && (!Number.isFinite(latNum) || !Number.isFinite(lngNum))) {
    return res.status(400).json({ error: 'latitude and longitude must be valid numbers' });
  }
  if (priceCentsRaw != null) {
    const priceCents = Number(priceCentsRaw);
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
      return res.status(400).json({ error: 'price_cents must be a positive integer' });
    }
  }
  if (isNewBeer) {
    if (!incomingBeerName || incomingBeerName.length < 2) {
      return res.status(400).json({ error: 'beer_name is required for new beer flow' });
    }
    if (!incomingBrewery || incomingBrewery.length < 2) {
      return res.status(400).json({ error: 'brewery is required and must be at least 2 characters' });
    }
    if (!incomingStyle) {
      return res.status(400).json({ error: 'style is required for new beer flow' });
    }
    if (!Number.isFinite(incomingAbv) || incomingAbv < 0 || incomingAbv > 30) {
      return res.status(400).json({ error: 'abv must be a number between 0 and 30' });
    }
    try {
      const rawMatches = await findSimilarBeers(incomingBeerName, incomingBrewery, 5);
      const blocking = rawMatches.filter((m) => m.similarity > 0.85);
      if (blocking.length) {
        return res.status(409).json({
          error: 'Very similar beer already exists',
          matches: blocking.map((m) => ({
            id: m.id,
            name: m.name,
            brewery_name: m.brewery_name,
            style: m.style,
            abv: m.abv,
            similarity: Number(m.similarity.toFixed(2)),
          })),
        });
      }
    } catch (err) {
      console.error('Strict new beer validation failed:', err);
      return res.status(502).json({ error: 'New beer validation failed' });
    }
  }
  if (!resolvedVenueId && latNum != null && lngNum != null) {
    try {
      const nearbyRes = await rest('POST', '/rpc/venues_within_radius', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: latNum, lng: lngNum, radius_m: 100 }),
      });
      const nearby = Array.isArray(nearbyRes.body) ? nearbyRes.body : [];
      const nearest = nearby
        .filter((v) => v && v.id && Number.isFinite(Number(v.latitude)) && Number.isFinite(Number(v.longitude)))
        .map((v) => ({ ...v, distance_m: metersBetween(latNum, lngNum, Number(v.latitude), Number(v.longitude)) }))
        .sort((a, bDist) => a.distance_m - bDist.distance_m)[0];
      if (nearest && nearest.id) {
        resolvedVenueId = nearest.id;
      } else if (locationName) {
        const venueRes = await rest('POST', '/venues', {
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({
            name: locationName,
            latitude: latNum,
            longitude: lngNum,
            created_by: sub,
            venue_type: venueType || null,
          }),
        });
        if (venueRes.status < 400 && Array.isArray(venueRes.body) && venueRes.body[0]?.id) {
          resolvedVenueId = venueRes.body[0].id;
        }
      }
    } catch (err) {
      console.error('Venue upsert failed (non-blocking):', err?.message || err);
    }
  }
  const record = {
    user_id: sub,
    user_name: preferred_username || 'Anonymous',
    beer_name: incomingBeerName || '',
    brewery: incomingBrewery || '',
    style: incomingStyle || '',
    abv: incomingAbv,
    rating,
    flavor_hoppy: b.flavor_hoppy ?? b.flavors?.hoppy ?? 0,
    flavor_malty: b.flavor_malty ?? b.flavors?.malty ?? 0,
    flavor_bitter: b.flavor_bitter ?? b.flavors?.bitter ?? 0,
    flavor_sweet: b.flavor_sweet ?? b.flavors?.sweet ?? 0,
    flavor_fruity: b.flavor_fruity ?? b.flavors?.fruity ?? 0,
    notes: b.notes || '',
    yg_value: ygValue != null ? Number(ygValue) : null,
    latitude: latNum,
    longitude: lngNum,
    location_name: locationName,
    venue_id: resolvedVenueId,
    photo_url: b.photo_url ?? b.photoUrl ?? null,
    beer_id: incomingBeerId,
    price_cents: priceCentsRaw != null ? Number(priceCentsRaw) : null,
    serve_type: serveTypeRaw || null,
  };
  if (isNewBeer) {
    const createBeerRes = await rest('POST', '/beers', {
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: record.beer_name,
        brewery_name: record.brewery,
        style: record.style,
        abv: record.abv,
        source: 'user_submitted',
        submitted_by: sub,
        verified: false,
      }),
    });
    if (createBeerRes.status >= 400) {
      return res.status(createBeerRes.status >= 500 ? 502 : createBeerRes.status).json(createBeerRes.body || { error: 'Failed to create beer' });
    }
    const newBeer = Array.isArray(createBeerRes.body) ? createBeerRes.body[0] : createBeerRes.body;
    if (!newBeer?.id) {
      return res.status(502).json({ error: 'Created beer missing id' });
    }
    record.beer_id = newBeer.id;
  }

  if (!record.style && record.beer_id) {
    const beerInfo = await rest('GET', `/beers?id=eq.${encodeURIComponent(record.beer_id)}&select=name,brewery_name,style,abv&limit=1`);
    if (beerInfo.status < 400 && Array.isArray(beerInfo.body) && beerInfo.body[0]) {
      const existingBeer = beerInfo.body[0];
      if (!record.style && existingBeer.style) record.style = existingBeer.style;
      if (!record.brewery && existingBeer.brewery_name) record.brewery = existingBeer.brewery_name;
      if (record.abv == null && existingBeer.abv != null) record.abv = Number(existingBeer.abv);
      if (!record.beer_name && existingBeer.name) record.beer_name = existingBeer.name;
    }
  }
  if (!record.beer_name) {
    return res.status(400).json({ error: 'beer_name required when beer_id is missing or unresolved' });
  }
  if (!record.style) {
    return res.status(400).json({ error: 'style required when beer style is unknown' });
  }
  const ratingData = {
    ...record,
    is_new_beer: isNewBeer,
  };
  const { is_new_beer: _isNewBeer, ...ratingCandidateFields } = ratingData;
  const ratingFields = sanitizeRatingDbFields(ratingCandidateFields);

  let existing = null;
  const existingRes = await rest('POST', '/rpc/find_existing_user_rating', {
    body: JSON.stringify({
      p_user_id: sub,
      p_beer_id: record.beer_id || null,
      p_beer_name: record.beer_name,
      p_venue_id: record.venue_id || null,
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (existingRes.status < 400 && Array.isArray(existingRes.body) && existingRes.body.length > 0) {
    existing = existingRes.body[0];
  }

  if (existing && existing.id) {
    const {
      user_id: _ignoreUserId,
      user_name: _ignoreUserName,
      ...mutableRatingFields
    } = ratingFields;
    const updatePayload = {
      ...mutableRatingFields,
    };
    const updateRes = await rest('PATCH', `/ratings?id=eq.${encodeURIComponent(existing.id)}`, {
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(updatePayload),
    });
    if (updateRes.status >= 400) {
      return res.status(updateRes.status).json(updateRes.body || { error: 'Update failed' });
    }
    const updatedRow = Array.isArray(updateRes.body) ? updateRes.body[0] : updateRes.body;
    return res.json({
      data: updatedRow || null,
      updated: true,
      previous_rating: existing.rating ?? null,
      message: `Rating updated (previously ${existing.rating} ★)`,
    });
  }

  const insertRes = await rest('POST', '/ratings', {
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(ratingFields),
  });
  if (insertRes.status >= 400) {
    return res.status(insertRes.status).json(insertRes.body || { error: 'Insert failed' });
  }
  const row = Array.isArray(insertRes.body) ? insertRes.body[0] : insertRes.body;
  const ratingId = row?.id || null;
  const ratingRow = row || ratingFields;

  // Ensure profile exists before process-event (trigger is update-only)
  await ensureProfileExists(rest, sub, preferred_username, req.claims.email);
  const profile = await ensureUserTabsProfile(rest, sub, {
    displayName: preferred_username,
    email: req.claims.email,
    isAdmin: isAdmin(sub),
  });
  const tierInfo = await getTierMultiplier(rest, profile.current_tier);
  const tierMultiplier = Number(tierInfo.multiplier) || 1.0;
  const seederMultiplier = profile.is_seeder ? 1.5 : 1.0;
  const newBeerMultiplier = isNewBeer ? 1.5 : 1.0;
  const components = calculateRatingComponents(ratingRow);
  let tabsEarned = 0;
  let breakdown = {};
  let achievementsUnlocked = [];
  let weeklyCount = Number(profile.ratings_this_week) || 0;
  let currentStreakWeeks = Number(profile.current_streak_weeks) || 0;
  let longestStreakWeeks = Number(profile.longest_streak_weeks) || 0;
  const weeklyCap = 10;

  try {
    const eventId = crypto.randomUUID();
    const perComponent = components.map((c) => ({
      source: c.source,
      base: c.base,
      amount: Math.round(c.base * newBeerMultiplier * tierMultiplier * seederMultiplier),
    }));
    const total = perComponent.reduce((s, p) => s + p.amount, 0);
    breakdown = Object.fromEntries(perComponent.map((p) => [p.source, p.amount]));
    const ratingAwardRes = await invokeProcessEvent(req.headers.authorization, 'rating_award', eventId, {
      amount: total,
      breakdown,
      context: {
        rating_id: ratingId,
        beer_id: ratingRow.beer_id ?? null,
        venue_id: ratingRow.venue_id ?? null,
        tier_multiplier: tierMultiplier,
        seeder_multiplier: seederMultiplier,
        is_new_beer: isNewBeer,
      },
    });
    tabsEarned = ratingAwardRes.tabs_delta;
    if (ratingAwardRes.current_streak_weeks != null) {
      currentStreakWeeks = Number(ratingAwardRes.current_streak_weeks) || 0;
    }
    if (ratingAwardRes.longest_streak_weeks != null) {
      longestStreakWeeks = Number(ratingAwardRes.longest_streak_weeks) || 0;
    }

    const achRes = await invokeProcessEvent(req.headers.authorization, 'rating_submitted', null, {
      rating_id: ratingId,
      beer_id: ratingRow.beer_id ?? null,
      venue_id: ratingRow.venue_id ?? null,
      ...ratingRow,
    });
    achievementsUnlocked = achRes.unlocked || [];

    const weekStart = getCurrentWeekStartUtcIso();
    const weeklyCountRes = await rest(
      'GET',
      `/tabs_ledger?user_id=eq.${encodeURIComponent(sub)}&event_type=eq.rating_award&created_at=gte.${encodeURIComponent(weekStart)}&select=id`,
      { headers: { Prefer: 'count=exact' } }
    );
    if (weeklyCountRes.status < 400) {
      weeklyCount = totalFromContentRange(weeklyCountRes.headers['content-range']) ?? weeklyCount;
    }
  } catch (err) {
    if (err.status >= 400) {
      return res.status(err.status >= 500 ? 502 : err.status).json(err.body || { error: err.message });
    }
    throw err;
  }

  res.status(201).json({
    data: row || record,
    updated: false,
    tabs_earned: tabsEarned,
    tabs_breakdown: breakdown,
    tabs_reason: tabsEarned > 0 ? 'awarded' : 'weekly_cap',
    tier_multiplier: tierMultiplier,
    seeder_multiplier: seederMultiplier,
    new_beer_multiplier: newBeerMultiplier,
    is_new_beer: isNewBeer === true,
    achievements_unlocked: achievementsUnlocked,
    current_streak_weeks: currentStreakWeeks,
    longest_streak_weeks: longestStreakWeeks,
    weekly_count: weeklyCount,
    weekly_cap: weeklyCap,
  });
});

// DELETE /api/ratings/:id — auth required, ownership check
app.delete('/api/ratings/:id', authMiddleware, async (req, res) => {
  const id = encodeURIComponent(req.params.id);
  const { sub } = req.claims;
  const { status: getStatus, body: row } = await rest('GET', `/ratings?id=eq.${id}&user_id=eq.${encodeURIComponent(sub)}&limit=1`);
  if (getStatus >= 400 || !Array.isArray(row) || row.length === 0) {
    return res.status(404).json({ error: 'Rating not found or not owned by you' });
  }
  const { status } = await rest('DELETE', `/ratings?id=eq.${id}`);
  if (status >= 400) {
    return res.status(502).json({ error: 'Delete failed' });
  }
  res.status(204).end();
});

// GET /api/ratings/:id/comments — public, paginated, newest first
app.get('/api/ratings/:id/comments', async (req, res) => {
  const id = encodeURIComponent(req.params.id);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const path = `/rating_comments?rating_id=eq.${id}&order=created_at.desc&limit=${limit}&offset=${offset}`;
  const { status, body } = await rest('GET', path);
  if (status >= 400) {
    return res.status(status >= 500 ? 502 : status).json(body || { error: 'Failed to fetch comments' });
  }
  res.json({ data: Array.isArray(body) ? body : [] });
});

// POST /api/ratings/:id/comments — auth required, creates comment and increments comment_count
app.post('/api/ratings/:id/comments', authMiddleware, async (req, res) => {
  const id = encodeURIComponent(req.params.id);
  const { body: bodyText } = req.body || {};
  const userId = req.claims.sub;
  const userName = req.claims.preferred_username || 'Unknown';

  if (!bodyText || String(bodyText).trim().length === 0) {
    return res.status(400).json({ error: 'Comment body is required' });
  }
  const trimmed = String(bodyText).trim();
  if (trimmed.length > 500) {
    return res.status(400).json({ error: 'Comment must be 500 characters or less' });
  }

  const { status: ratingStatus, body: ratingRow } = await rest('GET', `/ratings?id=eq.${id}&select=id&limit=1`);
  if (ratingStatus >= 400 || !Array.isArray(ratingRow) || ratingRow.length === 0) {
    return res.status(404).json({ error: 'Rating not found' });
  }

  const insertPayload = {
    rating_id: id,
    user_id: userId,
    user_name: userName,
    body: trimmed,
  };
  const { status: insertStatus, body: comment } = await rest('POST', '/rating_comments', {
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(insertPayload),
  });
  if (insertStatus >= 400) {
    return res.status(insertStatus >= 500 ? 502 : insertStatus).json(comment || { error: 'Failed to create comment' });
  }

  // Non-blocking counter update. If this RPC fails, comment rows remain source-of-truth.
  // Reconcile periodically (manual or scheduled):
  // UPDATE ratings SET comment_count = (
  //   SELECT count(*) FROM rating_comments WHERE rating_id = ratings.id
  // ) WHERE id IN (
  //   SELECT r.id FROM ratings r
  //   LEFT JOIN (SELECT rating_id, count(*) AS actual FROM rating_comments GROUP BY rating_id) c
  //   ON r.id = c.rating_id
  //   WHERE r.comment_count != COALESCE(c.actual, 0)
  // );
  const { status: incrementStatus, body: incrementBody } = await rest('POST', '/rpc/increment_comment_count', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating_id_input: id }),
  });
  if (incrementStatus >= 400) {
    const rpcMessage = (incrementBody && (incrementBody.message || incrementBody.error || incrementBody.hint))
      || `status ${incrementStatus}`;
    console.error(`[WARN] comment_count RPC failed for rating ${id}:`, rpcMessage);
  }

  const row = Array.isArray(comment) ? comment[0] : comment;
  res.status(201).json({ data: row || insertPayload });
});

// DELETE /api/ratings/:id/comments/:commentId — auth required, author only, decrements comment_count
app.delete('/api/ratings/:id/comments/:commentId', authMiddleware, async (req, res) => {
  const id = encodeURIComponent(req.params.id);
  const commentId = encodeURIComponent(req.params.commentId);
  const userId = req.claims.sub;

  const { status: fetchStatus, body: commentRows } = await rest('GET', `/rating_comments?id=eq.${commentId}&rating_id=eq.${id}&limit=1`);
  if (fetchStatus >= 400 || !Array.isArray(commentRows) || commentRows.length === 0) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  const comment = commentRows[0];
  if (comment.user_id !== userId) {
    return res.status(403).json({ error: 'You can only delete your own comments' });
  }

  const { status: deleteStatus } = await rest('DELETE', `/rating_comments?id=eq.${commentId}`);
  if (deleteStatus >= 400) {
    return res.status(502).json({ error: 'Failed to delete comment' });
  }

  // Non-blocking counter update. See reconciliation query note above.
  const { status: decrementStatus, body: decrementBody } = await rest('POST', '/rpc/decrement_comment_count', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating_id_input: id }),
  });
  if (decrementStatus >= 400) {
    const rpcMessage = (decrementBody && (decrementBody.message || decrementBody.error || decrementBody.hint))
      || `status ${decrementStatus}`;
    console.error(`[WARN] comment_count RPC failed for rating ${id}:`, rpcMessage);
  }

  res.status(200).json({ success: true });
});

// GET /api/profile and /api/profile/me — auth required, get or create
// BUG FIX #5: Added Prefer: return=representation on profile creation
async function handleProfileRequest(req, res) {
  const { sub, preferred_username, email } = req.claims;
  const { status: getStatus, body: rows } = await rest('GET', `/profiles?id=eq.${encodeURIComponent(sub)}&limit=1`);
  if (getStatus >= 400) {
    return res.status(502).json({ error: 'Upstream error' });
  }
  if (Array.isArray(rows) && rows.length > 0) {
    const enriched = await attachEquippedCosmeticsToProfile(rows[0]);
    return res.json({
      ...enriched,
      is_admin: isAdmin(sub),
    });
  }
  const newProfile = {
    id: sub,
    display_name: preferred_username || 'Beer Lover',
    email: email || null,
  };
  const { status: postStatus, body: created } = await rest('POST', '/profiles', {
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(newProfile),
  });
  if (postStatus >= 400) {
    return res.status(502).json(created || { error: 'Create profile failed' });
  }
  const profile = Array.isArray(created) ? created[0] : created;
  const enriched = await attachEquippedCosmeticsToProfile(profile || newProfile);
  res.status(201).json({
    ...(enriched || newProfile),
    is_admin: isAdmin(sub),
  });
}
app.get('/api/profile', authMiddleware, handleProfileRequest);
app.get('/api/profile/me', authMiddleware, handleProfileRequest);

// PATCH /api/profile — auth required, partial profile update
app.patch('/api/profile', authMiddleware, async (req, res) => {
  const { sub, preferred_username, email } = req.claims;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const updates = {};
  let providedFields = 0;

  if (Object.prototype.hasOwnProperty.call(body, 'display_name')) {
    providedFields += 1;
    if (typeof body.display_name !== 'string') {
      return res.status(400).json({ error: 'display_name must be a string between 1 and 30 characters' });
    }
    const trimmed = body.display_name.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 30) {
      return res.status(400).json({ error: 'display_name must be a string between 1 and 30 characters' });
    }
    updates.display_name = trimmed;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'avatar_url')) {
    providedFields += 1;
    if (typeof body.avatar_url !== 'string') {
      return res.status(400).json({ error: 'avatar_url must be a valid URL' });
    }
    const trimmed = body.avatar_url.trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'avatar_url must be a valid URL' });
    }
    try {
      // URL constructor validates absolute URLs and normalization.
      new URL(trimmed);
    } catch {
      return res.status(400).json({ error: 'avatar_url must be a valid URL' });
    }
    updates.avatar_url = trimmed;
  }

  if (providedFields === 0) {
    return res.status(400).json({ error: 'At least one of display_name or avatar_url is required' });
  }

  await ensureProfileExists(rest, sub, preferred_username, email);

  const { status: patchStatus, body: patchedRows } = await rest('PATCH', `/profiles?id=eq.${encodeURIComponent(sub)}`, {
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(updates),
  });
  if (patchStatus >= 400) {
    return res.status(502).json(patchedRows || { error: 'Update profile failed' });
  }

  const updated = Array.isArray(patchedRows) ? patchedRows[0] : patchedRows;
  if (!updated) {
    return res.status(502).json({ error: 'Update profile failed' });
  }
  const enriched = await attachEquippedCosmeticsToProfile(updated);
  return res.json({
    ...enriched,
    is_admin: isAdmin(sub),
  });
});

// GET /api/stats/me — auth required, enhanced user stats (flavors, style_distribution, etc.)
app.get('/api/stats/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.claims.sub;
    const { status, body } = await rest('POST', '/rpc/user_enhanced_stats', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: userId }),
    });
    if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
    res.json(body != null ? body : {});
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/stats/:userId — public, enhanced stats for specified user
app.get('/api/stats/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { status, body } = await rest('POST', '/rpc/user_enhanced_stats', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: userId }),
    });
    if (status >= 400) return res.status(status).json(body || { error: 'Upstream error' });
    res.json(body != null ? body : {});
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/stats — public, paginated (beer_averages + summary counts)
// BUG FIX #4: Use count=exact on beer_averages to get accurate totalBeers
app.get('/api/stats', softAuthMiddleware, async (req, res) => {
  const crewId = String(req.query.crew_id || '').trim();
  const { limit, offset } = parsePagination(req);
  if (crewId) {
    const requester = req.claims?.sub || null;
    if (!requester) return res.status(401).json({ error: 'Authentication required for crew stats' });
    const membersRes = await rest('GET', `/crew_members?crew_id=eq.${encodeURIComponent(crewId)}&select=user_id`);
    if (membersRes.status >= 400) return res.status(membersRes.status).json(membersRes.body || { error: 'Upstream error' });
    const memberIds = new Set((Array.isArray(membersRes.body) ? membersRes.body : []).map((m) => m.user_id));
    const ratingsRes = await rest('GET', '/ratings?limit=5000&order=created_at.desc');
    if (ratingsRes.status >= 400) return res.status(ratingsRes.status).json(ratingsRes.body || { error: 'Upstream error' });
    const ratings = (Array.isArray(ratingsRes.body) ? ratingsRes.body : []).filter((r) => memberIds.has(r.user_id));

    const byBeer = {};
    ratings.forEach((r) => {
      const key = `${r.beer_name || ''}|${r.brewery || ''}|${r.style || ''}`;
      if (!byBeer[key]) byBeer[key] = { beer_name: r.beer_name || '', brewery: r.brewery || '', style: r.style || '', review_count: 0, rating_sum: 0, last_reviewed: null };
      byBeer[key].review_count += 1;
      byBeer[key].rating_sum += Number(r.rating) || 0;
      const t = new Date(r.created_at || 0).getTime();
      const prev = byBeer[key].last_reviewed ? new Date(byBeer[key].last_reviewed).getTime() : 0;
      if (t >= prev) byBeer[key].last_reviewed = r.created_at;
    });
    const allBeers = Object.values(byBeer).map((b) => ({
      beer_name: b.beer_name,
      brewery: b.brewery,
      style: b.style,
      review_count: b.review_count,
      avg_rating: Math.round((b.rating_sum / Math.max(1, b.review_count)) * 100) / 100,
      last_reviewed: b.last_reviewed,
    })).sort((a, b) => b.avg_rating - a.avg_rating);
    const data = allBeers.slice(offset, offset + limit);
    const totalBeers = allBeers.length;
    const totalReviews = ratings.length;
    const totalUsers = new Set(ratings.map((r) => r.user_id)).size;
    return res.json({
      data,
      pagination: { limit, offset, total: totalBeers },
      summary: {
        totalBeers,
        totalReviews,
        totalUsers,
      },
    });
  }

  const { status: viewStatus, headers: viewHeaders, body: averages } = await rest('GET', `/beer_averages?limit=${limit}&offset=${offset}`, {
    headers: { 'Prefer': 'count=exact' },
  });
  if (viewStatus >= 400) {
    return res.status(viewStatus).json(averages || { error: 'Upstream error' });
  }
  const list = Array.isArray(averages) ? averages : [];
  const totalBeers = totalFromContentRange(viewHeaders['content-range']) ?? list.length;

  const countRes = await rest('GET', '/ratings?limit=0', { headers: { 'Prefer': 'count=exact' } });
  const totalReviews = totalFromContentRange(countRes.headers['content-range']) ?? 0;

  const ratingsRes = await rest('GET', '/ratings?limit=5000&select=user_id');
  const allRatings = Array.isArray(ratingsRes.body) ? ratingsRes.body : [];
  const totalUsers = new Set(allRatings.map((r) => r.user_id)).size;

  res.json({
    data: list,
    pagination: { limit, offset, total: totalBeers },
    summary: {
      totalBeers,
      totalReviews,
      totalUsers,
    },
  });
});

// Multer error handling (for upload routes)
const multer = require('multer');
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }
  if (err && err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ---------- Startup ----------
if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}
app.listen(PORT, () => {
  console.log(`beerbook-api listening on port ${PORT}`);
});
