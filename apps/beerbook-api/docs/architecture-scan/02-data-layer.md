# Phase 2 — Data Layer and Persistence

**Scope**: PostgREST usage, key RPCs and call sites, migration themes, Supabase Edge vs in-process.

**Deliverable**: `apps/beerbook-api/docs/architecture-scan/02-data-layer.md`.

---

## 1. PostgREST usage

### 1.1 How the API talks to the database

The BeerBook API does **not** use the Supabase JavaScript client. It uses **raw HTTP** to PostgREST:

- **Config**: `SUPABASE_REST_URL` (default `http://supabase-rest:3000`). PostgREST only; no `SUPABASE_URL` required for the main server in self-hosted setups.
- **Auth**: Every request sends `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` and `apikey: <SUPABASE_SERVICE_ROLE_KEY>` so PostgREST runs with service role (bypasses RLS where enabled).
- **Helper**: A single `rest(method, path, opts)` in `server.js` (lines ~104–118) builds `url = REST_URL + path`, sets JSON + auth headers, and returns `{ status, headers, body }`. No `/rest/v1` prefix is used in paths: the server and most routes use paths like `/rpc/...` and `/ratings?...`, so either `REST_URL` is the full PostgREST base including `/rest/v1`, or the deployment mounts PostgREST at root.
- **Exception**: The script `scripts/check-and-backfill-achievement-cosmetics.js` uses explicit `/rest/v1/` in paths (e.g. `/rest/v1/achievements`, `/rest/v1/rpc/backfill_achievement_cosmetics`). That implies compatibility with a base URL that does not include `/rest/v1`.

### 1.2 Request/response handling

- **Body**: For POST/PATCH, callers pass `body: JSON.stringify(...)` in `opts`; `rest()` does not auto-serialize.
- **Errors**: Call sites check `status >= 400` and often forward `body` (or a parsed message) to the client; 5xx from PostgREST are sometimes mapped to 502.
- **Counts**: Many GETs use `Prefer: count=exact`; total is read from `Content-Range` via helper `totalFromContentRange()` in server.js.
- **Ratings read path**: `sanitizeRatingsReadPath()` strips `is_new_beer` from query params and select/order so PostgREST never sees that non-column flag.

### 1.3 Tables accessed via REST (resource paths)

Direct table (or view) access uses the same `rest()` helper with paths like `/profiles?...`, `/ratings?...`, `/beers?...`, etc. Examples:

| Resource | Usage (representative) |
|----------|-------------------------|
| `profiles` | GET by id; POST create; PATCH update (profile, tabs) |
| `ratings` | GET list/filter; POST insert; PATCH update; DELETE |
| `reactions` | GET (cheers by rating_id / user_id) |
| `rating_comments` | Via RPCs only (create_comment_and_increment, delete_comment_and_decrement) |
| `venues` | GET list/detail; POST create |
| `happy_hours`, `price_logs` | GET by venue; POST; confirm_* RPCs |
| `beers`, `breweries` | GET by id; POST beers (catalog); search via RPCs |
| `beer_averages` | GET list / by beer_name (view) |
| `user_tabs_profile` | GET by user_id; POST create; PATCH (tabs lib and process-event cache) |
| `tier_requirements` | GET by tier |
| `tabs_ledger` | Not written directly from Node; written by RPCs and Edge |
| `achievements`, `user_achievements` | GET; POST/PATCH (admin); Edge reads/inserts |
| `achievement_categories` | GET; POST/PATCH (admin) |
| `cosmetics`, `user_cosmetics` | GET; POST/PATCH (admin); purchase_cosmetic RPC |
| `follows` | Toggle via `toggle_follow` RPC |
| `crews`, `crew_members` | GET; create/join/remove via RPCs |
| `crew_milestones` | GET; written by lib (crewMilestones) |
| `weekly_challenges` | GET; POST/PATCH/DELETE (admin) |
| `featured_beers` | GET; POST/PATCH/DELETE (admin) |
| `head_to_head_prompts`, `head_to_head_results` | GET prompt; POST result; PATCH prompt |
| `yg_exchange` (view) | Read for exchange |
| `referral_clicks`, `page_views` | Admin/analytics GET |
| Scheduler tables | claim_job_run, complete_job_run, fail_job_run, insert_scheduler_notification (RPCs only) |

---

## 2. Key RPCs and call sites

All RPCs are invoked as `rest('POST', '/rpc/<name>', { body: JSON.stringify({ ... }) })` from the Node app (or from the Edge function via Supabase client `.rpc()`). Below: **RPC name**, **main purpose**, **call sites** (file or context).

