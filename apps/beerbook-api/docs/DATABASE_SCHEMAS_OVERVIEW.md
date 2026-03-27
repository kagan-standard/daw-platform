# Database Schemas Overview

Generated: 2026-03-20  
Scope: `apps/beerbook-api/supabase/migrations`

This file outlines the current BeerBook database schema state after applying the BeerBook API Supabase migrations in order.

## Source Files Used

- `apps/beerbook-api/supabase/migrations/20250301000000_add_ratings_serve_type.sql`
- `apps/beerbook-api/supabase/migrations/20250301100000_add_rating_comments.sql`
- `apps/beerbook-api/supabase/migrations/20250304000000_achievements_tabs_ledger.sql`
- `apps/beerbook-api/supabase/migrations/20260305000000_add_cosmetics_system.sql`
- `apps/beerbook-api/supabase/migrations/20260306000000_update_ratings_yg_value_check.sql` (superseded by 20260310100000 for yg range)
- `apps/beerbook-api/supabase/migrations/20260310100000_ratings_yg_value_1_12.sql`
- `apps/beerbook-api/supabase/migrations/20260306_ledger_migration_reset.sql`
- `apps/beerbook-api/supabase/migrations/20260306003000_refresh_rating_award_profile_cache.sql`
- `apps/beerbook-api/supabase/migrations/20260313000000_crew_milestones.sql`
- `apps/beerbook-api/supabase/migrations/20260314000000_weekly_challenges.sql`
- `apps/beerbook-api/supabase/migrations/20260320100000_admin_featured_beers.sql`
- `apps/beerbook-api/supabase/migrations/20260321100000_cosmetics_border_fit.sql`
- `apps/beerbook-api/supabase/migrations/20260329100000_app_config.sql`
- `apps/beerbook-api/supabase/migrations/20260426120000_push_notification_catalog.sql`
- `apps/beerbook-api/supabase/migrations/20260426123000_push_admin_test_type.sql`
- `apps/beerbook-api/supabase/migrations/20260330100000_ratings_yg_value_canonical_half_steps.sql` (canonical YG: `-1` or `1`–`10` in `0.5` steps; backfill from legacy `-6..7` integer scale)

## Schemas

- `public` (all app tables below are in `public`)
- `_realtime` (support schema created for publication setup)

## Core User and Rating Tables

### `profiles`
- **Primary key:** `id` (text)
- **Core columns:** `display_name`, `email`, `avatar_url`, `created_at`, `updated_at`
- **Added columns:** `tabs_balance`, `equipped_border_id`, `equipped_title_id`
- **Tabs note:** `tabs_balance` is the canonical balance, maintained by `tabs_ledger` insert trigger.

### `ratings`
- **Primary key:** `id` (text, uuid string)
- **Core columns:** `user_id`, `user_name`, `beer_name`, `brewery`, `style`, `abv`, `rating`, flavor fields, `notes`, `created_at`, `yg_value`, location fields, `venue_id`, `photo_url`
- **Added columns:** `beer_id`, `price_cents`, `serve_type`, `comment_count`, `rating_source`, `location_verified` (boolean, default false; set when device coords within threshold of venue at create)
- **Constraints:**
  - `rating` in range 1-5
  - flavor fields in range 0-5
  - `yg_value`: `NULL` or **canonical** `-1`, or `1`–`10` in **0.5** steps (`ratings_yg_value_check`; `0` invalid). Nullable for legacy/import; **POST /api/ratings** requires a value via BFF validation.
  - `rating_source` (`'user_submitted'` | `'import'`), default `'user_submitted'`
  - `serve_type` in (`draft`, `can`, `bottle`, `crowler`, `growler`, `nitro`)

### `rating_comments`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `rating_id`, `user_id`, `user_name`, `body`, `created_at`
- **Relationships:** `rating_id -> ratings.id` (cascade delete)
- **Constraints:** `body` length between 1 and 500

