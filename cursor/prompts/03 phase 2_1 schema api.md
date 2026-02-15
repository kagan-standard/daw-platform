# Phase 2.1 — Schema & API Expansion

Apply `cursor/prompts/00_system.md` rules.

## Context Files (read before writing code)
- `ARCHITECTURE.md`
- `DECISIONS.md`
- `apps/beerbook/docs/database-schema.sql` (current schema)
- `apps/beerbook-api/server.js` (current API)
- `infra/compose/docker-compose.yml` (current compose)

## Goal

Expand the database schema and API to support venues, pricing, happy hours, the YG Exchange, geotagging, reactions, photo uploads, user stats, and activity feeds. **No frontend changes in this phase.** This is pure backend — schema + endpoints. Every subsequent phase depends on this being solid.

---

## Task 1: Database Migration

Create `apps/beerbook/docs/migration-2.1.sql` — a single, idempotent migration file.

### 1A: Add columns to `ratings`

```sql
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS yg_value DECIMAL(3,1) CHECK (yg_value >= 0.1 AND yg_value <= 10.0);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS location_name VARCHAR(255);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS venue_id TEXT;
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS photo_url TEXT;
```

### 1B: Create `venues` table

```sql
CREATE TABLE IF NOT EXISTS venues (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL,
    address TEXT,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_venues_geo ON venues(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_venues_name ON venues(name);
GRANT SELECT ON venues TO anon;
```

### 1C: Create `happy_hours` table

```sql
CREATE TABLE IF NOT EXISTS happy_hours (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    description TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_count INTEGER DEFAULT 1,
    last_confirmed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_happy_hours_venue ON happy_hours(venue_id);
CREATE INDEX IF NOT EXISTS idx_happy_hours_day ON happy_hours(day_of_week);
GRANT SELECT ON happy_hours TO anon;
```

### 1D: Create `price_logs` table

```sql
CREATE TABLE IF NOT EXISTS price_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    beer_name TEXT NOT NULL,
    style TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    is_happy_hour BOOLEAN DEFAULT FALSE,
    rating_id TEXT REFERENCES ratings(id) ON DELETE SET NULL,
    logged_by TEXT NOT NULL,
    logged_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_count INTEGER DEFAULT 1,
    last_confirmed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_logs_venue ON price_logs(venue_id);
CREATE INDEX IF NOT EXISTS idx_price_logs_beer ON price_logs(beer_name);
CREATE INDEX IF NOT EXISTS idx_price_logs_logged_at ON price_logs(logged_at DESC);
GRANT SELECT ON price_logs TO anon;
```

### 1E: Create `reactions` table

```sql
CREATE TABLE IF NOT EXISTS reactions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    rating_id TEXT NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    reaction_type TEXT NOT NULL DEFAULT 'cheers' CHECK (reaction_type IN ('cheers')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(rating_id, user_id, reaction_type)
);
CREATE INDEX IF NOT EXISTS idx_reactions_rating ON reactions(rating_id);
GRANT SELECT ON reactions TO anon;
```

### 1F: Geo-search function

```sql
CREATE OR REPLACE FUNCTION venues_within_radius(lat DECIMAL, lng DECIMAL, radius_m INTEGER)
RETURNS SETOF venues AS $$
    SELECT * FROM venues
    WHERE (
        6371000 * acos(
            cos(radians(lat)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians(lng)) +
            sin(radians(lat)) * sin(radians(latitude))
        )
    ) <= radius_m;
$$ LANGUAGE sql STABLE;
```

### 1G: Updated views

```sql
-- Replace beer_averages to include YG data
CREATE OR REPLACE VIEW beer_averages AS
SELECT
    beer_name, brewery, style,
    COUNT(*) as review_count,
    ROUND(AVG(rating)::numeric, 2) as avg_rating,
    ROUND(AVG(yg_value)::numeric, 2) as avg_yg_value,
    ROUND(AVG(flavor_hoppy)::numeric, 1) as avg_hoppy,
    ROUND(AVG(flavor_malty)::numeric, 1) as avg_malty,
    ROUND(AVG(flavor_bitter)::numeric, 1) as avg_bitter,
    ROUND(AVG(flavor_sweet)::numeric, 1) as avg_sweet,
    ROUND(AVG(flavor_fruity)::numeric, 1) as avg_fruity,
    MAX(created_at) as last_reviewed
FROM ratings GROUP BY beer_name, brewery, style ORDER BY avg_rating DESC;

GRANT SELECT ON beer_averages TO anon;

-- YG Exchange rate table
CREATE OR REPLACE VIEW yg_exchange AS
SELECT
    beer_name, brewery, style,
    COUNT(*) as rating_count,
    ROUND(AVG(yg_value)::numeric, 2) as yg_rate,
    ROUND(AVG(rating)::numeric, 2) as avg_stars,
    MIN(yg_value) as yg_low,
    MAX(yg_value) as yg_high
FROM ratings
WHERE yg_value IS NOT NULL
GROUP BY beer_name, brewery, style
ORDER BY yg_rate DESC;

GRANT SELECT ON yg_exchange TO anon;

-- Venue menu view (latest prices per venue per beer)
CREATE OR REPLACE VIEW venue_menus AS
SELECT DISTINCT ON (venue_id, beer_name)
    venue_id, beer_name, style, price_cents,
    is_happy_hour, logged_by, logged_at,
    confirmed_count, last_confirmed_at
FROM price_logs
ORDER BY venue_id, beer_name, logged_at DESC;

GRANT SELECT ON venue_menus TO anon;
```

