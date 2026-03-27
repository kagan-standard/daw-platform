# Phase 4 — API Surface by Domain

**Scope:** All HTTP endpoints grouped by domain. Per domain: auth, side effects, notable validation. Full request/response shapes remain in [API_CONTRACT.md](../API_CONTRACT.md) (source of truth).

**Route layout:** Mounted under `/api` (or `/internal`). Route modules: `routes/activity.js`, `routes/beers.js`, `routes/exchange.js`, `routes/venues.js`, `routes/deals.js`, `routes/map.js`, `routes/leaderboard.js`, `routes/upload.js`, `routes/highlights.js`, `routes/admin.js`, `routes/tracking.js`, `routes/tabs.js`, `routes/follows.js`, `routes/crews.js`, `routes/internal.js`. Inline in `server.js`: health, auth (register/login/refresh), catalog, breweries, ratings, guest-ratings/claim, head-to-head, comments, profile, stats, review share.

---

## Auth (BFF)

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| POST | `/api/auth/register` | none | Keycloak user create; optional verification email | body: email, username, password; register rate limit |
| POST | `/api/auth/login` | none | none (returns tokens) | body: username/email, password; login rate limit |
| POST | `/api/auth/refresh` | none | none (returns new tokens) | body: refresh_token |

**Implementation:** `server.js`. Keycloak admin lib (`keycloakAdmin`) for user creation and token exchange. Not in API_CONTRACT.md endpoint list; BFF-only auth helpers.

---

## Health

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/health` | none | none | — |

---

## Catalog

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/catalog/search` | none | none | `q` required; &lt; 2 chars → `{ data: [] }`; `limit` 1–50 |
| GET | `/api/catalog/browse` | none | none | `limit` 1–100, `offset` ≥ 0; `sort` in whitelist (name, abv, review_overall, review_count, power_score, style_elo); `order` asc/desc; `style` = style family |
| GET | `/api/catalog/styles` | none | none | — |
| GET | `/api/catalog/validate-new` | none | none | body: beer_name, brewery, style, abv; optional beer_id |
| GET | `/api/catalog/beer/:id` | none | none | — |

**Implementation:** `server.js` only. Catalog read-only; no DB writes.

---

## Breweries

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/breweries/search` | none | none | `q` required; limit; optional lat/lng/radius |
| GET | `/api/breweries/map` | none | none | limit, offset; pagination + optional `truncated` |
| GET | `/api/map/breweries` | none | none | Same handler as `/api/breweries/map` |
| GET | `/api/breweries/:id` | none | none | — |

**Implementation:** `server.js`. Read-only.

---

## Ratings

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/ratings` | soft (optional) | none | `sort` in whitelist (created_at, rating, beer_name); `order` asc/desc; limit max 100; `is_new_beer` stripped from query (sanitize) |
| GET | `/api/ratings/user/:id` | soft (optional) | none | same sort/order/limit |
| POST | `/api/ratings` | actor (JWT or guest) | **ratings** (insert/update); **beers**/ **venues** when new beer/venue; **profiles**, **user_tabs_profile**, **tabs_ledger**, **user_achievements**, **user_cosmetics** for user path; process-event `rating_award` + `rating_submitted`; crew milestones; head-to-head optional | **yg_value** required (canonical: `-1` or `1`–`10` in `0.5` steps; `0` invalid); guest: `X-Guest-Id` UUID v4 or body; new beer: brewery ≥2 chars, style, abv 0–30; lat/lng together; price_cents positive int; serve_type enum; 409 on similar beer |
| PATCH | `/api/ratings/:id` | actor (JWT or guest) | **ratings** only (content update); no tabs/achievements | ownership (user_id or guest_id); same body rules as POST where applicable |
| DELETE | `/api/ratings/:id` | actor (JWT or guest) | **ratings** (delete); tabs NOT reversed | ownership |