### `reactions`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `rating_id`, `user_id`, `reaction_type`, `created_at`
- **Relationships:** `rating_id -> ratings.id` (cascade delete)
- **Uniqueness:** `(rating_id, user_id, reaction_type)`

## App Config

### `app_config`
- **Primary key:** `id` (text, default `'default'`) — single-row table for global app settings
- **Columns:** `theme` (text, not null, default `'default'`; check: `'default'` | `'st_patricks_day'`)
- **Usage:** GET /api/config (read), PATCH /api/admin/config (admin update)

### `push_notification_catalog`
- **Primary key:** `notification_type` (text) — migration-seeded list of types that may participate in push policy
- **Columns:** `label`, `sort_order`, optional `description`

### `push_notification_push_toggle`
- **Primary key:** `notification_type` (text, FK → `push_notification_catalog`)
- **Columns:** `push_enabled` (boolean), `updated_at`
- **Usage:** Push workers read enabled types; admins PATCH via GET/PATCH `/api/admin/push-notification-types`

## Venue and Pricing Tables

### `venues`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `name`, `address`, `latitude`, `longitude`, `venue_type`, `created_by`, `created_at`, `updated_at`
- **Constraints:** `venue_type` in (`brewery`, `bar`, `restaurant`) or null

### `happy_hours`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `venue_id`, `day_of_week`, `start_time`, `end_time`, `description`, `reported_by`, timestamps and confirmation fields
- **Relationships:** `venue_id -> venues.id` (cascade delete)

### `price_logs`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `venue_id`, `beer_name`, `style`, `price_cents`, `is_happy_hour`, `rating_id`, `logged_by`, timestamps and confirmation fields
- **Relationships:**
  - `venue_id -> venues.id` (cascade delete)
  - `rating_id -> ratings.id` (set null on delete)

## Catalog Tables

### `breweries`
- **Primary key:** `id` (text, uuid string)
- **Columns:** identity/location (`name`, `slug`, `normalized_name`, address/city/state/country, geo), contact fields, metadata (`source`, `source_id`, `import_batch_id`, `verified`, `claimed`, `crew_id`), timestamps

### `beers`
- **Primary key:** `id` (text, uuid string)
- **Columns:** naming/style fields, `brewery_id`, review aggregates, flavor notes, ingredients/pairings, media URLs, source/import metadata, timestamps
- **Relationships:** `brewery_id -> breweries.id` (set null on delete)
- **Uniqueness:** `(brewery_id, normalized_name)`

### `beer_styles`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `name`, `category`, `description`, ABV/IBU ranges
- **Uniqueness:** `name`

### `brewery_aliases`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `brewery_id`, `alias_name`, `normalized_alias`, `source`, `created_at`
- **Relationships:** `brewery_id -> breweries.id` (cascade delete)
- **Uniqueness:** `(brewery_id, normalized_alias)`

### `beer_aliases`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `beer_id`, `alias_name`, `normalized_alias`, `source`, `created_at`
- **Relationships:** `beer_id -> beers.id` (cascade delete)
- **Uniqueness:** `(beer_id, normalized_alias)`

### `flavor_descriptors`
- **Primary key:** `id` (serial)
- **Columns:** `category`, `keyword`, `impact`
- **Uniqueness:** `(category, keyword)`

## Tabs and Progression Tables

### `user_tabs_profile`
- **Primary key:** `user_id`
- **Columns:** tier/streak/cache fields, seeder fields, `tab_balance`, `lifetime_tabs_earned`, `ratings_this_week`, inactivity fields, timestamps
- **Relationships:** `user_id -> profiles.id` (cascade delete)
- **Runtime behavior:** real-time cache refreshed on each `rating_award` event via `public.refresh_rating_award_profile_cache(...)`.
- **Important:** `user_tabs_profile.tab_balance` is legacy/cache data and is not the canonical balance source.

