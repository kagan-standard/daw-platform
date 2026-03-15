# Phase 2.6 — Wire Deep-Link Configuration (Backend)

**Date:** 2026-03-07  
**Issues resolved:** FE-I-01 (High, backend portion), FE-I-05 (Medium, backend portion), INT-01 (High, backend portion)  
**Scope:** Coordinated — backend supporting (frontend deep-link config completed separately)

---

## Root Cause

ARCH-08 continuation + INT-01 — Share URLs are generated (`/review/<ratingId>`) but no backend handler existed to resolve them. When a user taps a shared review link, the request had no server-side endpoint to look up the rating's `beer_id` and redirect to the app or provide a web fallback. Complete round-trip failure for every shared link.

---

## Files Changed

| File | Change |
|---|---|
| `apps/beerbook-api/server.js` | Added `APP_SCHEME` and `WEB_BASE_URL` env vars; added `escapeHtml`, `renderReviewNotFoundPage`, `renderReviewLandingPage` helper functions; added `GET /review/:ratingId` route with dedicated rate limiter |

---

## New Endpoint

### `GET /review/:ratingId`

**Purpose:** Resolve a shared review link by looking up the rating, extracting its `beer_id`, and serving a landing page that attempts to open the app and falls back to web.

**Authentication:** None (public endpoint — share links must work for unauthenticated users)

**Rate limiting:** Dedicated limiter with same window/max as `/api` routes.

**Request:**
```
GET /review/{ratingId}
Accept: text/html
```

**Behavior:**

1. Validates `ratingId` param (returns 400 HTML if empty)
2. Queries PostgREST for the rating: `id`, `beer_id`, `beer_name`, `user_name`, `rating`, `brewery`, `style`, `photo_url`
3. If rating not found or upstream error → returns 404 HTML ("Review Not Found")
4. If rating found:
   - Constructs app-link URL: `{APP_SCHEME}://beer/{beer_id}` (or `{APP_SCHEME}://review/{ratingId}` if no `beer_id`)
   - Constructs web fallback URL: `{WEB_BASE_URL}/beer/{beer_id}` (or `{WEB_BASE_URL}` if no `beer_id`)
   - Serves HTML landing page with:
     - **Open Graph meta tags** for social sharing preview (title, description, image, type)
     - **App Link meta tags** (`al:ios:url`, `al:android:url`, `al:web:url`)
     - **"Open in BeerBook" button** linking to the app scheme URL
     - **"View on web" fallback link** to the web URL
     - **Auto-redirect script** that attempts `window.location.href` to the app URL on mobile user agents

**Response (success):** `200 text/html` — landing page  
**Response (not found):** `404 text/html` — "Review Not Found" page  
**Response (upstream error):** `502 text/html` — "Review Not Found" page  

---

## Environment Variables Added

| Variable | Default | Purpose |
|---|---|---|
| `APP_SCHEME` | `beerbook` | Custom URL scheme for deep-link URLs (e.g., `beerbook://beer/123`) |
| `WEB_BASE_URL` | Value of `CORS_ORIGIN` (`https://beerbook.drinksafterwork.net`) | Base URL for web fallback links |

---

## Share URL ↔ Deep-Link Path Alignment

| Share URL path | Backend resolution | App deep-link | Web fallback |
|---|---|---|---|
| `/review/{ratingId}` | Looks up `rating.beer_id` | `beerbook://beer/{beer_id}` | `{WEB_BASE_URL}/beer/{beer_id}` |
| `/review/{ratingId}` (no beer_id) | Falls back to review path | `beerbook://review/{ratingId}` | `{WEB_BASE_URL}` |

Frontend deep-link config (completed separately) maps these paths:
- `beerbook://beer/:id` → BeerDetail screen
- `beerbook://user/:id` → UserProfile screen
- `beerbook://crew/:id` → CrewDetail screen
- `beerbook://review/:ratingId` → resolved to BeerDetail via beer_id

---

## XSS Prevention