**Guest ratings:** When `ENABLE_GUEST_RATINGS` is set, POST/PATCH/DELETE accept `X-Guest-Id` (no JWT). Guest path: no tabs, achievements, or milestones.

---

## Head-to-head

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| POST | `/api/head-to-head/:id/complete` | required | **tabs_ledger** (reward), **user_tabs_profile**; process-event; Elo update | prompt `id`; body: winner_rating_id, loser_rating_id |
| POST | `/api/head-to-head/:id/skip` | required | none (or idempotent no-op) | prompt `id` |

**Implementation:** `server.js`. Head-to-head offered optionally after POST /api/ratings (authenticated only).

---

## Guest ratings (claim)

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| POST | `/api/guest-ratings/claim` | required | **ratings** (UPDATE user_id / DELETE duplicates); no tabs for claimed rows | body: `guest_id` (UUID v4); same beer/venue → keep user rating, discard guest |

**Implementation:** `server.js`.

---

## Comments

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/ratings/:id/comments` | none | none | limit/offset; response `{ data }` no pagination object |
| POST | `/api/ratings/:id/comments` | required | **rating_comments**, **ratings.comment_count** | body: content |
| DELETE | `/api/ratings/:id/comments/:commentId` | required | **rating_comments** (delete), **ratings.comment_count** | ownership of comment |

**Implementation:** `server.js`.

---

## Activity

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/activity` | soft; required for `feed=crew` / `feed=following` | none | `feed` (crew/following) + `crew_id` when feed=crew; crew membership / follows checked |
| POST | `/api/ratings/:id/cheers` | required | **reactions** (insert or delete); **profiles**; process-event `cheers_given` + `cheers_received` when adding | rating exists; idempotent add/remove |
| GET | `/api/ratings/:id/cheers` | none | none | — |

**Implementation:** `server.js` (comments/cheers); `routes/activity.js` (GET /api/activity). Cheers add: tabs awarded to giver and receiver via process-event.

---

## Users

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/users/:id` | none | none | — |
| GET | `/api/profiles/:id` | none | none | alias for user profile |
| GET | `/api/users/:id/stats` | none | none | different RPC shape than `/api/stats/me` (see API_CONTRACT gotchas) |

**Implementation:** `server.js` (implied from contract); profile/stats handlers in server.

---

## Profile & Stats

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/profile`, `/api/profile/me` | required | none | — |
| PATCH | `/api/profile` | required | **profiles** | display_name, avatar_url, etc.; optional equipped cosmetics |
| GET | `/api/stats/me` | required | none | — |
| GET | `/api/stats/:userId` | none | none | — |
| GET | `/api/stats` | soft (optional) | none | limit max 100 |

**Implementation:** `server.js`. Profile GET/PATCH may overlay equipped cosmetics (borders, titles, avatars).

---

## Beers

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/beers` | none | none | with `q`: catalog search (limit max 50); without `q`: beer_averages, limit max 100; `sort` whitelist (beer_name, avg_rating, review_count, last_reviewed, avg_yg_value) |
| GET | `/api/beers/search` | none | none | `q` required; limit 1–50; RPC `search_beer_catalog` |
| GET | `/api/beers/:name` | none | none | slug/name; aggregated + ratings + price history |

**Implementation:** `routes/beers.js`. Read-only; catalog search via RPC.

---

## Exchange

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/exchange/rates` | none | none | flat array (no envelope) |
| GET | `/api/exchange` | required | none | limit max 100 |
| GET | `/api/exchange/portfolio/:user_id` | none | none | flat array |
| GET | `/api/exchange/:beer_name` | none | none | — |

**Implementation:** `routes/exchange.js`. Read-only.

---