### `tab_transactions` (deprecated)
- **Primary key:** `id` (text, uuid string)
- **Columns:** `user_id`, `transaction_type`, `amount`, earn source/multiplier fields, `rating_id`, admin fields, `created_at`
- **Relationships:**
  - `user_id -> profiles.id` (cascade delete)
  - `rating_id -> ratings.id` (set null on delete)
- **Status:** deprecated/orphaned in current backend flows. Kept in schema for compatibility only; active tab movement logic uses `tabs_ledger`.

### `tier_requirements`
- **Primary key:** `tier` (`user_tier` enum)
- **Columns:** display fields and weekly/consecutive requirements

### `beer_submissions`
- **Primary key:** `id` (text, uuid string)
- **Columns:** submission/review fields, `status`, `created_beer_id`, `tabs_awarded`, `created_at`
- **Relationships:** `submitted_by -> profiles.id` (cascade delete)

### `tab_notifications`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `user_id`, `notification_type`, `title`, `message`, `metadata`, `is_read`, `created_at`, `week_start` (Phase 2.10), `target_type`, `target_id` (Phase 3.4)
- **Relationships:** `user_id -> profiles.id` (cascade delete)
- **Phase 3.4 action contract:** `target_type` is one of `beer`, `user`, `crew`, `achievement`, `tabs_profile` (or NULL for legacy/read-only). `target_id` is the destination entity id for navigation on notification press.

## Achievements and Ledger Tables

### `achievement_categories`
- **Primary key:** `key`
- **Columns:** `name`, `icon`, `sort_order`

### `achievements`
- **Primary key:** `id` (uuid)
- **Columns:** `key`, `name`, `description`, `category_key`, `subtype`, `trigger_type`, `rules`, visibility/reward/version fields, `created_at`
- **Relationships:** `category_key -> achievement_categories.key`
- **Uniqueness:** `key`

### `user_achievements`
- **Primary key:** `(user_id, achievement_id)`
- **Columns:** `unlocked_at`, `progress`, `context`
- **Relationships:** `achievement_id -> achievements.id` (cascade delete)

### `tabs_ledger`
- **Primary key:** `id` (uuid)
- **Columns:** `event_id`, `user_id`, `event_type`, `amount`, `breakdown`, `context`, `created_at`
- **Uniqueness:** `event_id` (idempotency key)
- **Status:** sole source of truth for all tab movements (rating awards, cheers, admin grants, achievement rewards, spends).
- **Balance sync:** trigger `tabs_ledger_after_insert()` updates `profiles.tabs_balance` on each insert.

## Cosmetics Tables

### `cosmetics`
- **Primary key:** `id` (uuid)
- **Columns:** `key`, `type`, `name`, `description`, `rarity`, `asset_url`, `preview_asset_url`, `title_text`, `unlock_type`, `achievement_key`, `tab_price`, `active`, `sort_order`, `border_fit` (jsonb, nullable), `created_at`
- **Relationships:** `achievement_key -> achievements.key`
- **Uniqueness:** `key`
- **Note:** `border_fit` is optional per-border fit metadata (scale, rotationDeg, offsetX, offsetY, optional avatarScale); meaningful when `type = 'border'`. Validated in API.

### `user_cosmetics`
- **Primary key:** `id` (uuid)
- **Columns:** `user_id`, `cosmetic_id`, `acquired_via`, `acquired_at`
- **Relationships:** `cosmetic_id -> cosmetics.id` (cascade delete)
- **Uniqueness:** `(user_id, cosmetic_id)`

## Social Tables

### `follows`
- **Primary key:** `(follower_id, followed_id)`
- **Columns:** `created_at`
- **Constraints:** `follower_id != followed_id`

### `crews`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `name`, `created_by`, `invite_code`, `created_at`, `updated_at`
- **Uniqueness:** `invite_code`

