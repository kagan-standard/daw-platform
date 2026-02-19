/**
 * BeerBook API — BFF: Keycloak JWT validation, pagination, rate limit, CORS.
 * Proxies to PostgREST (internal) with SUPABASE_SERVICE_ROLE_KEY.
 */
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const app = express();
app.set('trust proxy', 1);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'data', 'uploads');
const PORT = Number(process.env.PORT) || 3001;
const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://beerbook.drinksafterwork.net';
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || 'https://auth.drinksafterwork.net/realms/daw';
const KEYCLOAK_JWKS_URI = process.env.KEYCLOAK_JWKS_URI || 'https://auth.drinksafterwork.net/realms/daw/protocol/openid-connect/certs';
const CLOCK_SKEW = Number(process.env.TOKEN_CLOCK_SKEW_SECONDS) || 30;
const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX) || 100;

const SORT_WHITELIST = ['created_at', 'rating', 'beer_name'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// ---------- Helpers: call PostgREST ----------
// BUG FIX #2: Don't spread opts into fetch — it overrides the constructed headers.
// Instead, only pass method, headers, and body explicitly.
async function rest(method, path, opts = {}) {
  const url = `${REST_URL}${path}`;
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

// ---------- CORS: only allow CORS_ORIGIN ----------
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const allowed = (origin === CORS_ORIGIN);
  if (req.method === 'OPTIONS') {
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }
    return res.status(403).end();
  }
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  next();
}

app.use(corsMiddleware);
app.use(express.json());
// Phase 2.1: serve uploaded images (same origin as API)
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- Rate limiting (all /api routes) ----------
const limiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfter = Math.ceil(RATE_WINDOW_MS / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Too Many Requests', retryAfter });
  },
});
app.use('/api', limiter);