| RPC | Purpose | Call sites |
|-----|---------|------------|
| **award_rating_tabs_with_cap** | Atomic rating tabs award + weekly cap; idempotent by event_id | `lib/processEventEngine.js` (rating_award) |
| **refresh_rating_award_profile_cache** | Refresh user_tabs_profile cache (streak, etc.) after tabs award | `lib/processEventEngine.js`; tests |
| **unlock_achievement_with_rewards** | Unlock achievement, mint reward tabs, grant achievement cosmetics | `lib/processEventEngine.js` (rating_submitted); tests |
| **validate_new_beer_matches** | Validate new beer submission against catalog | `server.js` (catalog/beer submission) |
| **search_beer_catalog** | Catalog search (trigram/similarity; style_category, global_elo) | `server.js`, `routes/beers.js` |
| **search_breweries** | Brewery search | `server.js` |
| **venues_within_radius** | Geospatial venue search | `server.js`, `routes/venues.js`, `routes/deals.js` |
| **find_existing_actor_rating** | Dedupe: one rating per actor per beer/venue (guest + keycloak) | `server.js` (before insert/update rating) |
| **create_comment_and_increment** | Insert comment + increment rating comment_count atomically | `server.js` (POST comment) |
| **delete_comment_and_decrement** | Delete comment + decrement comment_count atomically | `server.js` (DELETE comment) |
| **compute_inferred_flavors** | Inferred taste profile for user | `server.js` (profile/stats) |
| **user_enhanced_stats** | User stats with style family distribution (canonical families) | `server.js` (user stats endpoints) |
| **crew_beer_stats** | Crew-scoped beer stats with pagination | `server.js` (stats) |
| **global_stats_counts** | Total ratings and distinct users | `server.js` (global stats) |
| **toggle_cheers** | Toggle cheers reaction on a rating | `routes/activity.js` |
| **user_stats_aggregate** | Rating-derived user stats (total_ratings, styles, etc.) | `routes/activity.js` (fire-and-forget style) |
| **create_crew_with_owner** | Create crew + owner member atomically | `routes/crews.js` |
| **get_crew_weekly_challenge** | Current week challenge + progress for crew | `routes/crews.js` |
| **join_crew** | Join crew by invite code | `routes/crews.js` |
| **remove_crew_member** | Remove member (or leave) | `routes/crews.js` |
| **crew_rating_counts_for_user** | (crew_id, total_ratings) for milestone emission | `lib/crewMilestones.js` |
| **toggle_follow** | Follow/unfollow user | `routes/follows.js` |
| **leaderboard_aggregate** | Top reviewers/beers/yg/venues; period + optional crew | `routes/leaderboard.js` |
| **exchange_portfolio** | YG exchange portfolio (view-backed) | `routes/exchange.js` |
| **purchase_cosmetic** | Atomic spend from tabs_ledger + user_cosmetics | `routes/tabs.js` |
| **award_tabs** | Admin or script award (ledger insert) | `routes/tabs.js` |
| **confirm_venue_price** | Confirm price log | `routes/venues.js` |
| **confirm_happy_hour** | Confirm happy hour | `routes/venues.js` |
| **insert_scheduler_notification** | Scheduler: create notification | `scripts/weekly-tabs-eval.js`, `scripts/streak-risk-check.js` |
| **claim_job_run** | Scheduler: claim job (idempotency) | `scripts/weekly-tabs-eval.js`, `scripts/streak-risk-check.js` |
| **complete_job_run** | Scheduler: mark job complete | Same scripts |
| **fail_job_run** | Scheduler: mark job failed | Same scripts |
| **backfill_achievement_cosmetics** | Backfill user_cosmetics for achievement-linked cosmetics | `scripts/check-and-backfill-achievement-cosmetics.js` (path `/rest/v1/rpc/...`) |

**Documented but not called from app code in this scan**: `POST /rpc/refresh_rating_award_profile_cache` is mentioned in API_CONTRACT.md as an endpoint; the actual refresh is triggered from process-event engine (and in-process engine) after awarding tabs, not as a standalone HTTP RPC from the app.

---

## 3. Migration themes

Migrations live in `apps/beerbook-api/supabase/migrations/` (38 files). Themes:

### 3.1 Schema and tables

- **Core domain**: Ratings, profiles, venues, happy_hours, price_logs, catalog (breweries, beers, beer_styles, aliases), comments, reactions.
- **Tabs and achievements**: achievements, user_achievements, tabs_ledger, user_tabs_profile, tier_requirements, tab_transactions (deprecated), tab_notifications; cosmetics and user_cosmetics (borders, avatars, achievement-linked).
- **Social**: follows, crews, crew_members, crew_milestones, weekly_challenges, featured_beers.
- **Features**: head_to_head_* tables, beer_elo_ratings, discovery/ELO; ratings columns (yg_value, serve_type, location_verified, rating_source, guest/owner columns); scheduler/job_run tables for idempotent scripts.

### 3.2 Atomic RPCs and consistency

