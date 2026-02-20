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
const CATALOG_SORT_WHITELIST = ['name', 'abv', 'review_overall', 'review_count'];

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
      realm_access: payload.realm_access || { roles: [] },
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
    const audOk = aud === 'beerbook' || (Array.isArray(aud) && aud.includes('beerbook'));
    if (!audOk || azp !== 'beerbook') return next();
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

function adminMiddleware(req, res, next) {
  if (!req.claims) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const roles = req.claims.realm_access?.roles || [];
  if (!roles.includes('beerbook_admin')) {
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

// ---------- Phase 3.2: Catalog (no auth — public catalog) ----------
function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapCatalogBeer(row) {
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
    reviews: {
      aroma: toNumberOrNull(row.review_aroma),
      appearance: toNumberOrNull(row.review_appearance),
      palate: toNumberOrNull(row.review_palate),
      taste: toNumberOrNull(row.review_taste),
      overall: toNumberOrNull(row.review_overall),
      count: toNumberOrNull(row.review_count),
    },
    // Backward-compat fields still used by existing frontend code paths.
    review_overall: toNumberOrNull(row.review_overall),
    review_count: toNumberOrNull(row.review_count),
  };
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

// ---------- Phase 3.9: Brewery map (no auth — public) ----------
// GET /api/breweries/map?bounds=sw_lat,sw_lng,ne_lat,ne_lng — breweries in viewport, max 500
app.get('/api/breweries/map', async (req, res) => {
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
});

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
    if (!Number.isFinite(yg) || yg < 0 || yg > 12 || !Number.isInteger(yg)) {
      return res.status(400).json({ error: 'yg_value must be an integer between 0 and 12' });
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
    const updatePayload = {
      rating: record.rating,
      beer_name: record.beer_name,
      brewery: record.brewery,
      style: record.style,
      abv: record.abv,
      beer_id: record.beer_id,
      flavor_hoppy: record.flavor_hoppy,
      flavor_malty: record.flavor_malty,
      flavor_bitter: record.flavor_bitter,
      flavor_sweet: record.flavor_sweet,
      flavor_fruity: record.flavor_fruity,
      notes: record.notes,
      yg_value: record.yg_value,
      latitude: record.latitude,
      longitude: record.longitude,
      location_name: record.location_name,
      venue_id: record.venue_id,
      photo_url: record.photo_url,
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
    body: JSON.stringify(record),
  });
  if (insertRes.status >= 400) {
    return res.status(insertRes.status).json(insertRes.body || { error: 'Insert failed' });
  }
  const row = Array.isArray(insertRes.body) ? insertRes.body[0] : insertRes.body;
  res.status(201).json({ data: row || record, updated: false });
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