### `crew_members`
- **Primary key:** `(crew_id, user_id)`
- **Columns:** `role`, `joined_at`
- **Relationships:** `crew_id -> crews.id` (cascade delete)
- **Constraints:** `role` in (`owner`, `member`)

### `crew_milestones`
- **Primary key:** `id` (uuid)
- **Columns:** `crew_id`, `type`, `occurred_at`, `user_id`, `data` (jsonb), `message`
- **Relationships:** `crew_id -> crews.id` (cascade delete)
- **Constraints:** `type` in (`crew_total_ratings`, `first_venue_visit`, `member_streak`, `leaderboard_rank`)
- **Indexes:** `(crew_id, occurred_at DESC)`; unique partial indexes for idempotency per type (e.g. one milestone per crew/threshold for `crew_total_ratings`).
- **Usage:** Timeline of crew events; read via `GET /api/crews/:id/milestones`; written by backend when ratings/streaks/leaderboard hit thresholds.

### `weekly_challenges`
- **Primary key:** `id` (uuid)
- **Columns:** `week_start`, `week_end`, `title`, `description`, `target_style`, `target_count`, `reward_label`, `reward_badge_id`, `created_at`
- **Constraints:** `week_end > week_start`; unique on `week_start` (one challenge per week).
- **Usage:** One active challenge per week (global); progress computed per crew via `get_crew_weekly_challenge(p_crew_id, p_week_start)`.

### `featured_beers`
- **Primary key:** `id` (uuid)
- **Columns:** `beer_id`, `beer_name`, `brewery`, `style`, `feature_type`, `week_start`, `week_end`, `headline`, `body`, `photo_url`, `created_by`, `created_at`
- **Constraints:** `week_end > week_start`; unique on `(feature_type, week_start)`. Optional FK `beer_id -> beers(id)` when beers table exists.
- **Usage:** Admin-curated "Beer of the Week" picks. `GET /api/highlights/beer-of-the-week` prefers a row for the current week when present; otherwise falls back to auto-computed from ratings. RLS: service_role only.

## Enums

- `user_tier`: `taster`, `regular`, `local`, `patron`, `house_account`, `cellar_reserve`
- `tab_transaction_type`: `earn`, `spend`, `admin_adjust`, `reward_redeem`
- `tab_earn_source`: `rating_base`, `rating_location`, `rating_photo`, `rating_price`, `rating_review`, `new_beer_approved`, `cheers_given`, `cheers_received`, `admin_grant`, `bonus`

## Views

- `beer_averages`
- `yg_exchange`
- `venue_menus`
- `tabs_leaderboard`
- `weekly_tab_activity`
- `crew_summary`
- `follow_counts`

## Functions and Triggers (Schema-impacting)

- `update_updated_at()` trigger function for updated timestamps
- `tabs_ledger_after_insert()` trigger function that keeps `profiles.tabs_balance` in sync with ledger inserts
- `refresh_rating_award_profile_cache(p_user_id text, p_tabs_delta int)` for real-time `user_tabs_profile` cache updates after rating awards
- `purchase_cosmetic(p_user_id text, p_cosmetic_key text)` RPC for atomic cosmetic purchase flow (writes `tabs_ledger` spend + `user_cosmetics`)
- `increment_comment_count(rating_id_input text)` and `decrement_comment_count(rating_id_input text)`
- `get_crew_weekly_challenge(p_crew_id text, p_week_start timestamptz DEFAULT NULL)` — returns current week's challenge + progress for a crew (week = Monday 00:00 UTC to Sunday 23:59.999 UTC)
- `crew_rating_counts_for_user(p_user_id text)` — returns `(crew_id, total_ratings)` for every crew the user belongs to (used when emitting `crew_total_ratings` milestones)
- `leaderboard_aggregate(p_period, p_crew_id, p_limit, p_max_ratings)` — DB-side leaderboard aggregation; supports optional crew scoping
- Search/utility functions: `search_beer_catalog`, `search_breweries`, `venues_within_radius`
