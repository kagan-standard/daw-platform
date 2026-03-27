# BeerBook API Contract (Backend Source of Truth)

Generated: 2026-03-20
Source: `daw-platform/apps/beerbook-api`
Verification: Endpoint parity checked against `server.js` + `routes/*.js` (106 implemented / 106 documented)
Process-event source: `lib/processEvent.js` + `lib/processEventEngine.js` + `routes/internal.js`

---

## Table of Contents

- [Global Conventions](#global-conventions)
- [Authentication Contract](#authentication-contract)
- [Pagination Contract](#pagination-contract)
- [Error Shape Contract](#error-shape-contract)
- [Endpoints: Health](#health)
- [Endpoints: Catalog](#catalog)
- [Endpoints: Breweries](#breweries)
- [Endpoints: Ratings](#ratings)
- [Endpoints: Comments](#comments)
- [Endpoints: Activity](#activity)
- [Endpoints: Users](#users)
- [Endpoints: Profile & Stats](#profile--stats)
- [Endpoints: Beers](#beers)
- [Endpoints: Exchange](#exchange)
- [Endpoints: Venues](#venues)
- [Endpoints: Deals](#deals)
- [Endpoints: Map](#map)
- [Endpoints: Leaderboard](#leaderboard)
- [Endpoints: Upload](#upload)
- [Endpoints: Highlights](#highlights)
- [Endpoints: Tabs](#tabs)
- [Endpoints: Achievements](#achievements)
- [Endpoints: Cosmetics](#cosmetics)
- [Endpoints: Follows](#follows)
- [Endpoints: Crews](#crews)
- [Endpoints: Push](#push)
- [Endpoints: Tracking](#tracking)
- [Endpoints: Admin](#admin)
- [Endpoints: Internal](#internal)
- [Public Pages (Share URL)](#public-pages-share-url)
- [Appendix: YG (`yg_value`) — validation, rounding, analytics](#appendix-yg-yg_value--validation-rounding-analytics)
- [Side Effects Matrix](#side-effects-matrix)
- [Known Inconsistencies & Gotchas](#known-inconsistencies--gotchas)

---

## Global Conventions

| Convention        | Value |
|-------------------|-------|
| Base URL          | `https://<host>/api` (all public routes); `/internal` for internal routes |
| Auth              | Bearer JWT via `Authorization: Bearer <token>` (Keycloak). For guest ratings (when `ENABLE_GUEST_RATINGS` is set): no JWT; send `X-Guest-Id` header with client-generated UUID v4 instead. |
| Content-Type      | `application/json` (except uploads which use `multipart/form-data`) |
| Rate Limit        | 200 requests per 60s window on `/api` (configurable via `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`) |
| CORS              | Origin allowlist (`CORS_ORIGIN` + `CORS_ORIGINS`), credentials enabled |
| Request IDs       | Every request gets `X-Request-Id` header (UUID); included in auth error responses |
| Default Pagination| `limit=50`, `offset=0`, max limit varies per endpoint (typically 100) |
| Envelope          | Most list endpoints: `{ data: [...], pagination: { limit, offset, total } }` — but NOT all (see [Pagination Contract](#pagination-contract)) |

---

## Authentication Contract

### Token Format

- **Type:** Keycloak JWT
- **Transport:** `Authorization: Bearer <token>` header only (no cookies)
- **Accepted audiences:** `beerbook`, `beerbook-mobile`
- **Accepted azp values:** `beerbook`, `beerbook-mobile`
- **Clock skew tolerance:** 30s (configurable via `TOKEN_CLOCK_SKEW_SECONDS`)

### Middleware Levels

| Middleware | Behavior |
|------------|----------|
| `authMiddleware` | Required. Rejects with 401/403 if missing, expired, or invalid. |
| `softAuthMiddleware` | Optional. If token present and valid, sets `req.claims`. If missing or invalid, continues without `req.claims` (no error). |
| `adminMiddleware` | Runs after `authMiddleware`. Checks trimmed `req.claims.sub` against env-admin IDs parsed from `ADMIN_USER_IDS` (comma-separated) plus optional `ADMIN_USER_ID` fallback. |

**Feature flag:** `ENABLE_GUEST_RATINGS` — when set to `true` or `1`, POST, PATCH, and DELETE `/api/ratings` accept a guest actor via the `X-Guest-Id` header (client-generated UUID v4) when no JWT is sent. Claim endpoint `POST /api/guest-ratings/claim` is always available for authenticated users.

**Guest ratings (client summary):**
- **Identify as guest:** Omit `Authorization`; send `X-Guest-Id: <uuid>` (client-generated, e.g. `crypto.randomUUID()`). Optional body field `user_name` for display name (default `"Guest"`).
- **Dedupe:** One rating per (actor, beer, venue). Guest and user are distinct actors.
- **After signup/login:** Call `POST /api/guest-ratings/claim` with body `{ "guest_id": "<same-uuid>" }` while authenticated to reassign guest ratings to the user. Conflict rule: same beer/venue → keep user rating, discard guest rating.

### `req.claims` Shape

When auth succeeds, the handler receives:

```json
{
  "sub": "keycloak-user-uuid",
  "preferred_username": "displayname",
  "email": "user@example.com",
  "realm_access": { "roles": [] }
}
```

Note: The API uses `req.claims`, NOT `req.user`.

### Auth Error Responses

All auth errors return this shape:

```json
{
  "error_code": "AUTH_REQUIRED",
  "error": "Missing or invalid Authorization header",
  "request_id": "uuid-or-null"
}
```

| Condition | Status | `error_code` |
|-----------|--------|--------------|
| Missing/malformed Authorization header | 401 | `AUTH_REQUIRED` |
| Expired token | 401 | `TOKEN_EXPIRED` |
| Invalid claims (missing sub) | 401 | `TOKEN_CLAIMS_INVALID` |
| General JWT verification failure | 401 | `TOKEN_INVALID` |
| Audience not in allowlist | 403 | `TOKEN_AUDIENCE_NOT_ALLOWED` |
| AZP not in allowlist | 403 | `TOKEN_AZP_NOT_ALLOWED` |
| Admin check: no claims | 401 | N/A — `{ "error": "Authentication required" }` |
| Admin check: not admin | 403 | N/A — `{ "error": "Admin access required" }` |

### Rate Limit Response (429)

```json
{
  "error_code": "RATE_LIMITED",
  "error": "Too Many Requests",
  "retryAfter": 60,
  "request_id": "uuid-or-null"
}
```

Also sets `Retry-After` header (seconds).

---

## Pagination Contract

### Standard Pattern

Most list endpoints use:

**Request query params:**

| Param | Type | Default | Max |
|-------|------|---------|-----|
| `limit` | number | 50 | varies (typically 100) |
| `offset` | number | 0 | — |

**Response envelope:**

```json
{
  "data": [ ... ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 123
  }
}
```

### Endpoints Following Standard Pattern

- `GET /api/ratings` (limit max 100)
- `GET /api/ratings/user/:id` (limit max 100)
- `GET /api/stats` (limit max 100)
- `GET /api/catalog/browse` (limit max 100)
- `GET /api/beers` (without `q`: limit max 100; with `q`: limit max 50)
- `GET /api/beers/search` (limit max 50)
- `GET /api/exchange` (limit max 100)
- `GET /api/venues` (limit max 100)
- `GET /api/venues/:id/prices` (limit max 100)
- `GET /api/tabs/leaderboard` (limit max 200)
- `GET /api/tabs/history` (limit max 200)
- `GET /api/tabs/notifications` (limit max 200, plus `metadata.unread_count`)
- `GET /api/follows/:userId/followers` (limit max 100)
- `GET /api/follows/:userId/following` (limit max 100)
- `GET /api/config` (public; returns `{ theme }`)
- `GET /api/admin/users` (limit max 200)
- `GET /api/admin/referrals` (limit max 200)
- `GET /api/crews/:id/milestones` (limit max 100)
- `GET /api/crews/:id/trending` (limit max 50; pagination includes `days`)

### Endpoints NOT Following Standard Pattern

| Endpoint | Shape | Notes |
|----------|-------|-------|
| `GET /api/catalog/search` | `{ data: [...] }` | No pagination object |
| `GET /api/catalog/styles` | `{ data: [...] }` | No pagination object |
| `GET /api/catalog/validate-new` | `{ data: [...] }` | No pagination object |
| `GET /api/exchange/rates` | `[ ... ]` | Flat array, no wrapper at all |
| `GET /api/exchange/portfolio/:user_id` | `[ ... ]` | Flat array, no wrapper at all |
| `GET /api/ratings/:id/comments` | `{ data: [...] }` | Accepts limit/offset but no pagination object in response |
| `GET /api/breweries/map`, `GET /api/map/breweries` | `{ data: [...], pagination: { limit, offset, total }, truncated }` | Has pagination + `truncated` boolean |
| `GET /api/leaderboard` | `{ period, crew_id, top_reviewers, top_beers, top_yg_values, most_venues, truncated, pagination }` | Custom shape; optional crew scoping |
| `GET /api/crews/:id/style-counts` | `{ "IPA": n, "Lager": n, ... }` | Plain object (style **family** → count) |
| `GET /api/highlights/beer-of-the-week` | `{ beer: ... }` | Single object wrapper |
| `GET /api/activity` | `{ data: [...], pagination: { limit, offset, total } }` | Merged multi-type activity feed |
| `GET /api/map` | `{ data: [...] }` | No pagination |
| `GET /api/map/venues` | `{ data: [...] }` | No pagination |
| `GET /api/map/user/:id` | `{ data: [...] }` | No pagination |

---

## Error Shape Contract

### Standard Handler Errors

Most handlers return:

```json
{ "error": "Human readable message" }
```

### Auth Errors (Structured)

```json
{
  "error_code": "AUTH_REQUIRED",
  "error": "Missing or invalid Authorization header",
  "request_id": "uuid-or-null"
}
```

### Crew Join Errors (Structured)

```json
{
  "error_code": "ALREADY_MEMBER",
  "error": "Already a member",
  "request_id": "uuid-or-null"
}
```

### Cosmetic Purchase Errors (Structured)

```json
{
  "error_code": "insufficient_balance",
  "error": "Insufficient tab balance",
  "tabs_balance": 5,
  "tab_price": 20
}
```

### Inconsistencies

- Auth errors use `{ error_code, error, request_id }`
- Most handler errors use `{ error: string }`
- Crew join errors add `error_code` and `request_id`
- Cosmetic purchase errors add `error_code`, `tabs_balance`, `tab_price`
- `DELETE /api/ratings/:id/comments/:commentId` returns `{ success: true }` on success (200), not 204
- `POST /api/venues/:id/prices/:priceId/confirm`, `POST /api/venues/:id/happy-hours/:hhId/confirm`, and `PATCH /api/venues/:id/happy-hours/:hhId/confirm` return `{ ok: true }`
- `PATCH /api/tabs/notifications/read-all` returns `{ ok: true }`

### Upstream Proxy Errors

Any endpoint that proxies requests to an upstream data service may return:

- `502 Bad Gateway`: `{ "error": "<contextual message>" }` - returned when the upstream service fails (5xx) or the request cannot be completed.

This applies to crew operations, follow operations, and any other proxied writes. It is not re-listed on every individual endpoint below unless the error carries additional structured fields.

---

## Endpoints

---

### Health

#### GET /api/health

- **Auth:** none
- **File:** `server.js`
- **Request:** no params
- **Success Response (200):**

```json
{ "status": "ok", "service": "beerbook-api" }
```

---

#### GET /api/config

- **Auth:** none (optional; mobile may send auth when available)
- **File:** `server.js`
- **Request:** no params
- **Success Response (200):**

```json
{ "theme": "default" }
```

or `{ "theme": "st_patricks_day" }`. Returns the current global app theme. If no stored value exists, returns `"theme": "default"`.

---

### Catalog

#### GET /api/catalog/search

- **Auth:** none
- **File:** `server.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `q` | string | — | Required; returns `{ data: [] }` if < 2 chars |
| `limit` | number | 10 | Clamped 1–50 |

**Success Response (200):** Each item includes `style_category` (canonical family or null). Phase 5 discovery: when the beer has Elo data, `power_score` (global Elo) and `comparison_count` are included; otherwise `null`.

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "brewery_name": "string",
      "style": "string",
      "style_category": "string | null",
      "abv": 5.5,
      "description": "string",
      "review_overall": 4.2,
      "review_count": 12,
      "power_score": 1520,
      "comparison_count": 42
    }
  ]
}
```

**Error Responses:**
- 502: `{ "error": "Catalog search failed" }` or upstream body

---

#### GET /api/catalog/browse

- **Auth:** none
- **File:** `server.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `limit` | number | 30 | Clamped 1–100 |
| `offset` | number | 0 | >= 0 |
| `sort` | string | `"name"` | One of: `name`, `abv`, `review_overall`, `review_count`, `power_score` (Power Score / Elo; nulls last when desc) |
| `order` | string | `"asc"` | `"asc"` or `"desc"` |
| `style` | string | — | Optional; filters by **style family** (`style_category`), e.g. `Lager` returns all beers whose family is Lager (Light Lager, American Lager, etc.) |
| `q` | string | — | Optional; `%` characters stripped |

**Success Response (200):** Each item includes `style` (specific name) and `style_category` (canonical family or null). Phase 5 discovery: `power_score` (global Elo) and `comparison_count` are present when the beer has Elo data; otherwise `null`.

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "brewery_name": "string",
      "style": "string",
      "style_category": "string | null",
      "abv": 5.5,
      "description": "string",
      "ibu_min": 30,
      "ibu_max": 60,
      "flavors": {
        "astringency": 0, "body": 0, "alcohol": 0, "bitter": 0, "sweet": 0,
        "sour": 0, "salty": 0, "fruits": 0, "hoppy": 0, "spices": 0, "malty": 0
      },
      "reviews": {
        "aroma": 0, "appearance": 0, "palate": 0, "taste": 0, "overall": 0, "count": 0
      },
      "review_aroma": 0,
      "review_appearance": 0,
      "review_palate": 0,
      "review_taste": 0,
      "review_overall": 4.2,
      "review_count": 12,
      "power_score": 1520,
      "comparison_count": 42
    }
  ],
  "pagination": { "limit": 30, "offset": 0, "total": 500 }
}
```

Per-beer review count is always present as `review_count` and `reviews.count` (0 when there are no reviews). Both are numbers; client sort by review count is consistent.

**Error Responses:**
- 502 or upstream status with body

---

#### GET /api/catalog/styles

- **Auth:** none
- **File:** `server.js`

**Request:** no params

**Success Response (200):** Canonical 9 style family names for filter chips: IPA, Pale Ale, Lager, Stout, Porter, Wheat, Pilsner, Sour, Belgian.

```json
{ "data": ["IPA", "Pale Ale", "Lager", "Stout", "Porter", "Wheat", "Pilsner", "Sour", "Belgian"] }
```

**Error Responses:**
- 502 or upstream body

---

#### GET /api/catalog/validate-new

- **Auth:** none
- **File:** `server.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `name` | string | — | Required; returns `{ data: [] }` if < 2 chars |
| `brewery` | string | — | Optional |

**Success Response (200):** Each match includes `style` and `style_category` (canonical family or null).

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "brewery_name": "string",
      "style": "string",
      "style_category": "string | null",
      "abv": 5.5,
      "name_similarity": 0.85,
      "brewery_match": true,
      "similarity": 0.9
    }
  ]
}
```

Max 5 items. Filtered by `name_similarity > 0.4` or `(name_similarity > 0.25 && brewery_match)`.
On upstream error: returns `{ "data": [] }` (does NOT propagate errors).

---

#### GET /api/catalog/beer/:id

- **Auth:** none
- **File:** `server.js`

**URL Params:** `id` — beer UUID

**Success Response (200):** Single `mapCatalogBeer` object (same shape as browse items including `style_category`, `power_score`, `comparison_count` when available; NOT wrapped in `data`).

**Error Responses:**
- 404: `{ "error": "Beer not found" }`
- 502: upstream body or `{ "error": "Catalog fetch failed" }`

---

### Breweries

#### GET /api/breweries/search

- **Auth:** none
- **File:** `server.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `q` | string | — | Required; min 2 chars |
| `limit` | number | 10 | Clamped 1–25 |

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "slug": "string",
      "city": "string",
      "state": "string",
      "brewery_type": "string",
      "logo_url": "string",
      "latitude": 40.123,
      "longitude": -74.456,
      "verified": true,
      "similarity_score": 0.95
    }
  ]
}
```

**Error Responses:**
- 400: `{ "error": "Query q is required and must be at least 2 characters" }`
- 502: upstream body or `{ "error": "Brewery search failed" }`

---

#### GET /api/breweries/map

#### GET /api/map/breweries

- **Auth:** none
- **File:** `server.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `bounds` | string | — | Optional; format `sw_lat,sw_lng,ne_lat,ne_lng` (4 floats) |

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "latitude": 40.123,
      "longitude": -74.456,
      "brewery_type": "string",
      "city": "string",
      "state": "string",
      "website_url": "string",
      "phone": "string"
    }
  ],
  "pagination": { "limit": 500, "offset": 0, "total": 42 },
  "truncated": false
}
```

Both routes are aliases and return the same response shape.
Max 500 breweries. `truncated` is `true` when total exceeds limit. Sorted by distance to center when `bounds` is provided.

**Error Responses:**
- 502 or upstream body

---

#### GET /api/breweries/:id

- **Auth:** none
- **File:** `server.js`

**URL Params:** `id` — brewery UUID

**Success Response (200):**

```json
{
  "id": "uuid",
  "name": "string",
  "slug": "string",
  "street": "string",
  "city": "string",
  "state": "string",
  "postal_code": "string",
  "country": "string",
  "latitude": 40.123,
  "longitude": -74.456,
  "phone": "string",
  "website_url": "string",
  "brewery_type": "string",
  "description": "string",
  "beers": [
    { "name": "string", "style": "string", "abv": 5.5 }
  ]
}
```

**Error Responses:**
- 404: `{ "error": "Brewery not found" }`
- 502: upstream body

---

### Ratings

#### GET /api/ratings

- **Auth:** `softAuthMiddleware` (optional)
- **Middleware:** `validateSort`
- **File:** `server.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `limit` | number | 50 | 1–100 |
| `offset` | number | 0 | >= 0 |
| `sort` | string | `"created_at"` | One of: `created_at`, `rating`, `beer_name` |
| `order` | string | `"desc"` | `"asc"` or `"desc"` |
| `feed` | string | — | Optional; `"crew"` or `"following"` (requires auth) |
| `crew_id` | string | — | Required when `feed=crew` |

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "string",
      "user_name": "string",
      "beer_name": "string",
      "brewery": "string",
      "style": "string",
      "abv": 5.5,
      "rating": 4,
      "yg_value": 4.5,
      "notes": "string",
      "latitude": 40.123,
      "longitude": -74.456,
      "location_name": "string",
      "venue_id": "uuid | null",
      "location_verified": false,
      "photo_url": "string | null",
      "beer_id": "uuid | null",
      "price_cents": 600,
      "serve_type": "draft",
      "flavor_hoppy": 3,
      "flavor_malty": 2,
      "flavor_bitter": 2,
      "flavor_sweet": 1,
      "flavor_fruity": 2,
      "created_at": "ISO8601",
      "comment_count": 0,
      "cheers_count": 5,
      "you_cheered": false,
      "earned_achievement_ids": ["uuid"],
      "achievement_id": "uuid | null"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 1000 }
}
```

**Rating item fields (author identity):**
- `user_id` (string | null): Keycloak sub for user-owned ratings; `null` for guest-owned ratings.
- `guest_id` (string | null): Client-generated guest UUID for guest-owned ratings; `null` for user-owned ratings.
- `author_type` (string): `"user"` or `"guest"`. Exactly one of `user_id` or `guest_id` is set per rating.
- `user_name` (string): Display name (from token for users; from request body for guests).

**Enrichment fields (added by helpers):**
- `cheers_count` (number): always present; count of cheers reactions
- `you_cheered` (boolean): `true` if authed user cheered; `false` otherwise
- `earned_achievement_ids` (string[]): achievement IDs earned on this rating
- `achievement_id` (string | null): first achievement earned, or null

**Error Responses:**
- 400: `{ "error": "Invalid sort field. Allowed: created_at, rating, beer_name" }`
- 400: `{ "error": "crew_id is required for feed=crew" }`
- 401: `{ "error": "Authentication required for feed filters" }`

---

#### GET /api/ratings/user/:id

- **Auth:** `softAuthMiddleware` (optional)
- **Middleware:** `softAuthMiddleware`, `validateSort`
- **File:** `server.js`

**URL Params:** `id` — user ID (Keycloak sub)

**Query Params:** Same as `GET /api/ratings` (`limit`, `offset`, `sort`, `order`). No `feed` or `crew_id`.

**Success Response (200):**

```json
{
  "data": [
    {
      "...rating fields...",
      "cheers_count": 3,
      "you_cheered": true,
      "earned_achievement_ids": ["uuid"],
      "achievement_id": "uuid | null"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 42 }
}
```

Includes cheers enrichment (`cheers_count`, `you_cheered`) using the same helper as `GET /api/ratings`.
When unauthenticated, `you_cheered` is always `false`.

**Error Responses:**
- 400: `{ "error": "Invalid sort field. Allowed: created_at, rating, beer_name" }`

---

#### POST /api/ratings

- **Auth:** User (JWT via `Authorization: Bearer`) **or** Guest (when `ENABLE_GUEST_RATINGS` is set): send `X-Guest-Id` header with a client-generated UUID v4. Exactly one of valid JWT or valid guest ID required.
- **File:** `server.js`

**Request Headers (guest only):**

| Header | Type | Required (guest) | Validation |
|--------|------|-------------------|------------|
| `X-Guest-Id` | string | yes (when not sending JWT) | Client-generated UUID v4 (e.g. from `crypto.randomUUID()`). Backend does not issue guest IDs. |

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `guest_id` / `guestId` | string | no | Alternative to `X-Guest-Id` for guest actor; same UUID format. Prefer header for consistency. |
| `user_name` / `userName` | string | no | Display name for **guest** ratings (e.g. beer-pun name). Ignored for authenticated users (uses token). Default `"Guest"` if omitted for guest. |
| `yg_value` / `ygValue` | number | **yes** | **Canonical YG:** `-1`, or any number in `[1, 10]` where `2x` is an integer (half-steps: `1`, `1.5`, …, `10`). **`0` is invalid.** Internal 1–5 star column is derived server-side for DB/legacy only; **do not infer stars from YG in clients.** See [Appendix: YG](#appendix-yg-yg_value--validation-rounding-analytics). |
| `beer_name` / `beerName` | string | yes* | *Required unless `beer_id` resolves a name |
| `brewery` | string | yes** | **Required for `is_new_beer` (min 2 chars) |
| `style` | string | yes** | **Required for `is_new_beer` or when beer style is unknown |
| `abv` | number | no** | **Required for `is_new_beer` (0–30) |
| `beer_id` / `beerId` | string | no | Catalog beer UUID |
| `is_new_beer` | boolean | no | Default `false` |
| `rating` | number | no | **Do not send.** Internal 1–5 value is derived from `yg_value` for DB/legacy only. |
| `latitude` / `lat` | number | no | Must provide both lat+lng or neither; valid numbers |
| `longitude` / `lng` | number | no | Must provide both lat+lng or neither; valid numbers |
| `location_name` / `locationName` | string | no | — |
| `venue_type` / `venueType` | string | no | — |
| `venue_id` / `venueId` | string | no | — |
| `photo_url` / `photoUrl` | string | no | — |
| `price_cents` / `priceCents` | number | no | Positive integer |
| `serve_type` / `serveType` | string | no | One of: `draft`, `can`, `bottle`, `crowler`, `growler`, `nitro` |
| `notes` | string | no | — |
| `flavor_hoppy` / `flavors.hoppy` | number | no | Default 0 |
| `flavor_malty` / `flavors.malty` | number | no | Default 0 |
| `flavor_bitter` / `flavors.bitter` | number | no | Default 0 |
| `flavor_sweet` / `flavors.sweet` | number | no | Default 0 |
| `flavor_fruity` / `flavors.fruity` | number | no | Default 0 |

Note: Accepts both `snake_case` and `camelCase` for most fields.

**Success Response — NEW RATING (201):**

`data` includes `user_id` (user) or `guest_id` (guest); the other is null. `author_type` is `"user"` or `"guest"`. `location_verified` is `true` when the backend verified that submitted device coordinates were within the configured distance of the linked venue at create time (used for crew-visited and first-venue-visit milestones).

```json
{
  "data": {
    "id": "uuid",
    "user_id": "string | null",
    "guest_id": "string | null",
    "author_type": "user | guest",
    "user_name": "string",
    "beer_name": "string",
    "brewery": "string",
    "style": "string",
    "abv": 5.5,
    "rating": 4,
    "yg_value": 4.5,
    "notes": "string",
    "latitude": 40.123,
    "longitude": -74.456,
    "location_name": "string",
    "venue_id": "uuid | null",
    "location_verified": false,
    "photo_url": "string | null",
    "beer_id": "uuid | null",
    "price_cents": 600,
    "serve_type": "draft",
    "flavor_hoppy": 3,
    "flavor_malty": 2,
    "flavor_bitter": 2,
    "flavor_sweet": 1,
    "flavor_fruity": 2,
    "created_at": "ISO8601"
  },
  "updated": false,
  "tabs_earned": 8,
  "tabs_breakdown": {
    "rating_base": 2,
    "rating_location": 2,
    "rating_photo": 4,
    "rating_price": 2,
    "rating_review": 4
  },
  "tabs_reason": "awarded",
  "tier_multiplier": 1.5,
  "seeder_multiplier": 1.0,
  "new_beer_multiplier": 1.0,
  "is_new_beer": false,
  "weekly_count": 4,
  "weekly_cap": 10,
  "achievements_unlocked": [
    { "key": "first_rating", "name": "First Sip", "reward_tabs": 5 }
  ],
  "current_streak_weeks": 2,
  "longest_streak_weeks": 7
}
```

**Field details:**

| Field | Type | Description |
|-------|------|-------------|
| `tabs_earned` | number | Total tabs delta from process-event. For admin users in env-admin IDs, weekly cap is bypassed and this reflects the full calculated amount even after 10+ ratings/week. |
| `tabs_breakdown` | `Record<string, number>` | Object mapping source to post-multiplier amount. Keys: `rating_base` (always 1 base), `rating_location` (1 base, if location provided), `rating_photo` (2 base, if photo_url provided), `rating_price` (1 base, if price_cents provided), `rating_review` (2 base, if notes >= 10 chars). Values are `Math.round(base * new_beer_multiplier * tier_multiplier * seeder_multiplier)`. |
| `tabs_reason` | `"awarded"` or `"weekly_cap"` | `"awarded"` when `tabs_earned > 0`; `"weekly_cap"` when `tabs_earned === 0`. Admin users that bypass cap stay `"awarded"` for qualifying ratings. |
| `tier_multiplier` | number | From tier config (e.g. 1.0, 1.25, 1.5) |
| `seeder_multiplier` | number | 1.5 if user is seeder, 1.0 otherwise |
| `new_beer_multiplier` | number | 1.5 if `is_new_beer === true`, 1.0 otherwise |
| `is_new_beer` | boolean | Whether this was a new beer submission |
| `weekly_count` | number | Current count of this user's `rating_award` events in the current week (Mon 00:00 UTC reset), after this submission |
| `weekly_cap` | number | Weekly cap value (currently `10`) for non-admin enforcement; admin users listed in env-admin IDs bypass this cap in `rating_award`. |
| `achievements_unlocked` | `Array<{ key: string, name: string, reward_tabs: number }>` | Achievements earned by this rating. Empty array if none. |
| `current_streak_weeks` | number | Current weekly rating streak from real-time profile cache refresh after `rating_award`. |
| `longest_streak_weeks` | number | Longest weekly rating streak from real-time profile cache refresh after `rating_award`. |

**Head-to-head (optional, authenticated users only):** When the backend decides to offer a head-to-head comparison after this rating, the 201 response includes a top-level `head_to_head` object. When absent or null, clients behave as today (no head-to-head step). Shape:

| Field | Type | Description |
|-------|------|-------------|
| `head_to_head` | `object \| null` | Omitted or `null` when no prompt is offered. When present: `{ id: string, reward_tabs: number, current_beer: HeadToHeadBeer, challenger_beer: HeadToHeadBeer }`. |
| `head_to_head.id` | string | UUID of the prompt; use for complete/skip endpoints. |
| `head_to_head.reward_tabs` | number | Bonus tabs awarded when user completes the comparison (optional to show). |
| `head_to_head.current_beer` | object | The beer just rated: `{ rating_id, beer_name, brewery?, style?, venue_name?, location_name?, created_at?, photo_url? }` (no YG value). |
| `head_to_head.challenger_beer` | object | A past rating to compare: same shape as `current_beer`. |

Match quality and when to prompt are backend-owned (e.g. same user history, same style or YG band, cooldowns). Guests never receive `head_to_head`.

**Success Response — UPDATE EXISTING RATING (200):**

```json
{
  "data": {
    "id": "uuid",
    "...all rating fields..."
  },
  "updated": true,
  "message": "Rating updated."
}
```

Note: Update response does NOT include `tabs_earned`, `tabs_breakdown`, `tier_multiplier`, `seeder_multiplier`, `new_beer_multiplier`, `is_new_beer`, `achievements_unlocked`, `current_streak_weeks`, or `longest_streak_weeks`. No tabs are awarded on update.

**Guest ratings (201 response):** When the request is authenticated as a guest (`X-Guest-Id`, no JWT), the response still returns 201 with `data` and the same top-level keys, but progression fields are zero/default: `tabs_earned` = 0, `tabs_breakdown` = {}, `tabs_reason` = `"weekly_cap"`, `achievements_unlocked` = [], `current_streak_weeks` = 0, `longest_streak_weeks` = 0, `weekly_count` = 0. No tabs or achievements are awarded for guest ratings.

**Error Responses:**
- 400: `{ "error": "yg_value is required (-1 or 1–10 in steps of 0.5; 0 is not allowed)" }`
- 400: `{ "error_code": "INVALID_GUEST_ID", "error": "guest_id must be a valid UUID (e.g. client-generated UUID v4)" }` (guest path, invalid or missing `X-Guest-Id` / `guest_id`)
- 401: `{ "error_code": "AUTH_REQUIRED", "error": "Authentication required. Guest ratings are not enabled." }` (no JWT and guest path when `ENABLE_GUEST_RATINGS` is not set)
- 400: `{ "error": "yg_value must be -1 or a number from 1 to 10 in steps of 0.5 (0 is not allowed)" }`
- 400: `{ "error": "latitude and longitude must be provided together" }`
- 400: `{ "error": "latitude and longitude must be valid numbers" }`
- 400: `{ "error": "price_cents must be a positive integer" }`
- 400: `{ "error": "Invalid serve_type. Must be one of: draft, can, bottle, crowler, growler, nitro" }`
- 400: `{ "error": "beer_name is required for new beer flow" }`
- 400: `{ "error": "brewery is required and must be at least 2 characters" }`
- 400: `{ "error": "style is required for new beer flow" }`
- 400: `{ "error": "abv must be a number between 0 and 30" }`
- 400: `{ "error": "style required when beer style is unknown" }`
- 400: `{ "error": "beer_name required when beer_id is missing or unresolved" }`
- 409: `{ "error": "Very similar beer already exists", "matches": [{ "id", "name", "brewery_name", "style", "abv", "similarity" }] }` (new beer flow only)
- 502: various upstream/process-event errors

**Side Effects:**
- Inserts or updates `ratings` row (with `user_id`/`author_type=user` for authenticated user, or `guest_id`/`author_type=guest` for guest).
- May create new `beers` row (when `is_new_beer`).
- May create new `venues` row (when lat/lng provided with location_name and no nearby venue).
- **Authenticated users only:** Ensures `profiles` and `user_tabs_profile` exist; awards tabs via `invokeProcessEvent('rating_award')` -> `tabs_ledger`; evaluates achievements via `invokeProcessEvent('rating_submitted')` -> `user_achievements`, `user_cosmetics`; crew milestones. **Guest ratings:** No tabs, achievements, or milestones (side effects skipped).

---

#### PATCH /api/ratings/:id

- **Auth:** User (JWT) **or** Guest (`X-Guest-Id` when `ENABLE_GUEST_RATINGS`). Same as POST/DELETE. Ownership: rating must match `user_id` (user) or `guest_id` (guest).
- **Purpose:** Update an existing rating by ID (no ambiguity when a user has multiple ratings for the same beer at different venues). Content update only; no tabs, achievements, or streak.
- **File:** `server.js`

**URL Params:** `id` — rating UUID. The rating must be owned by the authenticated user or the guest identified by `X-Guest-Id`.

**Request Body:** Same fields as POST /api/ratings, **all optional** (partial update). Validation rules match POST where applicable (e.g. `yg_value` canonical set: `-1` or `1`–`10` in `0.5` steps, no `0`; ABV 0–30; lat/lng together; `serve_type` enum; `price_cents` positive integer).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `yg_value` / `ygValue` | number | no | Same allowed set as POST (`-1` or half-steps `1`–`10`; `0` invalid) |
| `beer_name` / `beerName` | string | no | — |
| `brewery` | string | no | — |
| `style` | string | no | — |
| `abv` | number | no | 0–30 |
| `beer_id` / `beerId` | string | no | — |
| `notes` | string | no | — |
| `latitude` / `lat`, `longitude` / `lng` | number | no | Must provide both or neither |
| `location_name` / `locationName` | string | no | — |
| `venue_id` / `venueId` | string | no | — |
| `photo_url` / `photoUrl` | string | no | — |
| `price_cents` / `priceCents` | number | no | Positive integer |
| `serve_type` / `serveType` | string | no | One of: draft, can, bottle, crowler, growler, nitro |
| `flavor_hoppy`, `flavor_malty`, `flavor_bitter`, `flavor_sweet`, `flavor_fruity` | number | no | Or via `flavors.hoppy`, etc. |
| `user_name` / `userName` | string | no | Guest display name only; ignored for authenticated users |

**Success Response (200):**

```json
{
  "data": {
    "id": "uuid",
    "user_id": "string | null",
    "guest_id": "string | null",
    "author_type": "user | guest",
    "user_name": "string",
    "beer_name": "string",
    "brewery": "string",
    "style": "string",
    "abv": 5.5,
    "rating": 4,
    "yg_value": 4.5,
    "notes": "string",
    "latitude": 40.123,
    "longitude": -74.456,
    "location_name": "string",
    "venue_id": "uuid | null",
    "photo_url": "string | null",
    "beer_id": "uuid | null",
    "price_cents": 600,
    "serve_type": "draft",
    "flavor_hoppy": 3,
    "flavor_malty": 2,
    "flavor_bitter": 2,
    "flavor_sweet": 1,
    "flavor_fruity": 2,
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

Response does **not** include tabs_earned, tabs_breakdown, achievements_unlocked, streak, or weekly_count. Edit is content update only.

**Error Responses:**
- 400: `{ "error": "Rating id is required" }` (missing or empty id)
- 404: `{ "error": "Rating not found or not owned by you" }`
- 400: Validation errors (e.g. invalid `yg_value`, `abv` out of range, lat/lng not together, invalid `serve_type`, `price_cents` not positive integer)

**Side Effects:** Updates the `ratings` row only. No new tabs, no achievement re-evaluation, no new beer/venue creation. Optionally refresh any denormalized/cache fields that depend on rating content.

---

#### DELETE /api/ratings/:id

- **Auth:** User (JWT) **or** Guest (`X-Guest-Id` when `ENABLE_GUEST_RATINGS`). Ownership: rating must match `user_id` (user) or `guest_id` (guest).
- **File:** `server.js`

**URL Params:** `id` — rating UUID

**Success Response (204):** No body.

**Error Responses:**
- 404: `{ "error": "Rating not found or not owned by you" }`
- 502: `{ "error": "Delete failed" }`

**Side Effects:** Deletes from `ratings`. Does NOT reverse tab awards.

---

### Head-to-head (Phase 1)

Optional comparison prompt after a rating. Only offered to authenticated users when backend match-quality and cooldown rules allow. Clients use the prompt `id` from the create response to call complete or skip.

#### POST /api/head-to-head/:id/complete

- **Auth:** Required (JWT). Prompt must belong to the authenticated user.
- **File:** `server.js`

**URL Params:** `id` — head-to-head prompt UUID (from `head_to_head.id` in POST /api/ratings response).

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `winner_rating_id` / `winnerRatingId` | string | yes | Must be one of the two rating IDs in this prompt (current or challenger). |

**Success Response (200):**

```json
{
  "success": true,
  "reward_tabs": 2,
  "tabs_earned": 2
}
```

- Idempotent: if the prompt was already completed or skipped, returns 200 with `{ "success": true, "message": "Already completed or skipped" }`.
- `reward_tabs` / `tabs_earned`: Bonus tabs for completing the comparison (same value; client may show "+N Tabs").

**Error Responses:**
- 400: `{ "error": "Head-to-head prompt id is required" }` or `{ "error": "winner_rating_id is required" }` or `{ "error": "winner_rating_id must be one of the two ratings in this prompt" }`
- 401: `{ "error": "Authentication required" }`
- 404: `{ "error": "Head-to-head prompt not found" }`

**Side Effects:** Inserts into `head_to_head_results` (winner/loser beer and rating IDs). Updates `beer_elo_ratings` for winner and loser beers when both have catalog `beer_id` (Phase 3 Elo). Updates `head_to_head_prompts` row to `status = 'completed'`.

#### POST /api/head-to-head/:id/skip

- **Auth:** Required (JWT). Prompt must belong to the authenticated user.
- **File:** `server.js`

**URL Params:** `id` — head-to-head prompt UUID.

**Request Body:** None.

**Success Response (200):**

```json
{
  "success": true
}
```

- Idempotent: if already completed or skipped, returns 200 with `{ "success": true, "message": "Already completed or skipped" }`.

**Error Responses:**
- 400: `{ "error": "Head-to-head prompt id is required" }`
- 401: `{ "error": "Authentication required" }`
- 404: `{ "error": "Head-to-head prompt not found" }`

**Side Effects:** Updates `head_to_head_prompts` row to `status = 'skipped'`. No result row is inserted.

---

#### POST /api/guest-ratings/claim

- **Auth:** `authMiddleware` (required). Caller must be the newly signed-in user.
- **File:** `server.js`

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `guest_id` / `guestId` | string | yes | Same client-generated UUID used when rating as guest. Proves ownership of guest ratings to claim. |

**Success Response (200):**

```json
{
  "claimed": 3,
  "discarded": 1
}
```

- `claimed`: Count of guest ratings reassigned to the authenticated user (no conflict with existing user rating for same beer/venue).
- `discarded`: Count of guest ratings deleted because the user already had a rating for the same beer/venue (conflict rule: keep user rating, discard guest).

When there are no guest ratings for the given `guest_id`, returns `{ "claimed": 0, "discarded": 0, "message": "No guest ratings to claim" }`.

**Error Responses:**
- 400: `{ "error_code": "INVALID_GUEST_ID", "error": "guest_id must be a valid UUID (e.g. client-generated UUID v4)" }`

**Side Effects:** For each rating owned by `guest_id`: either UPDATE `ratings` set `user_id` = caller, `guest_id` = null, `author_type` = 'user' (when user has no rating for that beer/venue), or DELETE the guest rating (when user already has a rating for that beer/venue). Idempotent; safe to call multiple times.

---

### Comments

#### GET /api/ratings/:id/comments

- **Auth:** none
- **File:** `server.js`

**URL Params:** `id` — rating UUID

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `limit` | number | 20 | 1–100 |
| `offset` | number | 0 | >= 0 |

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "rating_id": "uuid",
      "user_id": "string",
      "user_name": "string",
      "body": "string",
      "created_at": "ISO8601"
    }
  ]
}
```

Note: No `pagination` object in response despite accepting limit/offset.

---

#### POST /api/ratings/:id/comments

- **Auth:** `authMiddleware` (required)
- **File:** `server.js`

**URL Params:** `id` — rating UUID

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `body` | string | yes | 1–500 chars (trimmed) |

**Success Response (201):**

```json
{
  "data": {
    "id": "uuid",
    "rating_id": "uuid",
    "user_id": "string",
    "user_name": "string",
    "body": "string",
    "created_at": "ISO8601"
  }
}
```

**Error Responses:**
- 400: `{ "error": "Comment body is required" }`
- 400: `{ "error": "Comment must be 500 characters or less" }`
- 404: `{ "error": "Rating not found" }`

**Side Effects:** Inserts into `rating_comments`, increments `comment_count` on the rating via RPC.

---

#### DELETE /api/ratings/:id/comments/:commentId

- **Auth:** `authMiddleware` (required)
- **File:** `server.js`

**URL Params:** `id` — rating UUID, `commentId` — comment UUID

**Success Response (200):**

```json
{ "success": true }
```

Note: Returns 200 with `{ success: true }`, NOT 204.

**Error Responses:**
- 404: `{ "error": "Comment not found" }`
- 403: `{ "error": "You can only delete your own comments" }`
- 502: `{ "error": "Failed to delete comment" }`

**Side Effects:** Deletes from `rating_comments`, decrements `comment_count` on the rating via RPC.

---

### Activity

#### GET /api/activity

- **Auth:** `softAuthMiddleware` (optional)
- **File:** `routes/activity.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `feed` | string | `""` | Optional; `"crew"` or `"following"` (requires auth) |
| `crew_id` | string | `""` | Required when `feed=crew` |
| `limit` | number | 50 | Max 100 |
| `offset` | number | 0 | Min 0 |

**Success Response (200):**

```json
{
  "data": [
    {
      "type": "rating",
      "id": "uuid",
      "user_id": "string",
      "beer_name": "string",
      "brewery": "string",
      "style": "string",
      "rating": 4,
      "yg_value": 4.5,
      "created_at": "ISO8601",
      "cheers_count": 2,
      "you_cheered": true,
      "earned_achievement_ids": ["uuid"],
      "achievement_id": "uuid | null",
      "feed_source": "crew | following | global",
      "...other rating fields..."
    },
    {
      "type": "cheers",
      "id": "uuid",
      "user_id": "string",
      "user_name": "string",
      "avatar_url": "string | null",
      "data": {
        "rating_id": "uuid",
        "beer_id": "uuid | null",
        "beer_name": "string | null"
      },
      "created_at": "ISO8601"
    },
    {
      "type": "follow",
      "id": "uuid",
      "user_id": "string",
      "user_name": "string",
      "avatar_url": "string | null",
      "data": {
        "followed_user_id": "string",
        "followed_user_name": "string"
      },
      "created_at": "ISO8601"
    },
    {
      "type": "crew_join",
      "id": "uuid",
      "user_id": "string",
      "user_name": "string",
      "avatar_url": "string | null",
      "data": {
        "crew_name": "string | null",
        "crew_id": "uuid"
      },
      "created_at": "ISO8601"
    },
    {
      "type": "venue",
      "id": "uuid",
      "name": "string",
      "address": "string",
      "latitude": 40.123,
      "longitude": -74.456,
      "created_at": "ISO8601",
      "feed_source": "global"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 230 }
}
```

Items are a merged list of ratings + venues + cheers + follow + crew_join, sorted by `created_at` desc.
- Rating items get `type: "rating"` + cheers/achievement enrichment.
- Additional event types: `type: "cheers"`, `type: "follow"`, `type: "crew_join"`.
- Venue items still use `type: "venue"` for backward compatibility.
- `you_cheered` is `false` when unauthenticated.
- `follow` items require `follows.created_at`; if unavailable, follow events are omitted.

**Error Responses:**
- 401: `{ "error": "Authentication required for feed filters" }`
- 400: `{ "error": "crew_id is required for feed=crew" }`

---

#### POST /api/ratings/:id/cheers

- **Auth:** `authMiddleware` (required)
- **File:** `routes/activity.js`

**URL Params:** `id` — rating UUID

**Request Body:** None.

**Success Response (200) — toggle ON:**

```json
{ "action": "added", "count": 6, "cheers_count": 6, "user_cheered": true }
```

**Success Response (200) — toggle OFF:**

```json
{ "action": "removed", "count": 5, "cheers_count": 5, "user_cheered": false }
```

**Error Responses:**
- 401/403: auth middleware errors
- 502: `{ "error": "Delete failed" }` or `{ "error": "Insert failed" }`

**Side Effects:**
- Inserts or deletes from `reactions` (toggle behavior)
- On add: `ensureProfileExists` for giver and receiver; `invokeProcessEvent('cheers_given')` for giver and `invokeProcessEvent('cheers_received')` for receiver (tabs + notifications)

---

#### GET /api/ratings/:id/cheers

- **Auth:** none
- **File:** `routes/activity.js`

**URL Params:** `id` — rating UUID

**Success Response (200):**

```json
{
  "count": 3,
  "users": ["user-id-1", "user-id-2", "user-id-3"]
}
```

---

### Users

#### GET /api/users/:id

#### GET /api/profiles/:id

- **Auth:** none
- **File:** `routes/activity.js`

Both routes are aliases and return the same response shape.

**URL Params:** `id` — user ID (Keycloak sub)

**Success Response (200):**

```json
{
  "id": "string",
  "display_name": "string",
  "email": "string",
  "avatar_url": "string | null",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "equipped_border_id": "uuid | null",
  "equipped_title_id": "uuid | null",
  "equipped_avatar_id": "uuid | null",
  "equipped_border_asset_url": "string | null",
  "equipped_border_fit": "object | null",
  "equipped_title_text": "string | null",
  "equipped_avatar_asset_url": "string | null"
}
```

- **`equipped_border_fit`:** Fit metadata (scale, rotationDeg, offsetX, offsetY, optional avatarScale) from the equipped border cosmetic; `null` when no border equipped or border has no fit.
- **`equipped_avatar_asset_url`:** Resolved asset URL of the equipped avatar cosmetic; `null` when no avatar equipped. Use for profile picture display (prefer over `avatar_url` when present).

**Error Responses:**
- 404: `{ "error": "User not found" }`

---

#### GET /api/users/:id/stats

- **Auth:** none
- **File:** `routes/activity.js`

**URL Params:** `id` — user ID

**Success Response (200) — has ratings:**

```json
{
  "total_ratings": 42,
  "total_styles": 8,
  "avg_rating": 4.12,
  "avg_yg_value": 3.45,
  "total_yg_portfolio": 145.2,
  "most_rated_style": "IPA",
  "highest_rated_beer": { "beer_name": "string", "rating": 5 },
  "style_distribution": { "IPA": 15, "Lager": 10 },
  "rating_distribution": { "1": 0, "2": 2, "3": 5, "4": 20, "5": 15 },
  "monthly_activity": [{ "month": "2025-03", "count": 12 }],
  "follower_count": 10,
  "following_count": 5,
  "crew_count": 2
}
```

**Success Response (200) — no ratings:**

```json
{
  "total_ratings": 0,
  "total_styles": 0,
  "avg_rating": 0,
  "avg_yg_value": 0,
  "total_yg_portfolio": 0,
  "most_rated_style": null,
  "highest_rated_beer": null,
  "style_distribution": {},
  "rating_distribution": {},
  "monthly_activity": [],
  "follower_count": 0,
  "following_count": 0,
  "crew_count": 0
}
```

---

### Profile & Stats

#### GET /api/profile

#### GET /api/profile/me

- **Auth:** `authMiddleware` (required)
- **File:** `server.js`

Both routes are identical.

**Success Response (200 existing / 201 newly created):**

```json
{
  "id": "string",
  "display_name": "string",
  "email": "string | null",
  "avatar_url": "string | null",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "equipped_border_id": "uuid | null",
  "equipped_title_id": "uuid | null",
  "equipped_avatar_id": "uuid | null",
  "equipped_border_asset_url": "string | null",
  "equipped_border_fit": "object | null",
  "equipped_title_text": "string | null",
  "equipped_avatar_asset_url": "string | null",
  "is_admin": false
}
```

- **`equipped_border_fit`:** Fit metadata from the equipped border cosmetic; `null` when no border equipped or border has no fit.
- **`equipped_avatar_asset_url`:** Resolved asset URL of the equipped avatar cosmetic; use for profile picture (prefer over `avatar_url` when present).

Returns 201 if profile was newly created, 200 if existing.

**Side Effects:** May insert into `profiles` (auto-creation).

---

#### PATCH /api/profile

- **Auth:** `authMiddleware` (required)
- **File:** `server.js`

Updates the authenticated user's profile. Returns the full profile object in the same shape as `GET /api/profile`.

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `display_name` | string | no | Trimmed; 1–30 chars after trim; empty string rejected |
| `avatar_url` | string | no | Trimmed; must be a valid absolute URL; empty string rejected |

At least one of `display_name` or `avatar_url` must be provided.

**Success Response (200):**

```json
{
  "id": "string",
  "display_name": "string",
  "email": "string | null",
  "avatar_url": "string | null",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "equipped_border_id": "uuid | null",
  "equipped_title_id": "uuid | null",
  "equipped_avatar_id": "uuid | null",
  "equipped_border_asset_url": "string | null",
  "equipped_border_fit": "object | null",
  "equipped_title_text": "string | null",
  "equipped_avatar_asset_url": "string | null",
  "is_admin": false
}
```

**Error Responses:**
- 400: `{ "error": "At least one of display_name or avatar_url is required" }`
- 400: `{ "error": "display_name must be a string between 1 and 30 characters" }`
- 400: `{ "error": "avatar_url must be a valid URL" }`
- 502: `{ "error": "Update profile failed" }` or upstream body

**Side Effects:** May auto-create a profile row before patching if one does not exist.

---

#### GET /api/stats/me

- **Auth:** `authMiddleware` (required)
- **File:** `server.js`

**Success Response (200):**

```json
{
  "total_ratings": 42,
  "average_rating": 4.12,
  "unique_beers": 30,
  "unique_styles": 8,
  "favorite_style": "IPA",
  "avg_yg_value": 3.45,
  "flavors": { "hoppy": 3.1, "malty": 2.0, "bitter": 2.5, "sweet": 1.8, "fruity": 2.2 },
  "style_distribution": { "IPA": 15, "Lager": 10 },
  "rating_distribution": { "1": 0, "2": 2, "3": 5, "4": 20, "5": 15 },
  "monthly_counts": [{ "month": "2025-03", "count": 12 }]
}
```

Returns `{}` if no ratings. From `user_enhanced_stats` RPC. **Style family contract:** `favorite_style` and `style_distribution` keys/values use the 9 canonical style families (IPA, Pale Ale, Lager, Stout, Porter, Wheat, Pilsner, Sour, Belgian); counts are aggregated by family.

Note: This has different field names than `GET /api/users/:id/stats` (e.g. `average_rating` vs `avg_rating`, `unique_beers` vs absent, `monthly_counts` vs `monthly_activity`).

**Error Responses:**
- 500: `{ "error": "Failed to fetch stats" }`

---

#### GET /api/stats/:userId

- **Auth:** none
- **File:** `server.js`

**URL Params:** `userId` — user ID

**Success Response (200):** Same shape as `GET /api/stats/me`.

---

#### GET /api/stats

- **Auth:** `softAuthMiddleware` (optional)
- **File:** `server.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `crew_id` | string | — | Optional; auth required when present |
| `limit` | number | 50 | 1–100 |
| `offset` | number | 0 | >= 0 |

**Success Response (200) — with `crew_id`:**

```json
{
  "data": [
    {
      "beer_name": "string",
      "brewery": "string",
      "style": "string",
      "review_count": 5,
      "avg_rating": 4.2,
      "last_reviewed": "ISO8601"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 25 },
  "summary": { "totalBeers": 25, "totalReviews": 100, "totalUsers": 4 }
}
```

**Success Response (200) — without `crew_id`:**

```json
{
  "data": [
    {
      "beer_name": "string",
      "brewery": "string",
      "style": "string",
      "review_count": 50,
      "avg_rating": 4.2,
      "avg_yg_value": 3.5,
      "avg_hoppy": 3.1,
      "avg_malty": 2.0,
      "avg_bitter": 2.5,
      "avg_sweet": 1.8,
      "avg_fruity": 2.2,
      "last_reviewed": "ISO8601"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 200 },
  "summary": { "totalBeers": 200, "totalReviews": 5000, "totalUsers": 50 }
}
```

Note: Crew stats rows do NOT include `avg_yg_value` or flavor averages.

**Error Responses:**
- 401: `{ "error": "Authentication required for crew stats" }`

---

### Beers

#### GET /api/beers

- **Auth:** none
- **File:** `routes/beers.js`

**Query Params — with `q` (catalog search):**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `q` | string | — | Search query |
| `limit` | number | 10 | 1–50 |

**Success Response (200) — with `q`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "brewery_name": "string",
      "style": "string",
      "abv": 5.5,
      "review_overall": 4.2,
      "review_count": 12,
      "source": "string",
      "similarity_score": 0.95
    }
  ],
  "pagination": { "limit": 10, "offset": 0, "total": 5 }
}
```

**Query Params — without `q` (beer_averages list):**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `limit` | number | 50 | 1–100 |
| `offset` | number | 0 | >= 0 |
| `sort` | string | `"avg_rating"` | One of: `beer_name`, `avg_rating`, `review_count`, `last_reviewed`, `avg_yg_value` |
| `order` | string | `"desc"` | `"asc"` or `"desc"` |

**Success Response (200) — without `q`:**

```json
{
  "data": [
    {
      "beer_name": "string",
      "brewery": "string",
      "style": "string",
      "review_count": 25,
      "avg_rating": 4.2,
      "avg_yg_value": 3.5,
      "avg_hoppy": 3.1,
      "avg_malty": 2.0,
      "avg_bitter": 2.5,
      "avg_sweet": 1.8,
      "avg_fruity": 2.2,
      "last_reviewed": "ISO8601"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 150 }
}
```

---

#### GET /api/beers/search

- **Auth:** none
- **File:** `routes/beers.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `q` | string | — | Search query; returns empty if blank |
| `limit` | number | 10 | 1–50 |

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "brewery_name": "string",
      "style": "string",
      "abv": 5.5,
      "review_overall": 4.2,
      "review_count": 12,
      "source": "string",
      "similarity_score": 0.95
    }
  ],
  "pagination": { "limit": 10, "offset": 0, "total": 5 }
}
```

---

#### GET /api/beers/:name

- **Auth:** none
- **File:** `routes/beers.js`

**URL Params:** `name` — beer name (URL-decoded)

**Success Response (200):**

```json
{
  "beer_name": "IPA Name",
  "stats": {
    "beer_name": "string",
    "brewery": "string",
    "style": "string",
    "review_count": 25,
    "avg_rating": 4.2,
    "avg_yg_value": 3.5,
    "avg_hoppy": 3.1,
    "avg_malty": 2.0,
    "avg_bitter": 2.5,
    "avg_sweet": 1.8,
    "avg_fruity": 2.2,
    "last_reviewed": "ISO8601"
  },
  "ratings": [
    { "...rating row fields..." }
  ],
  "price_history": [
    {
      "id": "uuid",
      "venue_id": "uuid",
      "beer_name": "string",
      "price_cents": 600,
      "logged_at": "ISO8601"
    }
  ]
}
```

`stats` is a single `beer_averages` row or `null`. `ratings` contains all ratings for the beer. `price_history` up to 100 rows from `price_logs`.

---

### Exchange

#### GET /api/exchange/rates

- **Auth:** none
- **File:** `routes/exchange.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `order_by` | string | `"yg_rate"` | One of: `yg_rate`, `avg_stars`, `rating_count`, `beer_name` |
| `direction` | string | `"desc"` | `"asc"` or `"desc"` |
| `limit` | number | 100 | 1–100 |
| `offset` | number | 0 | >= 0 |
| `q` | string | — | Optional search |

**Success Response (200):** FLAT ARRAY (no `data` wrapper, no `pagination`):

```json
[
  {
    "beer_name": "string",
    "brewery": "string",
    "style": "string",
    "rating_count": 50,
    "yg_rate": 4.5,
    "avg_stars": 4.2,
    "yg_low": 3.0,
    "yg_high": 5.0
  }
]
```

---

#### GET /api/exchange

- **Auth:** none
- **File:** `routes/exchange.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `limit` | number | 50 | 1–100 |
| `offset` | number | 0 | >= 0 |

**Success Response (200):**

```json
{
  "data": [
    {
      "beer_name": "string",
      "brewery": "string",
      "style": "string",
      "rating_count": 50,
      "yg_rate": 4.5,
      "avg_stars": 4.2,
      "yg_low": 3.0,
      "yg_high": 5.0
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 200 }
}
```

---

#### GET /api/exchange/portfolio/:user_id

- **Auth:** none
- **File:** `routes/exchange.js`

**URL Params:** `user_id` — user ID

**Success Response (200):** FLAT ARRAY (no `data` wrapper):

```json
[
  {
    "beer_name": "string",
    "brewery": "string",
    "style": "string",
    "user_yg_value": 4.0,
    "community_yg_rate": 4.2,
    "user_rating": 4,
    "rated_at": "ISO8601"
  }
]
```

---

#### GET /api/exchange/:beer_name

- **Auth:** none
- **File:** `routes/exchange.js`

**URL Params:** `beer_name` — beer name (URL-decoded)

**Success Response (200):**

```json
{
  "beer": {
    "beer_name": "string",
    "brewery": "string",
    "style": "string",
    "rating_count": 50,
    "yg_rate": 4.5,
    "avg_stars": 4.2,
    "yg_low": 3.0,
    "yg_high": 5.0
  },
  "cross_rates": [
    {
      "beer_name": "string",
      "brewery": "string",
      "yg_rate": 4.8,
      "cross_rate": 0.9375
    }
  ]
}
```

`cross_rate` = `ygA / ygB`; `null` when `ygB` is 0.

**Error Responses:**
- 404: `{ "error": "Beer not found in YG exchange" }`

---

### Venues

#### GET /api/venues

- **Auth:** none
- **File:** `routes/venues.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `lat` | float | — | Optional (enables radius search) |
| `lng` | float | — | Optional (enables radius search) |
| `radius` | number | 5000 | Meters (only with lat/lng) |
| `limit` | number | 50 | 1–100 |
| `offset` | number | 0 | >= 0 |

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "address": "string",
      "latitude": 40.123,
      "longitude": -74.456,
      "venue_type": "string",
      "created_by": "string",
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 100 }
}
```

---

#### POST /api/venues

- **Auth:** `authMiddleware` (required)
- **File:** `routes/venues.js`

**Request Body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` / `venueName` | string | yes | — |
| `latitude` / `lat` | number | yes | — |
| `longitude` / `lng` | number | yes | — |
| `address` | string | no | — |

**Success Response (201):**

```json
{
  "id": "uuid",
  "name": "string",
  "address": "string",
  "latitude": 40.123,
  "longitude": -74.456,
  "created_by": "string",
  "created_at": "ISO8601"
}
```

**Error Responses:**
- 400: `{ "error": "name, latitude, and longitude required" }`

---

#### GET /api/venues/:id

- **Auth:** none
- **File:** `routes/venues.js`

**URL Params:** `id` — venue UUID

**Success Response (200):**

```json
{
  "id": "uuid",
  "name": "string",
  "address": "string",
  "latitude": 40.123,
  "longitude": -74.456,
  "venue_type": "string",
  "created_by": "string",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "venue": {
    "id": "uuid",
    "name": "string",
    "address": "string",
    "latitude": 40.123,
    "longitude": -74.456,
    "venue_type": "string",
    "created_by": "string",
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  },
  "prices": [
    {
      "id": "uuid",
      "venue_id": "uuid",
      "beer_name": "string",
      "style": "string",
      "price_cents": 600,
      "is_happy_hour": false,
      "logged_by": "string",
      "logged_at": "ISO8601",
      "confirmed_count": 1,
      "last_confirmed_at": "ISO8601"
    }
  ],
  "happy_hours": [
    {
      "id": "uuid",
      "venue_id": "uuid",
      "day_of_week": 0,
      "start_time": "17:00",
      "end_time": "19:00",
      "description": "string",
      "reported_by": "string",
      "reported_at": "ISO8601",
      "confirmed_count": 1,
      "last_confirmed_at": "ISO8601"
    }
  ],
  "ratings": [
    { "...rating row fields..." }
  ]
}
```

`ratings` limited to 50 most recent.
Top-level venue fields remain present for backward compatibility; `venue` is an added wrapper alias.

**Error Responses:**
- 404: `{ "error": "Venue not found" }`

---

#### GET /api/venues/:id/prices

- **Auth:** none
- **File:** `routes/venues.js`

**URL Params:** `id` — venue UUID

**Query Params:** `limit` (default 50, max 100), `offset` (default 0)

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "venue_id": "uuid",
      "beer_name": "string",
      "style": "string",
      "price_cents": 600,
      "is_happy_hour": false,
      "logged_by": "string",
      "logged_at": "ISO8601",
      "confirmed_count": 1,
      "last_confirmed_at": "ISO8601"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 25 }
}
```

---

#### POST /api/venues/:id/prices

- **Auth:** `authMiddleware` (required)
- **File:** `routes/venues.js`

**URL Params:** `id` — venue UUID

**Request Body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `beer_name` / `beerName` | string | yes | — |
| `price_cents` / `priceCents` | number | yes | Positive integer |
| `style` | string | no | — |
| `is_happy_hour` | boolean | no | — |

**Success Response (201):**

```json
{
  "id": "uuid",
  "venue_id": "uuid",
  "beer_name": "string",
  "style": "string",
  "price_cents": 600,
  "is_happy_hour": false,
  "logged_by": "string",
  "logged_at": "ISO8601"
}
```

**Error Responses:**
- 400: `{ "error": "beer_name and price_cents (positive) required" }`

---

#### POST /api/venues/:id/prices/:priceId/confirm

- **Auth:** `authMiddleware` (required)
- **File:** `routes/venues.js`

**URL Params:** `id` — venue UUID, `priceId` — price log UUID

**Success Response (200):**

```json
{ "ok": true }
```

**Error Responses:**
- 404: `{ "error": "Price log not found" }`

**Side Effects:** Increments `confirmed_count` and updates `last_confirmed_at` on `price_logs`.

---

#### GET /api/venues/:id/happy-hours

- **Auth:** none
- **File:** `routes/venues.js`

**URL Params:** `id` — venue UUID

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "venue_id": "uuid",
      "day_of_week": 0,
      "start_time": "17:00",
      "end_time": "19:00",
      "description": "string",
      "reported_by": "string",
      "reported_at": "ISO8601",
      "confirmed_count": 1,
      "last_confirmed_at": "ISO8601"
    }
  ]
}
```

---

#### POST /api/venues/:id/happy-hours

- **Auth:** `authMiddleware` (required)
- **File:** `routes/venues.js`

**URL Params:** `id` — venue UUID

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `day_of_week` / `dayOfWeek` | number | yes | 0–6 |
| `start_time` / `startTime` | string | yes | — |
| `end_time` / `endTime` | string | yes | — |
| `description` | string | no | Default `""` |

**Success Response (201):**

```json
{
  "id": "uuid",
  "venue_id": "uuid",
  "day_of_week": 0,
  "start_time": "17:00",
  "end_time": "19:00",
  "description": "string",
  "reported_by": "string",
  "reported_at": "ISO8601"
}
```

**Error Responses:**
- 400: `{ "error": "day_of_week (0-6), start_time, end_time, description required" }`

---

#### POST /api/venues/:id/happy-hours/:hhId/confirm

#### PATCH /api/venues/:id/happy-hours/:hhId/confirm

- **Auth:** `authMiddleware` (required)
- **File:** `routes/venues.js`

**URL Params:** `id` — venue UUID, `hhId` — happy hour UUID

Both methods are aliases and return the same response shape.

**Success Response (200):**

```json
{ "ok": true }
```

**Error Responses:**
- 404: `{ "error": "Happy hour not found" }`

---

### Deals

#### GET /api/deals

- **Auth:** none
- **File:** `routes/deals.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `lat` | float | — | Required |
| `lng` | float | — | Required |
| `radius` | number | 5000 | Meters |

**Success Response (200):**

```json
{
  "data": [
    {
      "beer_name": "string",
      "venue": {
        "id": "uuid",
        "name": "string",
        "distance_m": 1200
      },
      "price_cents": 600,
      "is_happy_hour": true,
      "happy_hour_ends_at": "19:00",
      "yg_rate": 4.5,
      "avg_stars": 4.2,
      "yg_per_dollar": 7.5
    }
  ]
}
```

`happy_hour_ends_at` is `null` when not in happy hour.

**Error Responses:**
- 400: `{ "error": "lat and lng query parameters required" }`

---

### Map

#### GET /api/map

- **Auth:** none
- **File:** `routes/map.js`

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "beer_name": "string",
      "brewery": "string",
      "style": "string",
      "user_id": "string",
      "user_name": "string",
      "latitude": 40.123,
      "longitude": -74.457,
      "location_name": "string",
      "venue_id": "uuid | null",
      "venue": {
        "id": "uuid",
        "name": "string",
        "latitude": 40.123,
        "longitude": -74.456
      },
      "rating": 4,
      "created_at": "ISO8601"
    }
  ]
}
```

`latitude`/`longitude` rounded to 3 decimal places. `venue` only present when `venue_id` is set and venue exists.

---

#### GET /api/map/venues

- **Auth:** none
- **File:** `routes/map.js`

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "latitude": 40.123,
      "longitude": -74.456,
      "rating_count": 15,
      "avg_rating": 4.2,
      "unique_beers": 8,
      "last_rated_at": "ISO8601",
      "top_beer": "IPA Name",
      "created_by": "string",
      "created_at": "ISO8601"
    }
  ]
}
```

---

#### GET /api/map/user/:id

- **Auth:** `authMiddleware` (required)
- **File:** `routes/map.js`

**URL Params:** `id` — user ID

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "string",
      "beer_name": "string",
      "latitude": 40.123,
      "longitude": -74.456,
      "created_at": "ISO8601",
      "...other rating fields..."
    }
  ]
}
```

---

### Leaderboard

#### GET /api/leaderboard

- **Auth:** none
- **File:** `routes/leaderboard.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `period` | string | `"alltime"` | One of: `weekly`, `monthly`, `alltime` |
| `crew_id` | string | — | Optional; when present, leaderboard is scoped to that crew |

**Success Response (200):** Custom shape (NOT standard envelope):

```json
{
  "period": "alltime",
  "crew_id": "uuid | null",
  "top_reviewers": [
    {
      "user_id": "string",
      "count": 42,
      "display_name": "string",
      "avatar_url": "string"
    }
  ],
  "top_beers": [
    { "beer_name": "string", "brewery": "string", "count": 25 }
  ],
  "top_yg_values": [
    { "user_id": "string", "total_yg": 150.5 }
  ],
  "most_venues": [
    { "venue_id": "string", "venue_name": "string", "count": 30 }
  ],
  "truncated": false,
  "pagination": { "limit": 10 }
}
```

`display_name` and `avatar_url` on `top_reviewers` come from profile data when available. `truncated` is `true` when aggregation hit the internal max-ratings cap. Response includes `pagination.limit` (top-N per category).

---

### Upload

#### POST /api/upload

#### POST /api/upload/photo

- **Auth:** `authMiddleware` (required)
- **File:** `routes/upload.js`

Both routes are identical.

**Request:** `multipart/form-data` with field name `file` or `photo`.
- Max file size: 10MB
- Accepted types: JPEG, PNG, WebP, HEIC

**Success Response (201):**

```json
{
  "url": "https://api.beerbook.drinksafterwork.net/uploads/userid_timestamp_random.jpg",
  "filename": "userid_timestamp_random.jpg"
}
```

**Error Responses:**
- 400: `{ "error": "No file uploaded (use field name \"file\" or \"photo\")" }`
- 400: `{ "error": "Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed." }`
- 413: `{ "error": "File too large. Maximum size is 10MB." }`

**Async moderation:** Uploaded images may be moderated asynchronously (Google Cloud Vision Safe Search). If content is flagged, the file is removed, profile/rating photo references (`avatar_url`, `photo_url`) are cleared, and the user receives a tab notification with `notification_type: 'photo_removed'`.

---

### Highlights

#### GET /api/highlights/beer-of-the-week

- **Auth:** none
- **File:** `routes/highlights.js`

**Success Response (200) — qualifying beer found:**

```json
{
  "beer": {
    "beer_name": "string",
    "brewery": "string",
    "style": "string",
    "review_count": 5,
    "avg_rating": 4.4,
    "first_reviewed": "ISO8601",
    "first_rated_by": { "user_id": "string", "display_name": "string" } | null,
    "source": "admin" | "auto",
    "headline": "string | null",
    "body": "string | null",
    "photo_url": "string | null",
    "power_score": 1520,
    "comparison_count": 42
  }
}
```

`first_rated_by` is present when the first rater for the selected beer (in the feature window) can be resolved; otherwise `null` (e.g. no ratings, guest-only, or profile unavailable). `source` is `"admin"` when from curated featured_beers, `"auto"` when computed from recent ratings. Phase 5 discovery: `power_score` (global Elo) and `comparison_count` are included when the beer can be matched to the catalog and has Elo data; otherwise `null`.

**Success Response (200) — no qualifying beer:**

```json
{
  "beer": null,
  "message": "No beer with 2+ ratings in the last 7 days"
}
```

---

### Tabs

#### GET /api/tabs/profile

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**Success Response (200):**

```json
{
  "data": {
    "user_id": "string",
    "current_tier": "string",
    "tier_display_name": "string",
    "tier_multiplier": 1.0,
    "seeder_multiplier": 1.0,
    "combined_multiplier": 1.0,
    "is_seeder": false,
    "tab_balance": 0,
    "lifetime_tabs_earned": 0,
    "ratings_this_week": 0,
    "current_streak_weeks": 0,
    "weekly_cap_reached": false,
    "weeks_inactive": 0,
    "week_start": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

`weekly_cap_reached` is computed from current-week `tabs_ledger` `rating_award` row count (Monday 00:00 UTC boundary), not from `ratings_this_week`.
`tab_balance` is sourced from `profiles.tabs_balance` (DB-trigger maintained from `tabs_ledger`), not from `user_tabs_profile.tab_balance`.

**Side Effects:** May create/update `profiles` and `user_tabs_profile`.

---

#### GET /api/tabs/profile/:userId

- **Auth:** none
- **File:** `routes/tabs.js`

**URL Params:** `userId` — user ID

**Success Response (200):** Same shape as `GET /api/tabs/profile`.

**Error Responses:**
- 404: `{ "error": "Tab profile not found" }`

---

#### GET /api/tabs/leaderboard

- **Auth:** none
- **File:** `routes/tabs.js`

**Query Params:**

| Param | Type | Default | Max |
|-------|------|---------|-----|
| `limit` | number | 50 | 200 |
| `offset` | number | 0 | — |
| `period` | string | `alltime` | `weekly \| monthly \| alltime` |
| `crew_id` | string | — | optional; when present, results are restricted to users who are members of that crew |

**Success Response (200):**

```json
{
  "data": [
    {
      "user_id": "string",
      "display_name": "string",
      "avatar_url": "string | null",
      "equipped_border_asset_url": "string | null",
      "equipped_border_fit": "object | null",
      "current_tier": "string",
      "is_seeder": false,
      "tab_balance": 0,
      "lifetime_tabs_earned": 0,
      "current_streak_weeks": 0,
      "tier_display_name": "string",
      "tier_multiplier": 1.0,
      "rating_count": 42,
      "avg_rating": 4.2,
      "total_cheers": 15,
      "rank": 1
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 100 }
}
```

Profile/cosmetics fields (`avatar_url`, `equipped_border_asset_url`, `equipped_border_fit`, `equipped_avatar_asset_url`) are included for both global and crew-filtered leaderboards. For profile picture display use `equipped_avatar_asset_url ?? avatar_url`. `equipped_border_fit` is the border cosmetic’s fit metadata when present.

`period` only affects `rating_count`, `avg_rating`, and `total_cheers`:
- `weekly`: current week starting Monday 00:00 UTC
- `monthly`: current calendar month
- `alltime`: no time filter

Ranking and sort order remain based on `lifetime_tabs_earned desc`. When `crew_id` is provided, only crew members appear and `pagination.total` reflects the crew size (users with a tabs profile).

---

#### GET /api/tabs/history

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**Query Params:** `limit` (default 50, max 200), `offset` (default 0)

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "string",
      "transaction_type": "string",
      "amount": 0,
      "earn_source": "string",
      "base_amount": 0,
      "tier_multiplier": 1.0,
      "seeder_multiplier": 1.0,
      "rating_id": "string | null",
      "related_entity_id": "string | null",
      "created_at": "ISO8601"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 200 }
}
```

Read source is `tabs_ledger`; rows are mapped into a legacy transaction response shape for API compatibility.

---

#### GET /api/tabs/notifications

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**Query Params:** `limit` (default 50, max 200), `offset` (default 0)

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "string",
      "user_id": "string",
      "notification_type": "string",
      "title": "string",
      "message": "string",
      "metadata": {},
      "is_read": false,
      "created_at": "ISO8601",
      "target_type": "beer|user|crew|achievement|tabs_profile|null",
      "target_id": "string|null"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 30 },
  "metadata": { "unread_count": 5 },
  "notifications": [ "… same shape as data …" ],
  "unread_count": 5
}
```

**Notification action contract (Phase 3.4):** Each notification may include `target_type` and `target_id`. When present, the client should use them to navigate on press (e.g. `tabs_profile` + user id → tabs profile screen; `beer` + submission id → submission/beer detail). Legacy notifications have `target_type`/`target_id` null; treat as mark-read-only.

Mobile aliases: `notifications` mirrors `data`, and `unread_count` mirrors `metadata.unread_count`.

---

#### PATCH /api/tabs/notifications/:id/read

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**URL Params:** `id` — notification ID

**Success Response (200):**

```json
{
  "data": {
    "id": "string",
    "user_id": "string",
    "notification_type": "string",
    "title": "string",
    "message": "string",
    "metadata": {},
    "is_read": true,
    "created_at": "ISO8601",
    "target_type": "beer|user|crew|achievement|tabs_profile|null",
    "target_id": "string|null"
  }
}
```

**Error Responses:**
- 404: `{ "error": "Notification not found" }`

---

#### PATCH /api/tabs/notifications/read-all

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**Success Response (200):**

```json
{ "ok": true }
```

---

#### POST /api/tabs/submissions

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `beer_name` | string | yes |
| `brewery` | string | no |
| `style` | string | no |
| `abv` | number | no |
| `notes` | string | no |

**Success Response (201):**

```json
{
  "data": {
    "id": "string",
    "submitted_by": "string",
    "beer_name": "string",
    "brewery": "string | null",
    "style": "string | null",
    "abv": "number | null",
    "notes": "string | null",
    "status": "pending",
    "reviewed_by": "string | null",
    "reviewed_at": "string | null",
    "review_notes": "string | null",
    "created_beer_id": "string | null",
    "tabs_awarded": false,
    "created_at": "ISO8601"
  }
}
```

**Error Responses:**
- 400: `{ "error": "beer_name is required" }`

---

#### GET /api/tabs/submissions

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "string",
      "submitted_by": "string",
      "beer_name": "string",
      "brewery": "string | null",
      "style": "string | null",
      "abv": "number | null",
      "notes": "string | null",
      "status": "string",
      "reviewed_by": "string | null",
      "reviewed_at": "string | null",
      "review_notes": "string | null",
      "created_beer_id": "string | null",
      "tabs_awarded": false,
      "created_at": "ISO8601"
    }
  ]
}
```

---

### Achievements

#### GET /api/achievements

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**Query Params:**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `user_id` | string | no | Optional target profile user id. Defaults to authenticated user. |

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "achievement_id": "uuid",
      "key": "string",
      "name": "string",
      "tier": "easy | medium | hard | string | null",
      "description": "string",
      "reward_tabs": 0,
      "earned_at": "ISO8601 | null",
      "icon_url": "string | null"
    }
  ]
}
```

When `user_id` differs from the authenticated user, response remains the same shape but returns only public achievement metadata for that profile's unlocked achievements (for example `name`, `icon_url`, `tier`). In that foreign-profile mode, `earned_at` is returned as `null`.

---

#### GET /api/achievements/next

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**Success Response (200):**

```json
{
  "data": {
    "id": "uuid",
    "key": "string",
    "name": "string",
    "description": "string",
    "progress_current": 0,
    "progress_target": 10,
    "remaining": 10,
    "icon_url": "string | null",
    "is_fallback": false
  }
}
```

Returns `{ "data": null }` when no next achievement.

---

#### GET /api/achievements/fallback

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**Success Response (200):**

```json
{
  "id": "uuid",
  "key": "string",
  "name": "string",
  "description": "string",
  "progress_current": 0,
  "progress_target": 10,
  "remaining": 10,
  "icon_url": "string | null",
  "is_fallback": true,
  "reason": "fallback_random"
}
```

Note: Response is NOT wrapped in `{ data: ... }` — returned flat.

Rating-based fallback progress evaluates ratings table columns `notes`, `rating`, and `price_cents`.
Legacy achievement rule keys such as `review_min_len`, `stars_gte`/`stars_lte`, and `price` are still supported and mapped to those ratings columns.

**Success Response (204):** No body (no candidates available).

---

### Cosmetics

#### GET /api/cosmetics

- **Auth:** `softAuthMiddleware` (optional)
- **File:** `routes/tabs.js`

**Response envelope:** The list is always under the top-level key `data` (array). Frontends should read `response.data` for the catalog.

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "key": "string",
      "type": "string",
      "name": "string",
      "description": "string",
      "rarity": "string",
      "asset_url": "string",
      "preview_asset_url": "string",
      "title_text": "string",
      "unlock_type": "string",
      "achievement_key": "string",
      "achievement_hidden": false,
      "achievement_progress_current": 0,
      "achievement_progress_target": 10,
      "tab_price": 0,
      "active": true,
      "sort_order": 0,
      "border_fit": "object | null",
      "created_at": "ISO8601",
      "is_owned": false,
      "is_equipped": false
    }
  ]
}
```

- **`border_fit`:** Optional per-border fit metadata (scale, rotationDeg, offsetX, offsetY, optional avatarScale); only present for border cosmetics. `null` or omitted means use app default.
- **`is_owned`:** When the request is authenticated, `true` if the user has this cosmetic in `user_cosmetics`; otherwise `false`. When unauthenticated, always `false`.
- **`is_equipped`:** When authenticated, `true` if this cosmetic is the user's equipped border, title, or avatar; otherwise `false`. Catalog and inventory include cosmetics with `type: 'avatar'`.

Additional cosmetic achievement fields:

| Field | Type | Notes |
|-------|------|-------|
| `achievement_hidden` | boolean | `true` when linked achievement is hidden (`achievements.is_hidden`); `false` for visible or non-achievement cosmetics. |
| `achievement_progress_current` | number \| null | Current authenticated user progress from `user_achievements.progress`; `null` when unauthenticated, no link, or no progress row. |
| `achievement_progress_target` | number \| null | Target parsed from achievement `rules` (`target`, `gte`, then `count` fallback); `null` when no achievement link. |

---

#### GET /api/users/:id/cosmetics

- **Auth:** none
- **File:** `routes/tabs.js`

**URL Params:** `id` — user ID

**Response envelope:** The list is always under the top-level key `data` (array). Frontends should read `response.data` for the user's inventory. Every item in this list is owned by the user; each item includes `is_owned: true`.

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "key": "string",
      "type": "string",
      "name": "string",
      "description": "string",
      "rarity": "string",
      "asset_url": "string | null",
      "preview_asset_url": "string | null",
      "title_text": "string | null",
      "border_fit": "object | null",
      "acquired_via": "string",
      "acquired_at": "ISO8601",
      "is_owned": true,
      "is_equipped": true
    }
  ]
}
```

- **`border_fit`:** Per-border fit metadata when present on the cosmetic; `null` when not set.

**Error Responses:**
- 400: `{ "error": "Missing user id" }`

**Cosmetics frontend integration (inventory and catalog):**
- Both endpoints return the list under **`data`** only: `{ "data": [ ... ] }`. Do not expect `user_cosmetics`, `inventory`, or `result`.
- Fields use **snake_case**: `is_owned`, `is_equipped`, `acquired_via`, `acquired_at`.
- Inventory: every element has `is_owned: true`; filter or count by `item.is_owned` to include all.
- Catalog: when authenticated, each item has `is_owned` and `is_equipped` set from `user_cosmetics` and profile. If the app shows "0 owned", ensure the catalog parser reads `response.data` and that owned count uses `item.is_owned === true`.

---

#### POST /api/cosmetics/purchase

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**Request Body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `cosmetic_key` | string | yes* | *Or `cosmetic_id` for backward compatibility |
| `cosmetic_id` | string | no | UUID; fallback if `cosmetic_key` not provided |

**Success Response (200):**

```json
{
  "data": {
    "cosmetic_id": "uuid",
    "cosmetic_key": "string",
    "acquired_via": "purchase",
    "tabs_spent": 20,
    "tabs_balance": 80
  }
}
```

**Error Responses:**
- 400: `{ "error": "cosmetic_key is required (or cosmetic_id for backward compatibility)" }`
- 400: `{ "error": "Invalid cosmetic_id" }`
- 409: `{ "error": "Already owned", "error_code": "already_owned", "tabs_balance": 100, "tab_price": 20 }`
- 409: `{ "error": "Insufficient tab balance", "error_code": "insufficient_balance", "tabs_balance": 5, "tab_price": 20 }`
- 502: `{ "error": "Purchase failed" }`

---

#### POST /api/cosmetics/equip

- **Auth:** `authMiddleware` (required)
- **File:** `routes/tabs.js`

**Request Body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `cosmetic_id` | string or null | yes | UUID to equip, `null` to unequip |
| `slot` | string | conditional | Required when `cosmetic_id` is null: `"border"`, `"title"`, or `"avatar"` |

**Success Response (200) — equip:**

```json
{
  "data": {
    "slot": "border",
    "cosmetic_id": "uuid",
    "equipped_border_id": "uuid | null",
    "equipped_title_id": "uuid | null",
    "equipped_avatar_id": "uuid | null"
  }
}
```

**Success Response (200) — unequip:**

```json
{
  "data": {
    "slot": "avatar",
    "cosmetic_id": null,
    "equipped_border_id": "uuid | null",
    "equipped_title_id": "uuid | null",
    "equipped_avatar_id": null
  }
}
```

**Error Responses:**
- 400: `{ "error": "slot must be 'border', 'title', or 'avatar' when cosmetic_id is null" }`
- 400: `{ "error": "cosmetic_id must be a UUID or null" }`
- 400: `{ "error": "Invalid cosmetic_id" }`
- 400: `{ "error": "Cosmetic is inactive" }`
- 400: `{ "error": "Cosmetic has unsupported type" }`
- 400: `{ "error": "Cosmetic type must match slot '...'" }`
- 400: `{ "error": "Cosmetic is not owned by user" }`
- 400: `{ "error": "Failed to update profile" }`
- 404: `{ "error": "Profile not found" }`

---

### Follows

#### POST /api/follows/:userId

- **Auth:** `authMiddleware` (required)
- **File:** `routes/follows.js`

**URL Params:** `userId` — target user ID

**Request Body:** None.

**Success Response (200) — now following:**

```json
{ "following": true, "is_following": true }
```

**Success Response (200) — unfollowed:**

```json
{ "following": false, "is_following": false }
```

This is a toggle endpoint.

**Error Responses:**
- 400: `{ "error": "Target user is required" }`
- 400: `{ "error": "Cannot follow yourself" }`
- 502: `{ "error": "Unfollow failed" }`
- 502: `{ "error": "Follow failed" }` - upstream follow insert failed

---

#### GET /api/follows/:userId/followers

- **Auth:** none
- **File:** `routes/follows.js`

**URL Params:** `userId` — user ID

**Query Params:** `limit` (default 50, max 100), `offset` (default 0)

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "string",
      "display_name": "string",
      "avatar_url": "string | null",
      "rating_count": 0
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 10 }
}
```

---

#### GET /api/follows/:userId/following

- **Auth:** none
- **File:** `routes/follows.js`

**URL Params:** `userId` — user ID

**Query Params:** `limit` (default 50, max 100), `offset` (default 0)

**Success Response (200):** Same shape as followers.

---

#### GET /api/follows/:userId/status

- **Auth:** `authMiddleware` (required)
- **File:** `routes/follows.js`

**URL Params:** `userId` — target user ID

**Success Response (200):**

```json
{ "is_following": true }
```

> **Note:** If `userId` is empty or blank, returns `{ "is_following": false }` without error.

---

### Crews

#### POST /api/crews

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | yes | Max 50 chars |

**Success Response (201):**

```json
{
  "id": "uuid",
  "name": "string",
  "created_by": "string",
  "invite_code": "string",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

**Error Responses:**
- 400: `{ "error": "Crew name is required" }`
- 400: `{ "error": "Crew name must be 50 chars or fewer" }`

**Side Effects:** Inserts into `crews` and `crew_members` (owner role).

---

#### GET /api/crews

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "created_by": "string",
      "invite_code": "string",
      "created_at": "ISO8601",
      "member_count": 5,
      "my_role": "owner",
      "member_user_ids": ["string"]
    }
  ]
}
```

---

#### GET /api/crews/:id

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**URL Params:** `id` — crew UUID

**Success Response (200):**

```json
{
  "id": "uuid",
  "name": "string",
  "created_by": "string",
  "invite_code": "string",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "my_role": "owner",
  "member_count": 5,
  "members": [
    {
      "user_id": "string",
      "role": "owner",
      "joined_at": "ISO8601",
      "display_name": "string",
      "avatar_url": "string | null",
      "current_tier": "string | null",
      "profile": {
        "id": "string",
        "display_name": "string",
        "avatar_url": "string | null"
      },
      "rating_count": 42
    }
  ],
  "stats": {
    "total_ratings": 200,
    "avg_rating": 4.1,
    "most_popular_style": "IPA",
    "favorite_style_name": "IPA",
    "top_beer": "Beer Name",
    "venues_visited_count": 12,
    "members_on_streak_count": 3
  },
  "weekly_challenge": {
    "challenge": { "id": "uuid", "title": "string", "description": "string", "target_style": "string | null", "target_count": 10, "reward_label": "string", "reward_badge_id": "uuid | null", "week_start": "ISO8601", "week_end": "ISO8601" } | null,
    "progress": { "current_count": 6, "target_count": 10, "contributing_member_count": 4 } | null
  }
}
```

`weekly_challenge` is populated when the current week has an active challenge; otherwise `challenge` and `progress` may be null. **Style family:** `stats.most_popular_style` and `stats.favorite_style_name` are one of the 9 canonical style families.

**Error Responses:**
- 403: `{ "error": "Crew access denied" }`
- 404: `{ "error": "Crew not found" }`

---

#### GET /api/crews/:id/challenge

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**URL Params:** `id` — crew UUID

**Success Response (200):**

```json
{
  "challenge": {
    "id": "uuid",
    "title": "string",
    "description": "string",
    "target_style": "string | null",
    "target_count": 10,
    "reward_label": "string",
    "reward_badge_id": "uuid | null",
    "week_start": "ISO8601",
    "week_end": "ISO8601"
  },
  "progress": {
    "current_count": 6,
    "target_count": 10,
    "contributing_member_count": 4
  }
}
```

When no active challenge for the current week: `challenge` and `progress` are null.

**Error Responses:**
- 403: `{ "error": "Crew access denied" }`
- 502: upstream body or `{ "error": "Upstream error" }`

---

#### GET /api/crews/:id/milestones

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**URL Params:** `id` — crew UUID

**Query Params:** `limit` (default 20, max 100), `offset` (default 0)

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "type": "crew_total_ratings | first_venue_visit | member_streak | leaderboard_rank",
      "occurred_at": "ISO8601",
      "user_id": "string | undefined",
      "user_display_name": "string | null",
      "data": { "total_ratings": 75, "threshold": 75 } | { "venue_id": "uuid", "venue_name": "string" } | { "streak_weeks": 5 } | { "rank": 1, "leaderboard_type": "string" } | undefined,
      "message": "string | undefined"
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "total": 42 }
}
```

Sorted by `occurred_at` desc.

**Error Responses:**
- 403: `{ "error": "Crew access denied" }`
- 502: upstream body or `{ "error": "Upstream error" }`

---

#### GET /api/crews/:id/trending

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**URL Params:** `id` — crew UUID

**Query Params:** `days` (default 7, clamped 1–90), `limit` (default 10, clamped 1–50)

**Success Response (200):**

```json
{
  "data": [
    {
      "beer_id": "uuid | null",
      "beer_name": "string | null",
      "style": "string | null",
      "brewery": "string | null",
      "rating_count": 8,
      "avg_rating": 4.25
    }
  ],
  "pagination": { "limit": 10, "total": 25, "days": 7 }
}
```

Beers ranked by rating count within the crew over the given `days`. Empty crew returns `{ data: [], pagination: { limit, total: 0 } }`.

**Error Responses:**
- 403: `{ "error": "Crew access denied" }`
- 502: upstream body or `{ "error": "Upstream error" }`

---

#### GET /api/crews/:id/style-counts

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**URL Params:** `id` — crew UUID

**Success Response (200):** Plain object (**style family** → count). Keys are the 9 canonical families (IPA, Pale Ale, Lager, Stout, Porter, Wheat, Pilsner, Sour, Belgian) or "Unknown". Counts are aggregated by family, e.g.:

```json
{
  "IPA": 45,
  "Lager": 12,
  "Stout": 8,
  "Unknown": 3
}
```

Empty crew returns `{}`.

**Error Responses:**
- 403: `{ "error": "Crew access denied" }`
- 502: upstream body or `{ "error": "Upstream error" }`

---

#### PATCH /api/crews/:id

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**URL Params:** `id` — crew UUID

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | yes | Max 50 chars |

**Success Response (200):**

```json
{
  "id": "uuid",
  "name": "string",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

**Error Responses:**
- 400: `{ "error": "Crew name is required" }`
- 400: `{ "error": "Crew name must be 50 chars or fewer" }`
- 403: `{ "error": "Owner access required" }`

---

#### DELETE /api/crews/:id

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**URL Params:** `id` — crew UUID

**Success Response (204):** No body.

**Error Responses:**
- 403: `{ "error": "Owner access required" }`
- 502: `{ "error": "Delete failed" }` - upstream delete failed

---

#### POST /api/crews/:id/regenerate-code

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**URL Params:** `id` — crew UUID

**Success Response (200):**

```json
{ "invite_code": "string" }
```

**Error Responses:**
- 403: `{ "error": "Owner access required" }`
- 500: `{ "error": "Failed to regenerate invite code" }`

---

#### POST /api/crews/join

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `invite_code` | string | yes (case-insensitive) |

**Success Response (201):**

```json
{
  "id": "uuid",
  "name": "string",
  "created_by": "string",
  "invite_code": "string",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

**Error Responses (structured with `error_code`):**
- 400: `{ "error_code": "INVITE_REQUIRED", "error": "Invite code is required", "request_id": "..." }`
- 403: `{ "error_code": "CREW_FULL", "error": "Crew is full (50/50)", "request_id": "..." }`
- 404: `{ "error_code": "CREW_NOT_FOUND", "error": "Crew not found", "request_id": "..." }`
- 409: `{ "error_code": "ALREADY_MEMBER", "error": "Already a member", "request_id": "..." }`
- 502: `{ "error_code": "UPSTREAM_ERROR", "error": "...", "request_id": "..." }` - upstream service returned a 5xx
- 502: `{ "error_code": "JOIN_FAILED", "error": "...", "request_id": "..." }` - join insert failed at upstream

---

#### DELETE /api/crews/:id/members/:userId

- **Auth:** `authMiddleware` (required)
- **File:** `routes/crews.js`

**URL Params:** `id` — crew UUID, `userId` — user ID to remove

**Success Response (204):** No body.

**Error Responses:**
- 400: `{ "error": "Owner cannot leave crew. Delete crew instead." }`
- 403: `{ "error": "Crew access denied" }` or `{ "error": "Owner access required" }`
- 502: `{ "error": "Remove member failed" }` - upstream delete failed

**Side Effects:** Deletes from `crew_members`. If last member, deletes the crew.

---

### Push

#### POST /api/push/register

- **Auth:** `authMiddleware` (required)
- **File:** `routes/push.js`

Registers or refreshes a device Expo push token for the authenticated user.

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `expo_push_token` | string | yes | Must match Expo format (`ExponentPushToken[...]`) |
| `platform` | string | yes | `ios` or `android` |
| `device_id` | string | no | Device-stable identifier; recommended for replacement semantics |
| `app_version` | string | no | App version string |

**Canonical Request Example:**

```json
{
  "expo_push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "ios",
  "device_id": "ios-device-8d7f4",
  "app_version": "1.4.0"
}
```

**Success Response (200):**

```json
{
  "registered": true,
  "token": {
    "id": "uuid",
    "user_id": "string",
    "expo_push_token": "ExponentPushToken[...]",
    "platform": "ios|android",
    "device_id": "string|null",
    "app_version": "string|null",
    "is_active": true,
    "last_seen_at": "ISO8601",
    "updated_at": "ISO8601",
    "created_at": "ISO8601"
  }
}
```

When the Postgres unique constraint fires and PostgREST returns **`409`** with body **`code` `"23505"`** (`unique_violation`), the handler reconciles and may still respond **200**:

1. `GET` the row by **`expo_push_token`** (same `select` as upsert). If it exists and **`user_id`** matches the JWT subject → **`200`** with **`already_registered: true`** and that **`token`**.
2. Else if **`device_id`** was sent: `GET` active row for **`user_id`** (caller) + **`device_id`** + **`is_active=true`**. If found → **`200`** with **`already_registered: true`** and that **`token`** (covers races on the partial unique index for one active row per device).
3. If the row for the submitted **`expo_push_token`** exists but **`user_id`** differs from the caller, the conflict is **not** coerced to success (token is tied to another account).

Idempotent success shape:

```json
{
  "registered": true,
  "already_registered": true,
  "token": { }
}
```

After a normal upsert with no conflict, **`already_registered`** is omitted.

**Error Responses:**
- 400: `{ "error": "expo_push_token is required" }`
- 400: `{ "error": "expo_push_token is invalid" }`
- 400: `{ "error": "platform must be ios or android" }`
- 401/403: standard auth failures from `authMiddleware`
- 409: PostgREST error body (e.g. `code`, `message`) when upsert fails and reconciliation finds no safe row, or when the existing token row belongs to another user

**Idempotency / Semantics:**
- Re-registering the same `expo_push_token` is safe and upserts the same row.
- Re-registering an inactive token reactivates it: `is_active=true`, `deactivated_at=null`, `deactivation_reason=null`.
- `updated_at` and `last_seen_at` refresh on each successful register.
- Ownership is bound to the currently authenticated user (`req.claims.sub`) and is updated on upsert.
- If `device_id` is provided, existing active token(s) for the same `(user_id, device_id)` are deactivated with reason `replaced_by_new_registration` before upsert.

---

#### POST /api/push/unregister

- **Auth:** `authMiddleware` (required)
- **File:** `routes/push.js`

Deactivates the specified Expo push token for the authenticated user.

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `expo_push_token` | string | yes |

**Canonical Request Example:**

```json
{
  "expo_push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

**Success Response (200):**

```json
{
  "unregistered": true,
  "already_unregistered": false
}
```

`already_unregistered` is `true` when no active token row matched `(user_id, expo_push_token)` (idempotent no-op).

**Error Responses:**
- 400: `{ "error": "expo_push_token is required" }`
- 401/403: standard auth failures from `authMiddleware`

**Idempotency / Semantics:**
- Repeated calls are safe; inactive/missing token for the caller still returns success.
- Deactivation is scoped to the authenticated `user_id` and does not deactivate another user's token.
- On active match, token state becomes `is_active=false`, `deactivated_at=<now>`, `deactivation_reason='user_unregistered'`.

#### Push Delivery Contract (Expo worker)

- **Dispatcher script:** `scripts/push-dispatch.js`
- **Eligibility gate:** `lib/pushEligibility.js` with effective allowlist from `lib/pushAllowlistStore.js` (PostgREST: catalog + admin toggles + optional `PUSH_ALLOWLIST_EXTRA` capped to catalog). Unknown types remain in-app only (fail-closed).

**Outbound payload shape to Expo:**

```json
{
  "to": "ExponentPushToken[...]",
  "sound": "default",
  "title": "Notification title",
  "body": "Notification message",
  "data": {
    "notification_id": "string",
    "notification_type": "string",
    "target_type": "beer|user|crew|achievement|tabs_profile|null",
    "target_id": "string|null"
  }
}
```

**Canonical push payload delivered to the app (`data` keys are frozen for frontend consumption):**

```json
{
  "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "sound": "default",
  "title": "Streak at risk",
  "body": "You need 1 more rating this week to maintain your tier activity minimum.",
  "data": {
    "notification_id": "notif_01JXXXXXX",
    "notification_type": "streak_at_risk",
    "target_type": "tabs_profile",
    "target_id": "user_01HXXXXXX"
  }
}
```

**Frontend frozen field names (do not rename):**
- Top-level: `to`, `sound`, `title`, `body`, `data`
- `data` object: `notification_id`, `notification_type`, `target_type`, `target_id`

**Notification Type Matrix (current backend producers):**

| Producer | Source file | `notification_type` | Default target | Push eligibility |
|----------|-------------|---------------------|----------------|------------------|
| Mid-week streak risk scheduler | `scripts/streak-risk-check.js` | `streak_at_risk` | `tabs_profile` + user id | Yes (allowlisted) |
| Mid-week streak risk scheduler | `scripts/streak-risk-check.js` | `approaching_demotion` | `tabs_profile` + user id | Yes (allowlisted) |
| Weekly tier evaluation scheduler | `scripts/weekly-tabs-eval.js` | `tier_promotion` | `tabs_profile` + user id | Yes (allowlisted) |
| Weekly tier evaluation scheduler | `scripts/weekly-tabs-eval.js` | `tier_demotion` | `tabs_profile` + user id | No (in-app only) |
| Admin seeder grant | `routes/tabs.js` | `seeder_granted` | `tabs_profile` + user id | No (in-app only) |
| Admin submission review | `routes/tabs.js` | `beer_approved` | `beer` + submission id | Yes (allowlisted) |
| Admin submission review | `routes/tabs.js` | `beer_rejected` | `beer` + submission id | No (in-app only) |
| Async upload moderation | `lib/uploadModeration.js` | `photo_removed` | `tabs_profile` + user id | No (in-app only) |

**Push allowlist (effective):** Rows in `push_notification_catalog` with `push_notification_push_toggle.push_enabled = true`, plus any `notification_type` listed in `PUSH_ALLOWLIST_EXTRA` that also exists in `push_notification_catalog` (extras outside the catalog are ignored). New catalog types require a **database migration**; admins enable or disable push per catalog row via `GET` / `PATCH /api/admin/push-notification-types`. Matrix column “Yes (allowlisted)” means the type is in the catalog and **may** be pushed when its toggle is on (initial seed has all six types below enabled).

Initial catalog types: `streak_at_risk`, `approaching_demotion`, `tier_promotion`, `tabs_earned`, `beer_approved`, `weekly_summary`.

**Milestone 2 state model:**
- Current state table: `notification_token_push_state` (unique `(notification_id, token_id)` claim/delivery state)
- Immutable attempts: `push_send_attempts` (one row per send attempt)
- `sent_to_expo` means provider ticket accepted only; it is **not** confirmed device delivery
- Terminal states: `receipt_ok`, `permanent_failure`
- Retries: `retryable_failure` with exponential backoff via `next_attempt_at`
- Invalid token handling: provider error `DeviceNotRegistered` deactivates token (`is_active=false`)

**Rollout controls (dispatcher):**
- `PUSH_BATCH_SIZE` (default `50`): max claim/send rows per batch
- `PUSH_MAX_BATCHES` (default `1`): bounded batch loops per invocation (useful for controlled drain runs)
- `PUSH_MAX_RETRY_ATTEMPTS` (default `5`): cap before marking `permanent_failure`
- `PUSH_RETRY_BASE_SECONDS` (default `30`): exponential backoff base for retry scheduling

**Cadence example (narrow rollout):**
- Run `npm run push:dispatch` every 1-2 minutes with `PUSH_BATCH_SIZE=10` and `PUSH_MAX_BATCHES=1` initially.

**Milestone 3 — receipts, telemetry, retention, optional allowlist expansion**

- **Receipt worker:** `scripts/push-receipts.js` (`npm run push:receipts`). Polls Expo [`getReceipts`](https://docs.expo.dev/push-notifications/sending-notifications/#check-push-receipts) for tickets produced after `sent_to_expo`, then transitions pairs to `receipt_ok`, schedules another poll when receipts are not ready, or ends in `permanent_failure` with token deactivation on `DeviceNotRegistered` (same semantics as send-time errors).
- **Dispatch retry hardening:** `PUSH_RETRY_MAX_SECONDS` (default `3600`) caps exponential backoff; `PUSH_RETRY_JITTER_RATIO` (default `0.2`) adds bounded jitter to `next_attempt_at`.
- **Staged allowlist:** set `PUSH_ALLOWLIST_EXTRA` to a comma-separated list of extra `notification_type` values; only types **already present** in `push_notification_catalog` are merged into the effective allowlist (use only after metrics look healthy).
- **Hooks (off by default):** `lib/pushEligibility.js` exports `createNoOpPushHooks()`; pass `preferences` / `quietHours` / `fatigue` functions into `evaluatePushEligibility` when product controls exist. The dispatcher passes no-op hooks so behavior matches v1 until wired.
- **Inactive token retention:** `scripts/push-token-prune.js` (`npm run push:token-prune`) calls `prune_inactive_push_tokens`; use `PUSH_TOKEN_PRUNE_RETENTION_DAYS` (default `90`). Run on a monthly or weekly schedule independent of dispatch.
- **Read-only telemetry (SQL):** for dashboards / ad-hoc queries against Supabase as `service_role`:
  - `push_telemetry_token_summary` — active vs inactive tokens, distinct users with an active token
  - `push_telemetry_delivery_by_status` — counts from `notification_token_push_state.delivery_status`
  - `push_telemetry_attempts_24h` — attempt counts by `push_send_attempts.status` (last 24h)
  - `push_telemetry_deactivations_30d` — deactivated tokens by `deactivation_reason` (last 30d)

**Receipt worker environment**

| Variable | Default | Purpose |
|----------|---------|---------|
| `EXPO_RECEIPTS_URL` | `https://exp.host/--/api/v2/push/getReceipts` | Expo receipts endpoint |
| `PUSH_RECEIPT_BATCH_SIZE` | `50` | Rows claimed per RPC batch |
| `PUSH_RECEIPT_MAX_BATCHES` | `3` | Loop cap per process invocation |
| `PUSH_RECEIPT_PENDING_SECONDS` | `45` | Backoff when a ticket is not ready or transport fails |
| `PUSH_RECEIPT_MIN_AGE_SECONDS` | `15` | Minimum age of `sent_to_expo_at` before first receipt poll |
| `PUSH_RECEIPT_POLL_COOLDOWN_SECONDS` | `20` | Minimum gap between receipt polls for the same pair |

**Cadence example (receipts):** run `npm run push:receipts` every 1–5 minutes behind dispatch so `sent_to_expo` rows converge to `receipt_ok` or a terminal failure.

---

### Tracking

#### POST /api/track/click

- **Auth:** `softAuthMiddleware` (optional)
- **File:** `routes/tracking.js`

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `destination_url` | string | yes | — |
| `target_type` | string | yes | One of: `brewery`, `venue`, `beer`, `external` |
| `target_id` | string | no | — |
| `target_name` | string | no | — |
| `source_page` | string | no | — |
| `source_beer_id` | string | no | — |
| `source_brewery_id` | string | no | — |
| `referrer_path` | string | no | — |

**Success Response (202):**

```json
{ "tracked": true }
```

**Error Responses:**
- 400: `{ "error": "destination_url and target_type required" }`
- 400: `{ "error": "Invalid target_type" }`

**Side Effects:** Inserts into `referral_clicks` (async, fire-and-forget).

---

#### POST /api/track/pageview

- **Auth:** `softAuthMiddleware` (optional)
- **File:** `routes/tracking.js`

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `page_path` | string | yes |
| `session_id` | string | no |
| `referrer_url` | string | no |

**Success Response (202):**

```json
{ "tracked": true }
```

**Error Responses:**
- 400: `{ "error": "page_path required" }`

**Side Effects:** Inserts into `page_views` (async, fire-and-forget).

---

### Admin

All admin routes require `authMiddleware` + `adminMiddleware`.

#### GET /api/admin/users

- **File:** `routes/admin.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `sort` | string | `"last_active"` | One of: `last_active`, `total_ratings`, `created_at` |
| `order` | string | `"desc"` | `"asc"` or `"desc"` |
| `limit` | number | 50 | 1–200 |
| `offset` | number | 0 | >= 0 |
| `search` | string | — | Optional; filters on display_name + email |

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "string",
      "display_name": "string",
      "email": "string | null",
      "created_at": "ISO8601 | null",
      "total_ratings": 0,
      "unique_styles": 0,
      "unique_venues": 0,
      "last_active": "ISO8601 | null",
      "avg_rating": "number | null"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 500 }
}
```

`avg_rating` is `null` for users with zero ratings.

---

#### GET /api/admin/users/:id

- **File:** `routes/admin.js`

**URL Params:** `id` — user ID

**Success Response (200):**

```json
{
  "profile": { "...full profile row..." },
  "ratings": [ "...rating rows..." ],
  "reaction_counts": {
    "cheers_given": 0,
    "cheers_received": 0
  },
  "referral_clicks": [ "...referral_click rows..." ],
  "total_page_views": 0
}
```

**Error Responses:**
- 404: `{ "error": "User not found" }`

---

#### GET /api/admin/stats

- **File:** `routes/admin.js`

**Success Response (200):**

```json
{
  "total_users": 0,
  "total_ratings": 0,
  "total_beers_rated": 0,
  "total_venues": 0,
  "total_referral_clicks": 0,
  "dau": 0,
  "wau": 0,
  "mau": 0,
  "ratings_today": 0,
  "ratings_this_week": 0,
  "ratings_this_month": 0,
  "new_users_this_week": 0,
  "new_users_this_month": 0,
  "top_beers_this_week": [
    { "beer_name": "string", "count": 0 }
  ],
  "top_venues_this_week": [
    { "venue_id": "string", "count": 0 }
  ]
}
```

**Error Responses:**
- 502: `{ "error": "Failed to compute stats" }`

---

#### GET /api/admin/referrals

- **File:** `routes/admin.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `limit` | number | 50 | 1–200 |
| `offset` | number | 0 | >= 0 |
| `from` | string (ISO date) | 30 days ago | — |
| `to` | string (ISO date) | now | — |
| `target_type` | string | — | Optional: `brewery`, `venue`, `beer`, `external` |
| `target_id` | string | — | Optional |
| `user_id` | string | — | Optional |

**Success Response (200):**

```json
{
  "data": [ "...referral_click rows..." ],
  "pagination": { "limit": 50, "offset": 0, "total": 200 }
}
```

**Error Responses:**
- 400: `{ "error": "Invalid target_type" }`

---

#### GET /api/admin/referrals/summary

- **File:** `routes/admin.js`

**Query Params:**

| Param | Type | Default |
|-------|------|---------|
| `from` | string (ISO date) | 30 days ago |
| `to` | string (ISO date) | now |
| `target_type` | string | — (optional) |

**Success Response (200):**

```json
{
  "total_clicks": 0,
  "period": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "by_target_type": {
    "brewery": { "clicks": 0, "unique_users": 0, "unique_targets": 0 },
    "venue": { "clicks": 0, "unique_users": 0, "unique_targets": 0 },
    "beer": { "clicks": 0, "unique_users": 0, "unique_targets": 0 },
    "external": { "clicks": 0, "unique_users": 0, "unique_targets": 0 }
  },
  "top_breweries": [
    { "target_id": "string", "target_name": "string", "clicks": 0, "unique_users": 0 }
  ],
  "top_venues": [
    { "target_id": "string", "target_name": "string", "clicks": 0, "unique_users": 0 }
  ],
  "daily_trend": [
    { "date": "YYYY-MM-DD", "clicks": 0 }
  ]
}
```

---

#### GET /api/admin/traffic

- **File:** `routes/admin.js`

**Query Params:**

| Param | Type | Default |
|-------|------|---------|
| `from` | string (ISO date) | 30 days ago |
| `to` | string (ISO date) | now |

**Success Response (200):**

```json
{
  "total_views": 0,
  "unique_sessions": 0,
  "unique_users": 0,
  "period": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "top_pages": [
    { "page_path": "string", "views": 0, "unique_users": 0 }
  ],
  "daily_trend": [
    { "date": "YYYY-MM-DD", "views": 0, "unique_sessions": 0 }
  ]
}
```

---

#### GET /api/admin/push-notification-types

- **Auth:** required (admin only)
- **File:** `routes/admin.js`

Returns the migration-defined push catalog merged with current toggle state, ordered by `sort_order`.

**Success Response (200):**

```json
{
  "data": [
    {
      "notification_type": "streak_at_risk",
      "label": "Streak at risk",
      "description": "Mid-week streak risk (scheduler)",
      "push_enabled": true,
      "updated_at": "2026-03-26T12:00:00.000Z"
    }
  ]
}
```

---

#### PATCH /api/admin/push-notification-types

- **Auth:** required (admin only)
- **File:** `routes/admin.js`
- **Body:** `{ "toggles": { "streak_at_risk": false, "beer_approved": true } }`. Each value must be a boolean. Keys must be `notification_type` values that exist in `push_notification_catalog` (400 if unknown).
- **Success Response (200):** Same shape as **GET /api/admin/push-notification-types** (refreshed `data` after updates).

---

#### PATCH /api/admin/config

- **Auth:** required (admin only; same as other `/api/admin` routes)
- **File:** `routes/admin.js`
- **Body:** `{ "theme": "default" | "st_patricks_day" }`. `theme` is required and must be one of these two values.
- **Validation:** 400 if `theme` is missing or not one of `default`, `st_patricks_day` (error message in `error`).
- **Success Response (200):** Same shape as GET /api/config, e.g. `{ "theme": "default" }` or `{ "theme": "st_patricks_day" }`.

---

#### GET /api/admin/challenges

- **File:** `routes/admin.js`

**Query Params:** `limit` (1–200, default 50), `offset` (default 0).

**Success Response (200):** `{ "data": [ { "id", "week_start", "week_end", "title", "description", "target_style", "target_count", "reward_label", "reward_badge_id", "created_at" } ], "pagination": { "limit", "offset", "total" } }`

---

#### GET /api/admin/challenges/:id

- **File:** `routes/admin.js`

**Success Response (200):** Single challenge row. **404:** `{ "error": "Challenge not found" }`

---

#### POST /api/admin/challenges

- **File:** `routes/admin.js`

**Body:** `week_start` (required, Monday 00:00 UTC ISO), `title` (1–200 chars), `description` (1–1000 chars), `target_count` (positive int), `target_style` (optional), `reward_label` (required), `reward_badge_id` (optional UUID). `week_end` auto-computed if omitted.

**Success Response (201):** Created challenge row. **400:** Validation error message in `error`.

---

#### PATCH /api/admin/challenges/:id

- **File:** `routes/admin.js`

**Body:** Same fields as POST (partial update). **200:** Updated row. **400:** Validation error.

---

#### DELETE /api/admin/challenges/:id

- **File:** `routes/admin.js`

**Success Response (204):** No content.

---

#### GET /api/admin/achievements

- **File:** `routes/admin.js`

**Success Response (200):** `{ "data": [ achievement rows with optional achievement_categories embed ] }`

---

#### GET /api/admin/achievements/:id

- **File:** `routes/admin.js`

**Success Response (200):** Achievement row plus `unlock_count`. **404:** `{ "error": "Achievement not found" }`

---

#### POST /api/admin/achievements

- **File:** `routes/admin.js`

**Body:** `key` (slug), `name`, `description`, `category_key`, `subtype`, `trigger_type`, `rules` (jsonb), `difficulty`, `reward_tabs`, `is_hidden`. Validation in `lib/adminValidation.js`.

**Success Response (201):** Created achievement row. **400:** Validation error.

---

#### PATCH /api/admin/achievements/:id

- **File:** `routes/admin.js`

**Body:** Partial achievement fields; `version` bumped automatically. **200:** Updated row.

---

#### PATCH /api/admin/achievements/:id/deactivate

- **File:** `routes/admin.js`

**Body:** None. Sets `active = false`. **200:** Updated row.

---

#### GET /api/admin/achievement-categories

- **File:** `routes/admin.js`

**Success Response (200):** `{ "data": [ { "key", "name", "icon", "sort_order" } ] }`

---

#### POST /api/admin/achievement-categories

- **File:** `routes/admin.js`

**Body:** `key` (slug), `name`, `icon` (optional), `sort_order` (optional, default 0). **201:** Created category row.

---

#### PATCH /api/admin/achievement-categories/:key

- **File:** `routes/admin.js`

**Body:** `name`, `icon`, or `sort_order` (partial). **200:** Updated row.

---

#### GET /api/admin/featured-beers

- **File:** `routes/admin.js`

**Query Params:** `limit` (1–200, default 50), `offset` (default 0).

**Success Response (200):** `{ "data": [ featured_beer rows ], "pagination": { "limit", "offset", "total" } }`

---

#### POST /api/admin/featured-beers

- **File:** `routes/admin.js`

**Body:** `beer_name` (required), `brewery`, `style`, `week_start`, `week_end` (optional, derived from week_start if omitted), `headline`, `body`, `photo_url`, `beer_id`. `created_by` set from JWT `sub`.

**Success Response (201):** Created featured_beer row. **400:** Validation error.

---

#### PATCH /api/admin/featured-beers/:id

- **File:** `routes/admin.js`

**Body:** Partial featured_beer fields. **200:** Updated row.

---

#### DELETE /api/admin/featured-beers/:id

- **File:** `routes/admin.js`

**Success Response (204):** No content.

---

#### GET /api/admin/beers/for-review

- **File:** `routes/admin.js`
- **Auth:** `authMiddleware` + `adminMiddleware`
- **Query:** `limit` (default 50, max 200), `offset` (default 0)
- **Success Response (200):** `{ "data": [ beer rows ], "pagination": { "limit", "offset", "total" } }`. Each beer has `id`, `name`, `brewery_name`, `style`, `abv`, `source`, `created_at`, `flagged_at`. Lists beers with `flagged_for_review = true` (new user-submitted beers) for admin catalog review.

---

#### PATCH /api/admin/beers/:id

- **File:** `routes/admin.js`
- **Auth:** `authMiddleware` + `adminMiddleware`
- **URL Params:** `id` — beer UUID
- **Body (all optional):** `name`, `brewery_name`, `style`, `abv`. Validation: name non-empty if provided; abv 0–30 if present. On success, backend sets `flagged_for_review = false` and `flagged_at = null` so the beer drops off the for-review list.
- **Success Response (200):** `{ "data": Beer }` (updated catalog row).
- **400:** Validation error or no fields to update.

---

#### GET /api/admin/cosmetics

- **File:** `routes/admin.js`

**Success Response (200):** `{ "data": [ cosmetic rows ] }`. Each cosmetic row includes `border_fit` (object | null) when present.

---

#### POST /api/admin/cosmetics

- **File:** `routes/admin.js`

**Body:** `key`, `type` (border|title|avatar), `name`, `description`, `rarity`, `unlock_type`, `tab_price`, `achievement_key`, etc. Validation in `lib/adminValidation.js`.

**Success Response (201):** Created cosmetic row. **400:** Validation error.

---

#### PATCH /api/admin/cosmetics/:id

- **File:** `routes/admin.js`

**Body:** Partial cosmetic fields. Supports `border_fit`: `null` to clear, or object `{ scale, rotationDeg, offsetX, offsetY, avatarScale? }` (scale in (0, 5], rotationDeg in [-360, 360]). **200:** Updated row (includes `border_fit`).

---

#### PATCH /api/admin/cosmetics/:id/deactivate

- **File:** `routes/admin.js`

**Body:** None. Sets `active = false`. **200:** Updated row.

---

#### GET /api/admin/tabs/users

- **File:** `routes/tabs.js`

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "string",
      "display_name": "string",
      "email": "string",
      "avatar_url": "string",
      "tabs_profile": {
        "user_id": "string",
        "current_tier": "string",
        "tier_promoted_at": "string | null",
        "is_seeder": false,
        "seeder_granted_at": "string | null",
        "seeder_granted_by": "string | null",
        "tab_balance": 0,
        "lifetime_tabs_earned": 0,
        "ratings_this_week": 0,
        "week_start": "string",
        "current_streak_weeks": 0,
        "longest_streak_weeks": 0,
        "last_active_week": "string",
        "weeks_inactive": 0,
        "created_at": "ISO8601",
        "updated_at": "ISO8601"
      }
    }
  ]
}
```

`tabs_profile` is `null` if the user has never had a tabs profile created.

---

#### PATCH /api/admin/tabs/users/:userId/seeder

- **File:** `routes/tabs.js`

**URL Params:** `userId` — user ID

**Request Body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `is_seeder` | boolean | yes | Also accepts `"true"`/`"false"`, `1`/`0` |

**Success Response (200):**

```json
{
  "data": {
    "user_id": "string",
    "is_seeder": true,
    "seeder_granted_at": "ISO8601 | null",
    "seeder_granted_by": "string | null",
    "...other tabs profile fields..."
  }
}
```

**Side Effects:** Updates `user_tabs_profile`. If granting seeder, creates notification.

---

#### PATCH /api/admin/tabs/users/:userId/tier

- **File:** `routes/tabs.js`

**URL Params:** `userId` — user ID

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `tier` | string | yes | One of: `taster`, `regular`, `local`, `patron`, `house_account`, `cellar_reserve` |

**Success Response (200):**

```json
{
  "data": {
    "user_id": "string",
    "current_tier": "string",
    "tier_promoted_at": "ISO8601",
    "weeks_inactive": 0,
    "...other tabs profile fields..."
  }
}
```

**Error Responses:**
- 400: `{ "error": "Invalid tier value" }`

**Side Effects:** Updates `user_tabs_profile`. Creates tier promotion notification.

---

#### POST /api/admin/tabs/users/:userId/adjust

- **File:** `routes/tabs.js`

**URL Params:** `userId` — user ID

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `amount` | number | yes | Non-zero integer |
| `reason` | string | yes | — |

**Success Response (200):**

```json
{
  "data": {
    "user_id": "string",
    "tab_balance": 100,
    "lifetime_tabs_earned": 200,
    "...other tabs profile fields..."
  }
}
```

**Error Responses:**
- 400: `{ "error": "amount must be a non-zero integer" }`
- 400: `{ "error": "reason is required" }`

**Side Effects:** Inserts into `tabs_ledger`, updates `user_tabs_profile` (lifetime tabs cache for positive grants).

---

#### GET /api/admin/tabs/submissions

- **File:** `routes/tabs.js`

**Query Params:**

| Param | Type | Default | Validation |
|-------|------|---------|------------|
| `status` | string | `"pending"` | One of: `pending`, `approved`, `rejected` |

**Success Response (200):**

```json
{
  "data": [
    {
      "id": "string",
      "submitted_by": "string",
      "beer_name": "string",
      "brewery": "string | null",
      "style": "string | null",
      "abv": "number | null",
      "notes": "string | null",
      "status": "string",
      "reviewed_by": "string | null",
      "reviewed_at": "string | null",
      "review_notes": "string | null",
      "created_beer_id": "string | null",
      "tabs_awarded": false,
      "created_at": "ISO8601"
    }
  ]
}
```

**Error Responses:**
- 400: `{ "error": "Invalid status filter" }`

---

#### PATCH /api/admin/tabs/submissions/:id

- **File:** `routes/tabs.js`

**URL Params:** `id` — submission ID

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `status` | string | yes | `"approved"` or `"rejected"` |
| `review_notes` | string | no | — |

**Success Response (200):**

```json
{
  "data": {
    "id": "string",
    "submitted_by": "string",
    "beer_name": "string",
    "status": "approved",
    "reviewed_by": "string",
    "reviewed_at": "ISO8601",
    "review_notes": "string | null",
    "...other submission fields..."
  },
  "tabs_awarded": 3
}
```

`tabs_awarded` is a number at the top level alongside `data`.

**Error Responses:**
- 400: `{ "error": "status must be 'approved' or 'rejected'" }`
- 404: `{ "error": "Submission not found" }`

**Side Effects:** Updates `beer_submissions`. If approved: inserts into `tabs_ledger`, updates tabs profile cache, creates notification.

---

#### GET /api/admin/tabs/stats

- **File:** `routes/tabs.js`

**Success Response (200):**

```json
{
  "total_users": 0,
  "users_with_tabs_profile": 0,
  "tabs_in_circulation": 0,
  "distribution_by_tier": {
    "taster": 0,
    "regular": 0,
    "local": 0,
    "patron": 0,
    "house_account": 0,
    "cellar_reserve": 0
  },
  "active_seeders": 0
}
```

**Error Responses:**
- 502: `{ "error": "Failed to fetch tabs stats" }`

---

### Internal

#### POST /internal/process-event

- **Auth:** Bearer JWT (required) + `x-internal-secret` header (required when `INTERNAL_PROCESS_EVENT_SECRET` is set; must match env value)
- **File:** `routes/internal.js`

**Request Body:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `event_type` | string | yes | One of: `rating_award`, `cheers_given`, `cheers_received`, `rating_submitted`, `achievement_unlock`, `admin_grant`, `spend` |
| `event_id` | string | conditional | Required (UUID) for: `rating_award`, `cheers_given`, `cheers_received`, `admin_grant` |
| `payload` | object | no | Varies by event type |

**Payload by event type:**

| Event Type | Payload |
|------------|---------|
| `rating_award` | `{ amount, breakdown?, context? }` (weekly cap: first 10/week for non-admin users; env-admin IDs bypass cap) |
| `cheers_given` | `{ amount, to_user_id?, context? }` |
| `cheers_received` | `{ amount, target_user_id (required), context? }` |
| `rating_submitted` | `{ context }` (triggers achievement evaluation) |
| `admin_grant` | `{ amount, breakdown?, context? }` |
| `achievement_unlock`, `spend` | No-op |

**Success Response (200):**

```json
{
  "unlocked": [
    { "key": "string", "name": "string", "reward_tabs": 0 }
  ],
  "tabs_delta": 8,
  "tabs_balance": 100,
  "current_streak_weeks": 2,
  "longest_streak_weeks": 7
}
```

**Error Responses:**
- 400: `{ "error": "Invalid event_type", "valid_types": [...] }`
- 400: `{ "error": "event_id (UUID) required for ${eventType}" }`
- 400: `{ "error": "payload.target_user_id (Keycloak sub of receiver) is required for cheers_received" }`
- 401: `{ "error": "Missing or invalid Authorization header" }`
- 401: `{ "error": "Unauthorized" }`
- 403: `{ "error": "Invalid or missing internal secret" }` (when `x-internal-secret` does not match `INTERNAL_PROCESS_EVENT_SECRET`)
- 500: `{ "error": "internal_error", "correlation_id": "uuid" }` or `{ "error": "string" }`

**Side Effects:** Inserts into `tabs_ledger`, `user_achievements`, `user_cosmetics`. Updates `profiles.tabs_balance` via DB trigger.

#### Process-Event Profile Cache Refresh RPC

`rating_award` processing also invokes:

- `POST /rpc/refresh_rating_award_profile_cache`
- SQL function: `public.refresh_rating_award_profile_cache(p_user_id text, p_tabs_delta int)`
- Behavior: updates `user_tabs_profile` cache fields (`ratings_this_week`, `current_streak_weeks`, `longest_streak_weeks`, `last_active_week`, `weeks_inactive`, `lifetime_tabs_earned`) and returns streak values used in API responses.

---

### Public Pages (Share URL)

#### GET /review/:ratingId

- **Auth:** none
- **File:** `server.js`
- **Content-Type:** `text/html` (not JSON)

**URL Params:** `ratingId` — rating UUID

**Purpose:** Shareable review landing page with Open Graph meta and app-link tags for deep linking. Rate-limited with same window as `/api`.

**Success Response (200):** HTML document with:
- `<title>` and `og:title` / `og:description` / `og:image` (when photo present)
- `al:ios:url`, `al:android:url`, `al:web:url` for app/scheme deep links
- Inline styles and simple layout (beer name, stars, reviewer, CTA)

**Error Responses:**
- 400: HTML "Review Not Found" page (missing `ratingId`)
- 404: HTML "Review Not Found" page (rating not found)
- 502: HTML "Review Not Found" page (upstream error)

---

## Appendix: YG (`yg_value`) — validation, rounding, analytics

### Allowed values (write contract)

- **Type:** JSON number (finite; `NaN` / `Infinity` rejected).
- **Set:** `-1` **or** any `x` with `1 ≤ x ≤ 10` and **`2x ∈ ℤ`** (equivalently: half-step grid `1`, `1.5`, `2`, …, `10`).
- **`0` is never allowed.** There is no “unset via zero” on create — omitting `yg_value` on **POST** yields a 400 (field required).

**Backward compatibility:** All integers `1` … `10` and `-1` lie on the grid and remain valid. Clients that previously sent only integers can continue; clients that support half-steps should send decimals **as-is** (e.g. `4.5`, not rounded to `4` or `5` before send).

### Validation vs rounding

- The server checks membership on the half-step grid using a small epsilon on `value * 2` so benign float noise (e.g. from JSON parsing) does not false-reject values that are intentionally on the grid.
- The server **does not** coerce arbitrary values onto the grid (e.g. `4.25` → `4.5`). Off-grid values receive **400** with the error string below.

### Error strings (400)

Responses use `{ "error": "<string>" }` unless otherwise noted.

| Case | Exact `error` string (from `lib/ratingsValidation.js`) |
|------|----------------------------------------------------------|
| Missing `yg_value` on POST | `yg_value is required (-1 or 1–10 in steps of 0.5; 0 is not allowed)` |
| Invalid / off-grid `yg_value` | `yg_value must be -1 or a number from 1 to 10 in steps of 0.5 (0 is not allowed)` |

### Internal `rating` (1–5)

The `ratings.rating` column is **derived** from canonical `yg_value` for legacy/internal use. Formula (server and migration-aligned): `clamp(1, round(1 + (yg + 1) * 4 / 11), 5)` for `yg ∈ [-1, 10]`. **Clients must not reverse-engineer or display this as the user-facing score.**

### Direct DB / PostgREST

Writers that bypass the Node BFF must satisfy the same values: PostgreSQL constraint `ratings_yg_value_check` on `ratings.yg_value` (see migration below).

### Analytics & historical interpretation

**Migration:** `apps/beerbook-api/supabase/migrations/20260330100000_ratings_yg_value_canonical_half_steps.sql`

**Cutoff:** After this migration has been applied to an environment, stored `yg_value` rows are on the **canonical** scale. Pre-migration snapshots or exports that used the legacy integer scale should be interpreted using the backfill mapping below if you compare to current DB totals.

**Legacy → canonical (row backfill applied in that migration):**

| Legacy `yg_value` | Canonical `yg_value` |
|-------------------|----------------------|
| `-6`, `-5`, `-4`, `-3`, `-2` | `-1` |
| `-1` | `-1` |
| `1` | `1` |
| `2` | `2.5` |
| `3` | `4` |
| `4` | `5.5` |
| `5` | `7` |
| `6` | `8.5` |
| `7` | `10` |

(Formula for old positives `1..7`: `1 + (old - 1) * 1.5`.)

**Aggregates after migration**

- **`total_yg` / leaderboard (`top_yg_values`):** Still **`sum(yg_value)`** per user (see `leaderboard_aggregate`). Sums are in **canonical** units; comparing a user’s total to a pre-migration historical number requires re-mapping old rows or restricting comparisons to post-cutoff data.
- **`avg_yg_value` (beers, profiles, etc.):** Averages are numeric means of canonical `yg_value`; they may show one decimal (or more in JSON) and are comparable pre/post only after legacy data is backfilled (as in the migration).

---

## Side Effects Matrix

| Endpoint | DB Writes | Notifications | Tabs |
|----------|-----------|---------------|------|
| `POST /api/ratings` (create, user) | `ratings`, possibly `beers`, `venues`, `profiles`, `tabs_ledger`, `user_tabs_profile`, `user_achievements`, `user_cosmetics` | Achievement unlocks | Yes: rating_award + rating_submitted |
| `POST /api/ratings` (create, guest) | `ratings`, possibly `beers`, `venues` | None | No (guest ratings skip tabs/achievements/milestones) |
| `POST /api/ratings` (update) | `ratings` | None | No |
| `PATCH /api/ratings/:id` | `ratings` | None | No (content update only; no tabs/achievements) |
| `DELETE /api/ratings/:id` | `ratings` (delete) | None | No (tabs NOT reversed) |
| `POST /api/guest-ratings/claim` | `ratings` (UPDATE or DELETE per row) | None | No |
| `POST /api/ratings/:id/cheers` (add) | `reactions` (insert), `profiles` | Yes (cheers_received) | Yes: cheers_given + cheers_received |
| `POST /api/ratings/:id/cheers` (remove) | `reactions` (delete) | None | No |
| `POST /api/ratings/:id/comments` | `rating_comments`, `ratings.comment_count` | None | No |
| `DELETE /api/ratings/:id/comments/:commentId` | `rating_comments` (delete), `ratings.comment_count` | None | No |
| `POST /api/follows/:userId` (follow) | `follows` (insert) | None | No |
| `POST /api/follows/:userId` (unfollow) | `follows` (delete) | None | No |
| `POST /api/crews` | `crews`, `crew_members` | None | No |
| `POST /api/crews/join` | `crew_members` | None | No |
| `DELETE /api/crews/:id` | `crews` (cascade) | None | No |
| `DELETE /api/crews/:id/members/:userId` | `crew_members`, possibly `crews` | None | No |
| `POST /api/venues` | `venues` | None | No |
| `POST /api/venues/:id/prices` | `price_logs` | None | No |
| `POST /api/venues/:id/happy-hours` | `happy_hours` | None | No |
| `POST /api/upload` | Filesystem (uploads dir) | None | No |
| `POST /api/cosmetics/purchase` | `tabs_ledger`, `user_cosmetics`, `profiles.tabs_balance` | None | Yes (spend) |
| `POST /api/cosmetics/equip` | `profiles` (equipped IDs) | None | No |
| `POST /api/tabs/submissions` | `beer_submissions` | None | No |
| `PATCH /api/admin/tabs/submissions/:id` (approve) | `beer_submissions`, `tabs_ledger`, `user_tabs_profile` | Yes | Yes |
| `POST /api/push/register` | `push_tokens` (upsert), possibly deactivates other active rows for same `(user_id, device_id)` | None | No |
| `POST /api/push/unregister` | `push_tokens` (deactivate matching active row for caller/token) | None | No |
| `npm run push:dispatch` (worker) | `notification_token_push_state`, `push_send_attempts`, possible `push_tokens` deactivation on `DeviceNotRegistered` | Consumes existing `tab_notifications` only (does not create business notifications) | No (delivery only) |
| `GET /api/admin/beers/for-review` | `beers` (read) | Yes | No |
| `PATCH /api/admin/beers/:id` | `beers` (name, brewery_name, style, abv; clear flagged_for_review) | Yes | No |
| `PATCH /api/admin/tabs/users/:userId/seeder` | `user_tabs_profile` | Yes (if granting) | No |
| `PATCH /api/admin/tabs/users/:userId/tier` | `user_tabs_profile` | Yes | No |
| `POST /api/admin/tabs/users/:userId/adjust` | `tabs_ledger`, `user_tabs_profile` | None | Yes |
| `POST /api/track/click` | `referral_clicks` (async) | None | No |
| `POST /api/track/pageview` | `page_views` (async) | None | No |

---

## Known Inconsistencies & Gotchas

### 1. Envelope Inconsistency
- Most list endpoints wrap results in `{ data: [...], pagination: {...} }`
- `GET /api/exchange/rates` returns a flat array
- `GET /api/exchange/portfolio/:user_id` returns a flat array
- `GET /api/catalog/beer/:id` returns a flat object (not wrapped in `data`)
- `GET /api/achievements/fallback` returns a flat object (not wrapped in `data`)
- `GET /api/leaderboard` uses a custom shape with named arrays

### 2. Stats Endpoints Use Different Field Names
- `GET /api/stats/me` returns `average_rating`, `unique_beers`, `monthly_counts`
- `GET /api/users/:id/stats` returns `avg_rating`, no `unique_beers`, `monthly_activity`
- These are different RPCs with different shapes despite similar purpose

### 3. Success Response Shapes Vary
- `DELETE /api/ratings/:id` returns 204 (no body)
- `DELETE /api/ratings/:id/comments/:commentId` returns 200 with `{ success: true }`
- `DELETE /api/crews/:id` returns 204 (no body)
- `POST /api/venues/:id/prices/:priceId/confirm` returns `{ ok: true }`
- `PATCH /api/tabs/notifications/read-all` returns `{ ok: true }`

### 4. Missing Pagination
- `GET /api/ratings/:id/comments` accepts `limit`/`offset` but does NOT return a `pagination` object

### 5. POST /api/ratings Dual Behavior
- If the user already rated this beer (same beer_id or beer_name + optional venue_id), it UPDATES and returns 200 with `{ updated: true, previous_rating }`
- If new, it CREATES and returns 201 with `{ updated: false, tabs_earned, tabs_breakdown, ... }`
- The response shapes are completely different between create and update

### 6. Tabs Are NOT Reversed on Delete
- `DELETE /api/ratings/:id` removes the rating but does NOT reverse any tab awards. This is by design but may surprise clients.

### 7. Field Name Aliases
- Many body fields accept both `snake_case` and `camelCase` (e.g., `beer_name`/`beerName`, `price_cents`/`priceCents`)
- Responses always use `snake_case`

### 8. `weekly_count` / `weekly_cap` in POST /api/ratings Response
- `POST /api/ratings` create response includes:
  - `weekly_count` = current `rating_award` count this week (post-submit)
  - `weekly_cap` = `10` (cap enforced for non-admin users; env-admin IDs bypass cap)
- It also includes `current_streak_weeks` and `longest_streak_weeks` from real-time profile cache refresh.
- Update responses (`updated: true`) still do not include these fields.

### 9. Crew Join Error Uses Structured Errors
- `POST /api/crews/join` returns `{ error_code, error, request_id }` matching auth error shape
- Other crew errors use plain `{ error: string }`

### 10. Profile Creation Returns 201
- `GET /api/profile` may return 201 (not 200) when auto-creating the profile
- Clients should handle both 200 and 201 as success

### 11. `GET /api/tabs/notifications` Has Extra `metadata`
- Response includes `metadata: { unread_count }` alongside `data` and `pagination`
- Also includes aliases: `notifications` (same as `data`) and `unread_count` (same as `metadata.unread_count`)

### 12. `PATCH /api/admin/tabs/submissions/:id` Has Top-Level `tabs_awarded`
- Response shape: `{ data: {...}, tabs_awarded: 3 }` — the `tabs_awarded` is a sibling of `data`, not inside it

### 13. Rating display: catalog as source of truth when `beer_id` is set
- For any API that returns a rating (e.g. `GET /api/ratings`, `GET /api/ratings/user/:id`, `POST /api/ratings`, `PATCH /api/ratings/:id`, share page), when the rating has `beer_id` set, the response fields `beer_name`, `brewery`, `style`, and `abv` are **overlaid from the catalog** (`beers` table), not from the denormalized `ratings` columns. One admin edit to the catalog beer reflects everywhere.

### 13. Tabs Architecture Is Single-Ledger
- `tabs_ledger` is the sole source of truth for tab movements (rating awards, cheers, admin grants, achievement unlock rewards, spends).
- `tab_transactions` remains in schema but is deprecated/orphaned by active backend routes/engine paths.
- `profiles.tabs_balance` is canonical and trigger-maintained from `tabs_ledger` inserts.
- `user_tabs_profile` is a real-time cache refreshed on `rating_award` via `public.refresh_rating_award_profile_cache`.