## Venues

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/venues` | none | none | optional lat, lng, radius (meters); radius positive, capped MAX_VENUE_RADIUS_M; limit 100 |
| POST | `/api/venues` | required | **venues** | name, latitude, longitude required; lat -90..90, lng -180..180 |
| GET | `/api/venues/:id` | none | none | — |
| GET | `/api/venues/:id/prices` | none | none | limit 100 |
| POST | `/api/venues/:id/prices` | required | **price_logs** | body fields per API_CONTRACT |
| POST | `/api/venues/:id/prices/:priceId/confirm` | required | confirm flow | — |
| GET | `/api/venues/:id/happy-hours` | none | none | — |
| POST | `/api/venues/:id/happy-hours` | required | **happy_hours** | — |
| POST | `/api/venues/:id/happy-hours/:hhId/confirm` | required | confirm | — |
| PATCH | `/api/venues/:id/happy-hours/:hhId/confirm` | required | confirm | — |

**Implementation:** `routes/venues.js`.

---

## Deals

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/deals` | none | none | optional query params per API_CONTRACT |

**Implementation:** `routes/deals.js`. Read-only.

---

## Map

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/map` | none | none | — |
| GET | `/api/map/venues` | none | none | — |
| GET | `/api/map/user/:id` | none | none | — |

**Implementation:** `routes/map.js`. Read-only.

---

## Leaderboard

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/leaderboard` | soft (optional) | none | optional `crew_id`, `period`; custom response shape (top_reviewers, top_beers, top_yg_values, most_venues, truncated, pagination) |

**Implementation:** `routes/leaderboard.js`.

---

## Upload

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| POST | `/api/upload` | required | filesystem (uploads dir); optional moderation path | multipart/form-data; file type/size limits |
| POST | `/api/upload/photo` | required | same | — |

**Implementation:** `routes/upload.js`. No DB writes for upload itself; moderation may trigger other flows.

---

## Highlights

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/highlights/beer-of-the-week` | none | none | single object `{ beer }` |

**Implementation:** `routes/highlights.js`. Read-only.

---

## Tabs

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/tabs/profile` | required | none | — |
| GET | `/api/tabs/profile/:userId` | required | none | — |
| GET | `/api/tabs/leaderboard` | none | none | limit max 200 |
| GET | `/api/tabs/history` | required | none | limit 200 |
| GET | `/api/tabs/notifications` | required | none | limit 200; metadata.unread_count |
| PATCH | `/api/tabs/notifications/:id/read` | required | **tabs notifications** (read state) | — |
| PATCH | `/api/tabs/notifications/read-all` | required | same | — |
| POST | `/api/tabs/submissions` | required | **beer_submissions** | body: beer_name, brewery, style, abv, notes |
| GET | `/api/tabs/submissions` | required | none | own submissions only |

**Implementation:** `routes/tabs.js`. Tabs balance/ledger updated via process-event and admin flows, not these read/submit endpoints.

---

## Achievements

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/achievements` | required | none | optional `user_id` for another user's public achievements |
| GET | `/api/achievements/next` | required | none | — |
| GET | `/api/achievements/fallback` | required | none | flat object (no `data` wrapper) |

**Implementation:** `routes/tabs.js`. Read-only.

---

## Cosmetics

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/api/cosmetics` | soft (optional) | none | `is_owned` / `is_equipped` when authenticated |
| GET | `/api/users/:id/cosmetics` | none | none | user inventory |
| POST | `/api/cosmetics/purchase` | required | **tabs_ledger**, **user_cosmetics**, **profiles.tabs_balance** (spend) | body: cosmetic_id; sufficient balance; structured errors |
| POST | `/api/cosmetics/equip` | required | **profiles** (equipped_*_id) | body: type (border/title/avatar), cosmetic_id |

**Implementation:** `routes/tabs.js`. Purchase: process-event spend.

---

## Follows

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| POST | `/api/follows/:userId` | required | **follows** (insert or delete via RPC toggle_follow) | cannot follow self; target required |
| GET | `/api/follows/:userId/followers` | none | none | limit 100 |
| GET | `/api/follows/:userId/following` | none | none | limit 100 |
| GET | `/api/follows/:userId/status` | required | none | — |