- **Phase 3 / comment counters**: `create_comment_and_increment`, `delete_comment_and_decrement` replace separate insert/delete + counter updates to avoid drift.
- **Tabs**: `award_rating_tabs_with_cap`, `award_tabs`, `purchase_cosmetic` keep ledger and balances consistent; `refresh_rating_award_profile_cache` updates user_tabs_profile cache.
- **Crews**: `create_crew_with_owner`, `join_crew`, `remove_crew_member` (later migration fixed UUID → text IDs for Keycloak).
- **Venue/deals**: `confirm_venue_price`, `confirm_happy_hour`; social: `toggle_cheers`, `toggle_follow`.
- **Achievements**: `unlock_achievement_with_rewards` (unlock + reward tabs + achievement cosmetics) with idempotency via user_achievements INSERT conflict.

### 3.3 Idempotency and triggers

- **tabs_ledger**: `event_id` UNIQUE; idempotent rating_award, cheers, admin_grant.
- **Trigger**: `tabs_ledger_after_insert` updates `profiles.tabs_balance` on each insert (single source of truth for balance).
- **Scheduler**: `claim_job_run`, `complete_job_run`, `fail_job_run`, `insert_scheduler_notification` for durable, idempotent script runs.

### 3.4 Search and aggregation

- **Search**: `search_beer_catalog`, `search_breweries`, `venues_within_radius` (extended over migrations with style_category, global_elo, etc.).
- **Stats**: `leaderboard_aggregate`, `crew_beer_stats`, `user_stats_aggregate`, `global_stats_counts` move aggregation into the DB (Phase 4).
- **Inferred taste**: `compute_inferred_flavors`; `find_existing_actor_rating` / `find_existing_user_rating` for dedupe.

### 3.5 One-off and fixes

- **Ledger reset**: `20260306_ledger_migration_reset.sql`.
- **Ambiguity fixes**: e.g. `refresh_rating_award_profile_cache` column ambiguity, `create_comment_and_increment` rating_id.
- **Backfill**: `backfill_achievement_cosmetics` RPC and migration for achievement cosmetics.

See `docs/DATABASE_SCHEMAS_OVERVIEW.md` for the current schema outline and function list.

---

## 4. Supabase Edge vs in-process

### 4.1 process-event: two runtimes

- **Edge (Deno)**: `supabase/functions/process-event/` — `index.ts` (HTTP handler, JWT validation) and `engine.ts` (event handling). Uses `@supabase/supabase-js` with `createClient(supabaseUrl, serviceRoleKey)`; calls `admin.rpc(...)` and `admin.from(...).insert/select/upsert` for tabs_ledger, achievements, user_achievements, cosmetics, user_cosmetics, ratings (read).
- **In-process (Node)**: `lib/processEventEngine.js` — same business logic as `engine.ts`, invoked from the BFF when `PROCESS_EVENT_URL` and `SUPABASE_URL` are unset. Uses the same `rest()` helper as the rest of the API (HTTP to PostgREST). Parity is enforced by tests (e.g. `process-event-engine-parity.test.js`, `process-event-engine-cosmetics.test.js`).

### 4.2 When Edge vs in-process is used

- **Invocation**: `lib/processEvent.js` exports `invokeProcessEvent(authHeader, eventType, eventId, payload)`. If `PROCESS_EVENT_URL` (or `SUPABASE_URL` when building the default URL) is set, it **HTTP POSTs** to the Edge function. If both are unset (e.g. self-hosted), it calls **in-process** via `setInProcessHandler()` registered at startup by server.js.
- **Event types**: rating_award, cheers_given, cheers_received, rating_submitted, achievement_unlock, admin_grant, spend. Idempotency for rating_award and cheers and admin_grant is by `event_id` (UUID).
- **Data access**: Edge uses Supabase client (Deno); in-process uses PostgREST HTTP (`rest('POST', '/rpc/...', ...)`). Both call the same RPCs: `refresh_rating_award_profile_cache`, `award_rating_tabs_with_cap`, `unlock_achievement_with_rewards`, and Edge also writes `tabs_ledger` and reads achievements/cosmetics/ratings via client.

### 4.3 Summary

| Aspect | Edge (Deno) | In-process (Node) |
|--------|-------------|-------------------|
| Entry | POST to Supabase Functions `process-event` | `invokeProcessEvent()` → registered handler in server |
| DB access | `@supabase/supabase-js` (RPC + from().select/insert/upsert) | `rest()` to PostgREST (RPC only for engine path) |
| Env | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | REST_URL, SERVICE_ROLE_KEY (same as rest of API) |
| Use case | Hosted Supabase / serverless | Self-hosted, no separate Edge URL |

---

## 5. References

- **Schema**: `apps/beerbook-api/docs/DATABASE_SCHEMAS_OVERVIEW.md`
- **Endpoint list**: `apps/beerbook-api/docs/API_CONTRACT.md`
- **Phase 1**: `apps/beerbook-api/docs/architecture-scan/01-entry-routing-auth.md` (entry, routing, auth)
