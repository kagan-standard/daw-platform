# Database Schemas Overview

This file outlines the current BeerBook database schema across the canonical SQL and Supabase migrations.

## Source Files Used

- `apps/beerbook/docs/database-schema.sql` (canonical baseline)
- `apps/beerbook-api/supabase/migrations/20250301000000_add_ratings_serve_type.sql`
- `apps/beerbook-api/supabase/migrations/20250301100000_add_rating_comments.sql`
- `apps/beerbook-api/supabase/migrations/20250304000000_achievements_tabs_ledger.sql`
- `apps/beerbook-api/supabase/migrations/20260305000000_add_cosmetics_system.sql`
- `apps/beerbook-api/supabase/migrations/20260306000000_update_ratings_yg_value_check.sql`

## Schemas

- `public` (all tables below are in `public`)
- `_realtime` (support schema created for publication setup)

## Core User and Rating Tables

### `profiles`
- **Primary key:** `id` (text)
- **Core columns:** `display_name`, `email`, `avatar_url`, `created_at`, `updated_at`
- **Added later:** `tabs_balance`, `equipped_border_id`, `equipped_title_id`
- **Relationships:**
  - Referenced by `user_tabs_profile.user_id`
  - Referenced by `tab_transactions.user_id`
  - Referenced by `beer_submissions.submitted_by`
  - Referenced by `tab_notifications.user_id`
  - Equipped cosmetic FKs to `cosmetics.id`

### `ratings`
- **Primary key:** `id` (text, uuid string)
- **Core columns:** `user_id`, `user_name`, `beer_name`, `brewery`, `style`, `abv`, `rating`, flavor columns, `notes`, `created_at`, `yg_value`, location columns, `venue_id`, `photo_url`
- **Added later:** `beer_id`, `price_cents`, `serve_type`, `comment_count`
- **Constraints:**
  - `rating` in range 1-5
  - flavor columns in range 0-5
  - `yg_value` in range 0-12
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

## Venue and Pricing Tables

### `venues`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `name`, `address`, `latitude`, `longitude`, `venue_type`, `created_by`, `created_at`, `updated_at`
- **Constraints:** `venue_type` in (`brewery`, `bar`, `restaurant`) or null

### `happy_hours`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `venue_id`, `day_of_week`, `start_time`, `end_time`, `description`, `reported_by`, timestamps and confirmation columns
- **Relationships:** `venue_id -> venues.id` (cascade delete)

### `price_logs`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `venue_id`, `beer_name`, `style`, `price_cents`, `is_happy_hour`, `rating_id`, `logged_by`, timestamps and confirmation columns
- **Relationships:**
  - `venue_id -> venues.id` (cascade delete)
  - `rating_id -> ratings.id` (set null on delete)

## Catalog Tables

### `breweries`
- **Primary key:** `id` (text, uuid string)
- **Columns:** identity/location fields (`name`, `slug`, `normalized_name`, address/city/state/country, geo), contact fields, metadata (`source`, `source_id`, `import_batch_id`, `verified`, `claimed`, `crew_id`), timestamps

### `beers`
- **Primary key:** `id` (text, uuid string)
- **Columns:** naming/style fields, `brewery_id`, review aggregate metrics, flavor notes, ingredients/pairings, media URLs, source/import metadata, timestamps
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
- **Columns:** tier and streak tracking, seeder fields, `tab_balance`, lifetime/weekly counters, timestamps
- **Relationships:** `user_id -> profiles.id` (cascade delete)

### `tab_transactions`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `user_id`, `transaction_type`, `amount`, earn source and multiplier fields, `rating_id`, admin fields, `created_at`
- **Relationships:**
  - `user_id -> profiles.id` (cascade delete)
  - `rating_id -> ratings.id` (set null on delete)

### `tier_requirements`
- **Primary key:** `tier` (`user_tier` enum)
- **Columns:** display fields and weekly/consecutive requirements

### `beer_submissions`
- **Primary key:** `id` (text, uuid string)
- **Columns:** submission/review fields, `status`, `created_beer_id`, `tabs_awarded`, `created_at`
- **Relationships:** `submitted_by -> profiles.id` (cascade delete)

### `tab_notifications`
- **Primary key:** `id` (text, uuid string)
- **Columns:** `user_id`, `notification_type`, `title`, `message`, `metadata`, `is_read`, `created_at`
- **Relationships:** `user_id -> profiles.id` (cascade delete)

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
- **Notes:** append-only ledger; trigger updates `profiles.tabs_balance` after insert

## Cosmetics Tables

### `cosmetics`
- **Primary key:** `id` (uuid)
- **Columns:** `key`, `type`, `name`, `description`, `rarity`, `asset_url`, `preview_asset_url`, `title_text`, `unlock_type`, `achievement_key`, `tab_price`, `active`, `sort_order`, `created_at`
- **Relationships:** `achievement_key -> achievements.key`
- **Uniqueness:** `key`
- **Check constraints:**
  - `type` in (`border`, `title`)
  - `rarity` in (`common`, `rare`, `epic`, `legendary`)
  - `unlock_type` in (`achievement`, `purchase`, `both`)

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
- `tabs_ledger_after_insert()` trigger function to keep `profiles.tabs_balance` in sync
- `purchase_cosmetic(p_user_id text, p_cosmetic_key text)` RPC for atomic cosmetic purchase flow
- `increment_comment_count(rating_id_input text)` and `decrement_comment_count(rating_id_input text)`
- Search/utility functions: `search_beer_catalog`, `search_breweries`, `venues_within_radius`
