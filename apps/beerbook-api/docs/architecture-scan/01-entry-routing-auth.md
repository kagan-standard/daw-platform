# Phase 1 — Entry, Routing, and Auth

**Scope**: server.js structure (middleware order, route mounting, env), auth flow (Keycloak, guest ratings, admin).  
**Source**: [apps/beerbook-api/server.js](../../server.js).

---

## 1. Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js (≥20) |
| **HTTP** | Express 4.x |
| **Auth (JWT)** | jose (JWKS, `jwtVerify`) |
| **Rate limiting** | express-rate-limit |
| **Uploads** | multer (via route modules) |
| **Backend** | PostgREST only (no Supabase client SDK); BFF calls `SUPABASE_REST_URL` with `SUPABASE_SERVICE_ROLE_KEY` |

The API is a BFF: it validates Keycloak JWTs, applies pagination/validation, and proxies to PostgREST with the service role key.

---

## 2. Middleware Order

Order of middleware in `server.js`:

1. **`trust proxy`** — `app.set('trust proxy', 1)` (for rate limiter behind proxy).
2. **CORS** — `corsMiddleware`: allowlist of origins, OPTIONS handled; credentials allowed; `Vary: Origin`.
3. **Request ID** — `requestIdMiddleware`: sets `req.requestId` from `X-Request-Id` or new UUID; echoes in `x-request-id` response header.
4. **Body parsing** — `express.json()`.
5. **Static** — `express.static('public')` at root (e.g. `/images/...`).
6. **Uploads** — `/uploads` mount: security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: private, max-age=86400`), MIME validation; non-image extensions get `Content-Disposition: attachment`; then `express.static(UPLOAD_DIR)`.
7. **Rate limit** — `limiter` applied only to `/api` (window/max from env; 429 with `error_code: RATE_LIMITED`, `retryAfter`, `request_id`).
8. **Route modules** — Mounted under `/api` (and `/internal`); see Route layout below.
9. **Auth routes** — Inline in server: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh` (each with its own rate limit where applicable).
10. **Catalog, breweries, ratings, profile, stats, review share, etc.** — Inline routes in server.js (see Route layout).
11. **Error handlers** — Multer error handler (413/400), then generic `(err, req, res, next)`.

No global auth middleware: auth is applied per-route or per-router (e.g. `authMiddleware`, `softAuthMiddleware`, `actorMiddleware`, `adminMiddleware`).

---

## 3. Route Layout

### 3.1 Mounted route modules (under `/api`)

All receive shared `routeHelpers` (e.g. `rest`, `totalFromContentRange`, `parsePagination`, `authMiddleware`, `softAuthMiddleware`, `adminMiddleware`). Mount order is intentional so more specific paths win (e.g. `/api/ratings/:id/cheers` before generic ratings).

| Mount path | Module | Auth pattern (in module) |
|------------|--------|---------------------------|
| `/api` | activity | (per-route) |
| `/api/beers` | beers | (per-route) |
| `/api/exchange` | exchange | (per-route) |
| `/api/venues` | venues | (per-route) |
| `/api/deals` | deals | (per-route) |
| `/api/map` | map | (per-route) |
| `/api/leaderboard` | leaderboard | (per-route) |
| `/api/upload` | upload | (per-route) |
| `/api/highlights` | highlights | (per-route) |
| `/api/admin` | admin | **Router-level**: `authMiddleware` then `adminMiddleware` on all admin routes |
| `/api` | tracking | (per-route) |
| `/api` | tabs | (per-route) |
| `/api` | follows | (per-route) |
| `/api` | crews | (per-route) |

### 3.2 Internal routes

- **Prefix**: `/internal`.
- **Condition**: Mounted only if `INTERNAL_PROCESS_EVENT_SECRET` is set.
- **Auth**: Uses shared secret (Bearer) for process-event invocation from Supabase or in-process.
- **Rate limit**: Stricter than `/api` (window same, max = floor(RATE_MAX/4)).
- If secret not set: `/internal` returns 503 with message that internal routes are disabled.

### 3.3 Inline routes in server.js (summary)

- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`.
- **Catalog**: `GET /api/catalog/search`, `GET /api/catalog/browse`, `GET /api/catalog/styles`, `GET /api/catalog/validate-new`, `GET /api/catalog/beer/:id`.
- **Breweries**: `GET /api/breweries/search`, `GET /api/breweries/map`, `GET /api/breweries/:id` (and `GET /api/map/breweries` alias).
- **Health**: `GET /api/health`.
- **Ratings**: `GET /api/ratings` (softAuth + validateSort), `GET /api/ratings/user/:id` (softAuth + validateSort), `POST /api/ratings` (softAuth + actorMiddleware), `DELETE /api/ratings/:id`, `PATCH /api/ratings/:id` (softAuth + actorMiddleware), comments sub-resources.
- **Guest ratings**: `POST /api/guest-ratings/claim` (authMiddleware).
- **Head-to-head**: `POST /api/head-to-head/:id/complete`, `POST /api/head-to-head/:id/skip` (authMiddleware).
- **Profile**: `GET /api/profile`, `GET /api/profile/me`, `PATCH /api/profile` (authMiddleware).
- **Stats**: `GET /api/stats/me` (authMiddleware), `GET /api/stats/:userId` (public), `GET /api/stats` (softAuth).
- **Review share**: `GET /review/:ratingId` (reviewLinkLimiter; public HTML landing).

---

## 4. Auth Mechanisms

### 4.1 Keycloak JWT (main auth)

- **Validation**: `authMiddleware` and `softAuthMiddleware` use `jose` with a remote JWKS (`KEYCLOAK_JWKS_URI`). Tokens are verified for `iss` (KEYCLOAK_ISSUER) and `clockTolerance` (TOKEN_CLOCK_SKEW_SECONDS).
- **Audience / AZP**: Allowed values are `beerbook` and `beerbook-mobile` (for both `aud` and `azp`). Rejected otherwise with 403 and error codes `TOKEN_AUDIENCE_NOT_ALLOWED` / `TOKEN_AZP_NOT_ALLOWED`.
- **Result**: On success, `req.claims` is set with `sub`, `preferred_username`, `email`, `realm_access`.
- **authMiddleware**: Requires `Authorization: Bearer <token>`. Missing/invalid token → 401 with `AUTH_REQUIRED` / `TOKEN_EXPIRED` / `TOKEN_CLAIMS_INVALID` / `TOKEN_INVALID`.
- **softAuthMiddleware**: Optional auth. If Bearer present and valid → sets `req.claims`; otherwise continues without claims (no 401).

### 4.2 Guest ratings (actor identity)

- **Feature flag**: `ENABLE_GUEST_RATINGS` (env `true` or `1`).
- **Module**: `lib/actorIdentity`: `actorMiddleware`, `validateGuestId`, `resolveActor`.
- **Flow**: Used on POST/DELETE/PATCH ratings. After `softAuthMiddleware`, `actorMiddleware` resolves actor:
  - If `req.claims.sub` exists → **user** (type `user`, `sub` etc.).
  - Else if guest ratings enabled → accept **guest** via `X-Guest-Id` or body `guest_id`; must be UUID v4 format (validated by `validateGuestId`).
  - Else → 401/400 with `AUTH_REQUIRED` or `INVALID_GUEST_ID`.
- **Result**: `req.actor` is set to `{ type, sub }` or `{ type, guest_id }`. Backend does not issue guest IDs; client generates UUID v4.
- **Claim**: `POST /api/guest-ratings/claim` requires full auth (`authMiddleware`) to attach guest ratings to the authenticated user.

### 4.3 Admin

- **Definition**: Admin = Keycloak `sub` in allowlist built from env:
  - `ADMIN_USER_ID` (single) and/or `ADMIN_USER_IDS` (comma-separated).
- **Check**: `isAdmin(sub)` in server.js; `adminMiddleware` runs after `authMiddleware` and returns 401 if no claims, 403 if not admin.
- **Usage**: Entire `/api/admin` router applies `authMiddleware` then `adminMiddleware`; all admin endpoints (users, challenges, achievements, featured beers, cosmetics, etc.) are thus auth + admin only. Business validation (e.g. challenge body) lives in `lib/adminValidation.js`.

### 4.4 Auth-related endpoints (no JWT for token issuance)

- **Register**: `POST /api/auth/register` — uses `lib/keycloakAdmin` to create user in Keycloak (admin client_credentials token, then create user in realm `daw`), then creates profile in PostgREST; can send verification email; may return tokens via ROPC if auto-login.
- **Login**: `POST /api/auth/login` — ROPC (resource owner password credentials) via `getTokensForUser` (Keycloak realm `daw`); returns `access_token`, `refresh_token`, `expires_in`; errors: invalid_credentials (401), email_not_verified / account_disabled (403).
- **Refresh**: `POST /api/auth/refresh` — body `refresh_token`; returns new access/refresh tokens.

Keycloak admin/ROPC configuration uses env: `KEYCLOAK_URL`, `KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_CLIENT_SECRET`, `KEYCLOAK_ADMIN_REALM`, and optionally `KEYCLOAK_MOBILE_CLIENT_ID` for ROPC client.

---

## 5. Config Surface (Environment Variables)

Variables read in server.js and key auth/config modules:

| Variable | Purpose | Default / note |
|----------|---------|-----------------|
| **Server** | | |
| `PORT` | HTTP listen port | `3000` |
| `UPLOAD_DIR` | Directory for uploaded files | `path.join(__dirname, 'data', 'uploads')` |
| `UPLOAD_DIR_APPROVED_PREFIXES` | Allowed realpath prefixes for UPLOAD_DIR (security) | `__dirname`, `/data` |
| **Supabase / PostgREST** | | |
| `SUPABASE_REST_URL` | PostgREST base URL | `http://supabase-rest:3000` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for PostgREST | **Required** (process exits if missing) |
| **CORS** | | |
| `CORS_ORIGIN` | Primary allowed origin | `https://beerbook.drinksafterwork.net` |
| `CORS_ORIGINS` | Extra comma-separated origins | (none) |
| **Keycloak (JWT validation)** | | |
| `KEYCLOAK_ISSUER` | JWT issuer | `https://auth.drinksafterwork.net/realms/daw` |
| `KEYCLOAK_JWKS_URI` | JWKS URL for verification | `.../realms/daw/protocol/openid-connect/certs` |
| `TOKEN_CLOCK_SKEW_SECONDS` | Clock tolerance for JWT | `30` |
| **Keycloak (admin / login)** | In lib/keycloakAdmin | |
| `KEYCLOAK_URL` | Keycloak base URL | (no default) |
| `KEYCLOAK_ADMIN_CLIENT_ID` | Admin API client | (no default) |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | Admin API secret | (no default) |
| `KEYCLOAK_ADMIN_REALM` | Admin realm for token | `master` |
| `KEYCLOAK_MOBILE_CLIENT_ID` | ROPC client id | `beerbook-service` |
| **Rate limiting** | | |
| `RATE_LIMIT_WINDOW_MS` | Window for /api limiter | `60000` |
| `RATE_LIMIT_MAX` | Max requests per window for /api | `200` |
| **Admin** | | |
| `ADMIN_USER_ID` | Single admin user id (Keycloak sub) | (none) |
| `ADMIN_USER_IDS` | Comma-separated admin user ids | (none) |
| **Internal / process-event** | | |
| `INTERNAL_PROCESS_EVENT_SECRET` | Bearer secret for /internal process-event | **Required** for /internal to be enabled |
| **App / share** | | |
| `APP_SCHEME` | App URL scheme (e.g. deep links) | `beerbook` |
| `WEB_BASE_URL` | Web base URL (review share, etc.) | Same as CORS_ORIGIN |
| **Guest ratings** | In lib/actorIdentity | |
| `ENABLE_GUEST_RATINGS` | Allow guest ratings (UUID in header/body) | `false` unless `true` or `1` |
| **Venue verification** | | |
| `VENUE_VERIFICATION_RADIUS_M` | Radius in metres for venue check-in | `150` |

Startup checks: `SUPABASE_SERVICE_ROLE_KEY` must be set (exit otherwise). If `INTERNAL_PROCESS_EVENT_SECRET` is not set, a warning is logged and `/internal` responds with 503.

---

## 6. Summary

- **Stack**: Node 20+, Express, jose (JWT), express-rate-limit, multer; BFF to PostgREST with service role.
- **Middleware order**: CORS → request ID → JSON → static → uploads (with security headers) → rate limit on `/api` → routes; no global auth.
- **Routes**: 14 route modules under `/api` plus inline auth, catalog, breweries, ratings, profile, stats, review share; `/internal` conditional on secret.
- **Auth**: Keycloak JWT via JWKS (auth + soft auth); guest ratings via `actorMiddleware` when enabled; admin via allowlist and `adminMiddleware` on `/api/admin`; register/login/refresh use Keycloak admin + ROPC.
- **Config**: Env vars for server, PostgREST, CORS, Keycloak (issuer/JWKS + admin/ROPC), rate limits, admin IDs, internal secret, upload dir, guest ratings, and app/web URLs.