**Implementation:** `routes/follows.js`. RPC `toggle_follow` for atomic follow/unfollow.

---

## Crews

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| POST | `/api/crews` | required | **crews**, **crew_members** (owner) | name required, ≤50 chars; RPC create_crew_with_owner |
| GET | `/api/crews` | required | none | current user's crews |
| GET | `/api/crews/:id` | required | none | — |
| GET | `/api/crews/:id/challenge` | required | none | crew membership for active challenge |
| GET | `/api/crews/:id/milestones` | required | none | limit 100 |
| GET | `/api/crews/:id/trending` | required | none | limit 50; pagination includes `days` |
| GET | `/api/crews/:id/style-counts` | required | none | style **family** → count object |
| PATCH | `/api/crews/:id` | required (owner) | **crews** | name; owner only |
| DELETE | `/api/crews/:id` | required (owner) | **crews** (cascade) | owner only |
| POST | `/api/crews/:id/regenerate-code` | required (owner) | **crews** (invite_code) | — |
| POST | `/api/crews/join` | required | **crew_members** | body: code; structured errors (e.g. CREW_NOT_FOUND, ALREADY_MEMBER) |
| DELETE | `/api/crews/:id/members/:userId` | required (owner or self) | **crew_members**; may delete crew if last member | — |

**Implementation:** `routes/crews.js`. Crew-scoped leaderboard/activity via query params elsewhere.

---

## Tracking

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| POST | `/api/track/click` | soft (optional) | **referral_clicks** (async, retries; dead-letter to tracking_failures on failure) | target_type in whitelist (brewery, venue, beer, external); 202 + tracked: true |
| POST | `/api/track/pageview` | soft (optional) | **page_views** (async, same retry/dead-letter) | — |

**Implementation:** `routes/tracking.js`. Fire-and-forget; response 202.

---

## Admin

All admin routes use **authMiddleware + adminMiddleware** (env `ADMIN_USER_IDS` / `ADMIN_USER_ID`). Implemented in `routes/admin.js`.

| Method | Path | Side effects | Validation |
|--------|------|--------------|------------|
| GET | `/api/admin/users` | none | sort (last_active, total_ratings, created_at), order, limit 200, search |
| GET | `/api/admin/users/:id` | none | — |
| GET | `/api/admin/stats` | none | — |
| GET | `/api/admin/referrals` | none | from/to window; limit 200 |
| GET | `/api/admin/referrals/summary` | none | — |
| GET | `/api/admin/traffic` | none | — |
| GET | `/api/admin/challenges` | none | — |
| GET | `/api/admin/challenges/:id` | none | — |
| POST | `/api/admin/challenges` | **challenges** | — |
| PATCH | `/api/admin/challenges/:id` | **challenges** | — |
| DELETE | `/api/admin/challenges/:id` | **challenges** | — |
| GET | `/api/admin/achievements` | none | — |
| GET | `/api/admin/achievements/:id` | none | — |
| POST | `/api/admin/achievements` | **achievements** | — |
| PATCH | `/api/admin/achievements/:id` | **achievements** | — |
| PATCH | `/api/admin/achievements/:id/deactivate` | **achievements** | — |
| GET | `/api/admin/achievement-categories` | none | — |
| POST | `/api/admin/achievement-categories` | **achievement_categories** | — |
| PATCH | `/api/admin/achievement-categories/:key` | **achievement_categories** | — |
| GET | `/api/admin/featured-beers` | none | — |
| POST | `/api/admin/featured-beers` | **featured_beers** | — |
| PATCH | `/api/admin/featured-beers/:id` | **featured_beers** | — |
| DELETE | `/api/admin/featured-beers/:id` | **featured_beers** | — |
| GET | `/api/admin/beers/for-review` | read **beers** (flagged); may trigger notifications | — |
| PATCH | `/api/admin/beers/:id` | **beers** (name, brewery_name, style, abv; clear flagged_for_review); notifications | — |
| GET | `/api/admin/cosmetics` | none | — |
| POST | `/api/admin/cosmetics` | **cosmetics** | — |
| PATCH | `/api/admin/cosmetics/:id` | **cosmetics** | — |
| PATCH | `/api/admin/cosmetics/:id/deactivate` | **cosmetics** | — |
| GET | `/api/admin/push-notification-types` | none | push catalog + toggles (`push_notification_catalog`, `push_notification_push_toggle`) |
| PATCH | `/api/admin/push-notification-types` | **push_notification_push_toggle** | `toggles` map; keys must exist in catalog |
| POST | `/api/admin/push-notification-types/test-send` | **tab_notifications** (`admin_push_test`) | admin only; queues a test notification for caller |
| GET | `/api/admin/tabs/users` | none | — |
| PATCH | `/api/admin/tabs/users/:userId/seeder` | **user_tabs_profile**; notification if granting | — |
| PATCH | `/api/admin/tabs/users/:userId/tier` | **user_tabs_profile**; notification | — |
| POST | `/api/admin/tabs/users/:userId/adjust` | **tabs_ledger**, **user_tabs_profile** | amount; process-event admin_grant path |
| GET | `/api/admin/tabs/submissions` | none | status filter (pending, approved, rejected) |
| PATCH | `/api/admin/tabs/submissions/:id` | **beer_submissions**; if approved: **tabs_ledger**, **user_tabs_profile**, notification | status approved/rejected; review_notes optional |
| GET | `/api/admin/tabs/stats` | none | — |