### 1H: Update canonical schema

After migration runs, update `apps/beerbook/docs/database-schema.sql` to reflect the full merged schema (existing + new tables/columns/views). This is the single source of truth for "what does the DB look like now."

**Success criteria:**
- [ ] Migration runs without error: `docker exec supabase-db psql -U postgres -f /path/to/migration-2.1.sql`
- [ ] `\dt` shows: `profiles`, `ratings`, `venues`, `happy_hours`, `price_logs`, `reactions`
- [ ] `\d ratings` shows new columns: `yg_value`, `latitude`, `longitude`, `location_name`, `venue_id`, `photo_url`
- [ ] `SELECT * FROM yg_exchange LIMIT 1;` returns columns (empty is fine — no YG data yet)
- [ ] `SELECT * FROM venue_menus LIMIT 1;` returns columns
- [ ] Existing data intact: `SELECT count(*) FROM ratings` matches pre-migration count

---

## Task 2: API Expansion

Add new endpoints to `apps/beerbook-api/server.js`. Follow existing patterns: `parsePagination()`, `authMiddleware`, `rest()` proxy, `validateSort`. If server.js exceeds ~600 lines after additions, split into route files (`routes/venues.js`, `routes/exchange.js`, etc.) and import them. Keep the main `server.js` as the entrypoint.

### 2A: Modify existing `POST /api/ratings`

Add new optional fields to the record object:
```javascript
yg_value: b.yg_value ?? null,
latitude: b.latitude ?? null,
longitude: b.longitude ?? null,
location_name: b.location_name ?? null,
venue_id: b.venue_id ?? null,
photo_url: b.photo_url ?? null,
```

Validation:
- If `yg_value` provided, must be >= 0.1 and <= 10.0
- If `latitude` provided, `longitude` must also be provided (and vice versa)
- All new fields are optional — existing rating submissions must still work unchanged

### 2B: Beer endpoints

```
GET  /api/beers              → paginated beer list from beer_averages view (includes avg_yg_value)
GET  /api/beers/:name        → single beer: aggregated stats + all individual ratings + price history
GET  /api/beers/search?q=X   → autocomplete, top 10 matches by ILIKE prefix on beer_name
```

Autocomplete query: `SELECT DISTINCT beer_name, brewery, style FROM ratings WHERE beer_name ILIKE $1 || '%' LIMIT 10`
- Use parameterized query via PostgREST: `/ratings?beer_name=ilike.${q}*&select=beer_name,brewery,style&limit=10`
- Deduplicate by beer_name in the response

### 2C: YG Exchange endpoints

```
GET  /api/exchange                    → full rate table from yg_exchange view, paginated
GET  /api/exchange/:beer_name         → single beer YG rate + cross-rates vs top 10 other beers
GET  /api/exchange/portfolio/:user_id → user's rated beers with YG values + total portfolio value
```

Cross-rate calculation:
```javascript
// For beer A vs beer B: cross_rate = avg_yg_A / avg_yg_B
// Meaning: 1 of beer A = cross_rate of beer B
```

Portfolio: query all ratings for user where `yg_value IS NOT NULL`, sum `yg_value` for total.

### 2D: Venue endpoints

```
GET    /api/venues                → paginated; supports ?lat=X&lng=Y&radius=Z (meters, default 5000)
GET    /api/venues/:id            → venue detail: info + latest prices + happy hours + ratings at this venue
POST   /api/venues                → auth required; { name, address, latitude, longitude }
```

Geo-filtering: use the `venues_within_radius` function via PostgREST RPC: `/rpc/venues_within_radius?lat=X&lng=Y&radius_m=Z`

### 2E: Price & Happy Hour endpoints