All user-controlled data (`beer_name`, `user_name`, `brewery`, `style`, `photo_url`) is escaped via `escapeHtml()` before embedding in HTML attributes and content. The `escapeHtml` function replaces `&`, `"`, `<`, and `>` with their HTML entity equivalents.

The `appUrl` used in the inline `<script>` tag is serialized via `JSON.stringify()` to prevent injection through the URL value.

---

## Validation Steps Completed

| Step | Status |
|---|---|
| Lint check on `server.js` | ✅ Pass — 0 errors |
| XSS review: all user data escaped before HTML embedding | ✅ Verified |
| Route does not require authentication (public share links) | ✅ Verified |
| Rate limiter applied to `/review/:ratingId` | ✅ Verified |
| Route uses existing `rest()` helper (no new Supabase client) | ✅ Verified |
| No unrelated files modified | ✅ Only `server.js` changed |
| All existing routes/endpoints unchanged | ✅ No contract changes |
| OG meta tags present for social sharing preview | ✅ Verified |
| App-link meta tags present (al:ios, al:android, al:web) | ✅ Verified |
| Mobile auto-redirect script included | ✅ Verified |
| 404 handling for missing/deleted ratings | ✅ Verified |
| Fallback for ratings without beer_id | ✅ Verified |

### Validation Commands Run

```
ReadLints c:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\apps\beerbook-api\server.js
```

### Tests Not Run

No automated test suite was executed. The existing test files (`test/process-event-engine-parity.test.js`, etc.) are integration tests for the event engine and do not cover the new `/review/:ratingId` endpoint. Validation items from the execution plan (cold-start deep-link, foreground deep-link, share URL round-trip) require a running app + backend and are deferred to integration testing.

---

## Contract / Doc Implications

- **New public endpoint:** `GET /review/:ratingId` — returns HTML, not JSON. This is a web-facing endpoint, not an API endpoint. It is not mounted under `/api`.
- **No existing HTTP API contract changes.** All existing `/api/*` routes are completely unchanged.
- **New env vars:** `APP_SCHEME` and `WEB_BASE_URL` are optional with sensible defaults. No deployment config change required for the defaults to work.
- **Deep-link path map** should be documented in a shared contract between frontend and backend (see table above).
- **Frontend dependency:** The frontend deep-link `linking` configuration must map `beerbook://beer/:id` to the BeerDetail screen for the round-trip to work. (Frontend reports this is already completed.)

---

## Known Risks and Follow-Up Items

| Risk / Follow-Up | Severity | Notes |
|---|---|---|
| No Universal Links / App Links configuration | Medium | The current implementation uses custom scheme (`beerbook://`) links, not Universal Links (iOS) or App Links (Android). Universal Links require `.well-known/apple-app-site-association` and `.well-known/assetlinks.json` files served from the domain, plus app-side entitlements. This is a Phase 3+ consideration. |
| Share URL domain alignment | Medium | The `/review/:ratingId` endpoint is served from the API domain (`api.beerbook.drinksafterwork.net`). Frontend share URL generation must use this domain. If share URLs should use the web domain instead, a reverse proxy rule or additional endpoint on the web server would be needed. |
| `photo_url` in OG image tag | Low | If `photo_url` values are relative paths (e.g., `/uploads/...`), the OG image meta tag may not resolve correctly for social media crawlers. Should be an absolute URL. Verify that rating `photo_url` values stored in the database are absolute. |
| No `GET /api/ratings/:id` JSON endpoint | Low | The backend has no single-rating-by-ID JSON endpoint. The new `/review/:ratingId` queries PostgREST directly. If a JSON API for single ratings is needed later, it would be a separate addition. |
| Phase 3 gate: 3.4 (Notification UX) | Info | This item unblocks 3.4 — notification UX requires destination routes to exist for navigation-on-press. Deep-link paths now resolve. |

---

## Items NOT Changed

No other Phase 2 items were touched. The following remain as-is:
- 2.1 (engine parity), 2.2 (cosmetic grants), 2.3 (unlock atomicity), 2.4 (draft sync), 2.5 (nav types), 2.7 (crew atomics), 2.8 (session refresh), 2.9 (feature wiring), 2.10 (scheduler)