---

## Internal

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| POST | `/internal/process-event` | Bearer JWT required; **x-internal-secret** required when `INTERNAL_PROCESS_EVENT_SECRET` set | **tabs_ledger**, **user_achievements**, **user_cosmetics**; **profiles.tabs_balance** via trigger; RPC `refresh_rating_award_profile_cache` for rating_award | **event_type** in allowlist; **event_id** (UUID) required for rating_award, cheers_given, cheers_received, admin_grant; **payload.target_user_id** for cheers_received; admin_grant requires admin user |

**Event types:** `rating_award`, `cheers_given`, `cheers_received`, `rating_submitted`, `achievement_unlock`, `admin_grant`, `spend`. Weekly cap (e.g. 10) for rating_award for non-admins; env-admin bypass.

**Implementation:** `routes/internal.js`. Same handler used by in-process `invokeProcessEvent()` (no recursion). Server only mounts `/internal` when `INTERNAL_PROCESS_EVENT_SECRET` is set.

---

## Public Pages (Share URL)

| Method | Path | Auth | Side effects | Validation |
|--------|------|------|--------------|------------|
| GET | `/review/:ratingId` | none | none | HTML response; rate-limited; 400/404/502 → "Review Not Found" page |

**Implementation:** `server.js`. Open Graph + app deep-link meta; no JSON.

---

## Summary

- **Auth:** Most write endpoints require JWT. Exceptions: guest ratings (POST/PATCH/DELETE ratings with `X-Guest-Id` when `ENABLE_GUEST_RATINGS`), tracking (soft auth), and public read endpoints. Admin: all under `authMiddleware` + `adminMiddleware`.
- **Side effects:** Heaviest in **ratings** (create/update/delete, beers/venues/profiles/tabs/achievements/milestones), **process-event** (tabs, achievements, cosmetics), **admin** (tabs submissions approve, user tier/seeder/adjust, beers for-review), **cosmetics** (purchase/equip), **cheers**, **comments**, **follows**, **crews**, **venues** (create, prices, happy hours), **upload** (filesystem).
- **Validation:** Centralized in lib where applicable (e.g. `ratingsValidation`, `actorIdentity`, `adminValidation`); per-route sort/limit whitelists and body checks documented in API_CONTRACT.md.

For full request/response shapes, error codes, and pagination details, see [API_CONTRACT.md](../API_CONTRACT.md). For side-effect matrix, see API_CONTRACT § Side Effects Matrix.