```
GET    /api/venues/:id/prices                → price logs for venue, paginated, most recent first
POST   /api/venues/:id/prices                → auth; { beer_name, style, price_cents, is_happy_hour }
POST   /api/venues/:id/prices/:id/confirm    → auth; increment confirmed_count + update last_confirmed_at

GET    /api/venues/:id/happy-hours           → happy hours for venue
POST   /api/venues/:id/happy-hours           → auth; { day_of_week, start_time, end_time, description }
POST   /api/venues/:id/happy-hours/:id/confirm → auth; confirm existing happy hour
```

### 2F: Deals endpoint (the killer query)

```
GET  /api/deals?lat=X&lng=Y&radius=Z → best beers near me right now
```

Logic:
1. Find venues within radius (via `venues_within_radius`)
2. Get latest prices at those venues (from `venue_menus` view)
3. Check active happy hours: current `day_of_week` + current time between `start_time` and `end_time`
4. For each beer at each venue, calculate:
   - `yg_rate` from `yg_exchange` view (if available)
   - `yg_per_dollar` = `yg_rate / (price_cents / 100)` — higher = better value
   - `avg_stars` from `beer_averages`
5. Sort by `yg_per_dollar` DESC
6. Include: venue name, distance, beer name, price, happy hour status, YG rate, stars

Response shape:
```json
{
    "data": [{
        "beer_name": "Sierra Nevada Pale Ale",
        "venue": { "id": "...", "name": "Kelly's Taproom", "distance_m": 640 },
        "price_cents": 400,
        "is_happy_hour": true,
        "happy_hour_ends_at": "18:00",
        "yg_rate": 2.1,
        "avg_stars": 4.2,
        "yg_per_dollar": 0.53
    }]
}
```

### 2G: Social & activity endpoints

```
GET    /api/activity              → recent activity: latest ratings + new venues (limit 50)
POST   /api/ratings/:id/cheers    → auth; toggle cheers (insert if not exists, delete if exists)
GET    /api/ratings/:id/cheers    → public; { count, users: [...] }

GET    /api/users/:id             → public user profile: display_name, avatar, join date, total ratings
GET    /api/users/:id/stats       → personal stats breakdown (total ratings, avg rating, avg YG, styles, etc.)
```

User stats response: total_ratings, total_styles, avg_rating, avg_yg_value, total_yg_portfolio, most_rated_style, highest_rated_beer, style_distribution, rating_distribution, monthly_activity.

### 2H: Map endpoints

```
GET  /api/map                → all geotagged ratings with venue info (for Leaflet pins)
GET  /api/map/user/:id       → single user's beer trail (geotagged ratings, chronological)
```

### 2I: Leaderboard endpoint

```
GET  /api/leaderboard?period=weekly|monthly|alltime → top reviewers, top beers, top YG values, most venues
```

Weekly = last 7 days rolling. Monthly = last 30 days rolling.

### 2J: Photo upload

```
POST /api/upload              → auth; multipart/form-data image upload
```

Implementation:
- Add `multer` to `package.json`
- Store in `/data/uploads/` inside container (mounted volume)
- Filename: `{user_id}_{timestamp}_{random}.{ext}`
- Validate: max 5MB, only jpg/png/webp
- Return: `{ url: "/uploads/{filename}" }`
- Add `uploads_data` named volume to docker-compose
- Serve via nginx: add `location /uploads/` block pointing to the shared volume

### 2K: Beer of the Week

```
GET  /api/highlights/beer-of-the-week → highest avg-rated beer first reviewed in last 7 days (min 2 ratings)
```

---

## Task 3: Docker Compose Updates

- Add `uploads_data` named volume
- Mount `uploads_data` in both `beerbook-api` (write) and `beerbook` nginx (read/serve)
- Add nginx config for `/uploads/` location if needed (or mount volume at the right path)
- Bump beerbook-api image tag to `1.1.0`

---

## Constraints

- **No frontend changes.** Do not modify anything in `apps/beerbook/` except `docs/database-schema.sql`.
- Follow existing API patterns exactly (pagination, auth, PostgREST proxy)
- All schema DDL is idempotent (`IF NOT EXISTS`, `IF EXISTS`, `DO $$ EXCEPTION`)
- All new API endpoints must include input validation and proper error responses
- Test all endpoints via curl before declaring success

## Required Output

1. Plan (max 12 bullets)
2. `apps/beerbook/docs/migration-2.1.sql`
3. Updated `apps/beerbook/docs/database-schema.sql`
4. Updated (or split) `apps/beerbook-api/server.js`
5. Updated `apps/beerbook-api/package.json` (add multer)
6. Updated `infra/compose/docker-compose.yml`
7. Validation commands (curl for every new endpoint)
8. Rollback steps

## Agent Assumption Log

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| | | | |