// ---------- Route helpers (shared with route modules) ----------
const routeHelpers = {
  rest,
  totalFromContentRange,
  parsePagination: () => {}, // set after parsePagination is defined
  authMiddleware: () => {}, // set after authMiddleware is defined
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
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = auth.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: KEYCLOAK_ISSUER,
      clockTolerance: CLOCK_SKEW,
    });
    const aud = payload.aud;
    const azp = payload.azp;
    const audOk = aud === 'beerbook' || (Array.isArray(aud) && aud.includes('beerbook'));
    if (!audOk) {
      return res.status(403).json({ error: 'Token audience not allowed' });
    }
    if (azp !== 'beerbook') {
      return res.status(403).json({ error: 'Token azp not allowed' });
    }
    req.claims = {
      sub: payload.sub,
      preferred_username: payload.preferred_username || payload.sub,
      email: payload.email || '',
    };
    next();
  } catch (e) {
    if (e.code === 'ERR_JWT_EXPIRED') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (e.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
      return res.status(401).json({ error: 'Invalid token claims' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
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

const activityRoutes = require('./routes/activity')({ ...routeHelpers });
const beersRoutes = require('./routes/beers')({ ...routeHelpers });
const exchangeRoutes = require('./routes/exchange')({ ...routeHelpers });
const venuesRoutes = require('./routes/venues')({ ...routeHelpers });
const dealsRoutes = require('./routes/deals')({ ...routeHelpers });
const mapRoutes = require('./routes/map')({ ...routeHelpers });
const leaderboardRoutes = require('./routes/leaderboard')({ ...routeHelpers });
const uploadRoutes = require('./routes/upload')({ ...routeHelpers });
const highlightsRoutes = require('./routes/highlights')({ ...routeHelpers });

app.use('/api', activityRoutes);
app.use('/api/beers', beersRoutes);
app.use('/api/exchange', exchangeRoutes);
app.use('/api/venues', venuesRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/highlights', highlightsRoutes);

// ---------- Phase 3.2: Catalog (no auth — public catalog) ----------
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

// GET /api/catalog/beer/:id — single catalog beer (for detail view)
app.get('/api/catalog/beer/:id', async (req, res) => {
  const id = encodeURIComponent(req.params.id);
  try {
    const { status, body } = await rest('GET', `/beers?id=eq.${id}&select=id,name,brewery_name,style,abv,description,review_overall,review_count&limit=1`);
    if (status >= 400) {
      return res.status(status >= 500 ? 502 : status).json(body || { error: 'Upstream error' });
    }
    const row = Array.isArray(body) && body[0] ? body[0] : null;
    if (!row) return res.status(404).json({ error: 'Beer not found' });
    res.json({
      id: row.id,
      name: row.name,
      brewery_name: row.brewery_name ?? null,
      style: row.style ?? null,
      abv: row.abv != null ? Number(row.abv) : null,
      description: row.description ?? null,
      review_overall: row.review_overall != null ? Number(row.review_overall) : null,
      review_count: row.review_count != null ? Number(row.review_count) : null,
    });
  } catch (e) {
    console.error('Catalog beer error:', e);
    res.status(502).json({ error: 'Catalog fetch failed' });
  }
});

// ---------- Routes ----------

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'beerbook-api' });
});

// GET /api/ratings — public, paginated
// BUG FIX #3: Added validateSort middleware
app.get('/api/ratings', validateSort, async (req, res) => {
  const { limit, offset, sort, order } = parsePagination(req);
  const orderDir = order === 'asc' ? 'asc' : 'desc';
  const { status, headers, body } = await rest('GET', `/ratings?limit=${limit}&offset=${offset}&order=${sort}.${orderDir}`, {
    headers: { 'Prefer': 'count=exact' },
  });
  const total = totalFromContentRange(headers['content-range']) ?? (Array.isArray(body) ? body.length : 0);
  if (status >= 400) {
    return res.status(status).json(body || { error: 'Upstream error' });
  }
  res.json({
    data: Array.isArray(body) ? body : [],
    pagination: { limit, offset, total },
  });
});

// GET /api/ratings/user/:id — public, paginated
app.get('/api/ratings/user/:id', validateSort, async (req, res) => {
  const { limit, offset, sort, order } = parsePagination(req);
  const orderDir = order === 'asc' ? 'asc' : 'desc';
  const id = encodeURIComponent(req.params.id);
  const { status, headers, body } = await rest('GET', `/ratings?user_id=eq.${id}&limit=${limit}&offset=${offset}&order=${sort}.${orderDir}`, {
    headers: { 'Prefer': 'count=exact' },
  });
  const total = totalFromContentRange(headers['content-range']) ?? (Array.isArray(body) ? body.length : 0);
  if (status >= 400) {
    return res.status(status).json(body || { error: 'Upstream error' });
  }
  res.json({
    data: Array.isArray(body) ? body : [],
    pagination: { limit, offset, total },
  });
});

// POST /api/ratings — auth required
// Phase 2.1: optional yg_value, lat/lng, location_name, venue_id, photo_url
app.post('/api/ratings', authMiddleware, async (req, res) => {
  const { sub, preferred_username } = req.claims;
  const b = req.body || {};
  const ygValue = b.yg_value ?? b.ygValue ?? null;
  if (ygValue != null) {
    const yg = Number(ygValue);
    if (!Number.isFinite(yg) || yg < 0.1 || yg > 10.0) {
      return res.status(400).json({ error: 'yg_value must be between 0.1 and 10.0' });
    }
  }
  const lat = b.latitude ?? b.lat;
  const lng = b.longitude ?? b.lng;
  if ((lat != null && lng == null) || (lat == null && lng != null)) {
    return res.status(400).json({ error: 'latitude and longitude must be provided together' });
  }
  const record = {
    user_id: sub,
    user_name: preferred_username || 'Anonymous',
    beer_name: b.beer_name || b.beerName,
    brewery: b.brewery || '',
    style: b.style || '',
    abv: b.abv ?? null,
    rating: b.rating ?? 0,
    flavor_hoppy: b.flavor_hoppy ?? b.flavors?.hoppy ?? 0,
    flavor_malty: b.flavor_malty ?? b.flavors?.malty ?? 0,
    flavor_bitter: b.flavor_bitter ?? b.flavors?.bitter ?? 0,
    flavor_sweet: b.flavor_sweet ?? b.flavors?.sweet ?? 0,
    flavor_fruity: b.flavor_fruity ?? b.flavors?.fruity ?? 0,
    notes: b.notes || '',
    yg_value: ygValue != null ? Number(ygValue) : null,
    latitude: lat != null ? Number(lat) : null,
    longitude: lng != null ? Number(lng) : null,
    location_name: b.location_name ?? b.locationName ?? null,
    venue_id: b.venue_id ?? b.venueId ?? null,
    photo_url: b.photo_url ?? b.photoUrl ?? null,
    beer_id: b.beer_id ?? b.beerId ?? null,
  };
  if (!record.beer_name || !record.style || !record.rating) {
    return res.status(400).json({ error: 'beer_name, style, and rating required' });
  }
  const { status, body } = await rest('POST', '/ratings', {
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(record),
  });
  if (status >= 400) {
    return res.status(status).json(body || { error: 'Insert failed' });
  }
  const row = Array.isArray(body) ? body[0] : body;
  res.status(201).json(row || record);
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

// GET /api/profile — auth required, get or create
// BUG FIX #5: Added Prefer: return=representation on profile creation
app.get('/api/profile', authMiddleware, async (req, res) => {
  const { sub, preferred_username, email } = req.claims;
  const { status: getStatus, body: rows } = await rest('GET', `/profiles?id=eq.${encodeURIComponent(sub)}&limit=1`);
  if (getStatus >= 400) {
    return res.status(502).json({ error: 'Upstream error' });
  }
  if (Array.isArray(rows) && rows.length > 0) {
    return res.json(rows[0]);
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
  res.status(201).json(profile || newProfile);
});

// GET /api/stats — public, paginated (beer_averages + summary counts)
// BUG FIX #4: Use count=exact on beer_averages to get accurate totalBeers
app.get('/api/stats', async (req, res) => {
  const { limit, offset } = parsePagination(req);
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

// ---------- Startup ----------
if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}
app.listen(PORT, () => {
  console.log(`beerbook-api listening on port ${PORT}`);
});
