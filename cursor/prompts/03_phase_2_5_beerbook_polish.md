# Phase 2.5 — BeerBook: The Full Experience

Apply `cursor/prompts/00_system.md` rules.

Existing architecture: `ARCHITECTURE.md`, `DECISIONS.md`, `PHASE1.md` (Tasks 2.5–6).
Current frontend: `apps/beerbook/` (vanilla JS, no frameworks, no build step).
Current API: `apps/beerbook-api/server.js` (Node/Express → PostgREST internal).
Current schema: `apps/beerbook/docs/database-schema.sql`.
Current styles: `apps/beerbook/styles.css` (warm amber/mahogany pub theme).
OIDC pattern: `apps/beerbook/supabase.js` (Keycloak PKCE flow).

---

## Goal

Transform BeerBook from a basic rating app into a full-featured beer discovery platform. After Phase 2.5, a user should be able to: rate beers with rich detail, compare beers using the YG Exchange system, find the cheapest/best beer near them, explore venues with happy hour intel, view personal and community stats, and browse a map of everywhere the crew has been drinking.

---

## Workstream 1: Schema & Database Expansion

### 1A: Modify `ratings` table

Add columns (all nullable, backward-compatible with existing data):

```sql
-- YG Exchange: comparative value (how many Yuengling Golden Pilsners is this beer worth?)
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS yg_value DECIMAL(3,1) CHECK (yg_value >= 0.1 AND yg_value <= 10.0);

-- Geotagging
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS latitude DECIMAL(9,6);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS longitude DECIMAL(9,6);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS location_name VARCHAR(255);

-- Venue link (nullable FK — ratings can exist without a venue)
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS venue_id TEXT;

-- Photo (stored as relative path or URL)
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS photo_url TEXT;
```

### 1B: New `venues` table

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

### 1C: New `happy_hours` table

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

### 1D: New `price_logs` table

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

### 1E: New `reactions` table

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

### 1F: Updated views

```sql
-- Replace existing beer_averages view to include YG data
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
FROM ratings
GROUP BY beer_name, brewery, style
ORDER BY avg_rating DESC;

GRANT SELECT ON beer_averages TO anon;

-- YG Exchange view: the full exchange rate table
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

-- Venue beer menu view: latest known prices per venue
CREATE OR REPLACE VIEW venue_menus AS
SELECT DISTINCT ON (venue_id, beer_name)
    venue_id, beer_name, style, price_cents,
    is_happy_hour, logged_by, logged_at,
    confirmed_count, last_confirmed_at
FROM price_logs
ORDER BY venue_id, beer_name, logged_at DESC;

GRANT SELECT ON venue_menus TO anon;
```

### 1G: Migration safety

- All schema changes are `ADD COLUMN IF NOT EXISTS` or `CREATE TABLE IF NOT EXISTS`
- No existing columns modified or dropped
- No data migration needed — new columns are nullable
- Run migration SQL via `docker exec supabase-db psql -U postgres -f /path/to/migration.sql`
- Update `apps/beerbook/docs/database-schema.sql` with the canonical merged schema

**Success criteria:**
- [ ] All new tables exist: `venues`, `happy_hours`, `price_logs`, `reactions`
- [ ] `ratings` table has new columns: `yg_value`, `latitude`, `longitude`, `location_name`, `venue_id`, `photo_url`
- [ ] Views `beer_averages`, `yg_exchange`, `venue_menus` return data
- [ ] Existing ratings data is untouched (run `SELECT count(*) FROM ratings` before and after)

---

## Workstream 2: API Expansion (`apps/beerbook-api/server.js`)

All new endpoints follow existing patterns: pagination via `parsePagination()`, auth via `authMiddleware`, proxy to PostgREST via `rest()`.

### 2A: Modified endpoints

**`POST /api/ratings`** — extend to accept new optional fields:
```javascript
// Add to the record object:
yg_value: b.yg_value ?? null,           // decimal 0.1–10.0
latitude: b.latitude ?? null,           // decimal
longitude: b.longitude ?? null,         // decimal
location_name: b.location_name ?? null, // string
venue_id: b.venue_id ?? null,           // string (FK to venues)
photo_url: b.photo_url ?? null,         // string
```

Validate: if `yg_value` provided, must be between 0.1 and 10.0. If `latitude` provided, `longitude` must also be provided (and vice versa).

### 2B: Beer endpoints

```
GET  /api/beers                → paginated, deduplicated beer list from beer_averages view
GET  /api/beers/:name          → single beer detail: avg rating, YG rate, all individual ratings, price history
GET  /api/beers/search?q=X     → autocomplete search, returns top 10 matches by beer_name (ILIKE prefix match)
```

**Autocomplete implementation:** Query `SELECT DISTINCT beer_name, brewery, style FROM ratings WHERE beer_name ILIKE $1 || '%' LIMIT 10`. Return as flat list for typeahead.

### 2C: YG Exchange endpoints

```
GET  /api/exchange             → full YG exchange rate table (from yg_exchange view), paginated
GET  /api/exchange/:beer_name  → single beer's YG rate + cross-rates against top 10 other beers
GET  /api/exchange/portfolio/:user_id → user's rated beers with YG values, total portfolio value
```

**Cross-rate calculation** for `/api/exchange/:beer_name`:
```javascript
// beer A's rate = avg_yg_A, beer B's rate = avg_yg_B
// cross_rate = avg_yg_A / avg_yg_B
// meaning: 1 of beer A = cross_rate of beer B
```

### 2D: Venue endpoints

```
GET    /api/venues              → paginated list; supports ?lat=X&lng=Y&radius=Z (meters, default 5000)
GET    /api/venues/:id          → single venue with: details, beer menu (latest prices), happy hours, ratings at venue
POST   /api/venues              → auth required; create venue { name, address, latitude, longitude }
```

**Geo-filtering:** Use Haversine approximation in PostgREST filter or raw SQL via a Postgres function:
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

### 2E: Price & Happy Hour endpoints

```
GET    /api/venues/:id/prices       → all price logs for a venue, paginated, most recent first
POST   /api/venues/:id/prices       → auth required; log a price { beer_name, style, price_cents, is_happy_hour }
POST   /api/venues/:id/prices/:id/confirm → auth required; increment confirmed_count + update last_confirmed_at

GET    /api/venues/:id/happy-hours   → happy hours for venue (all days)
POST   /api/venues/:id/happy-hours   → auth required; log happy hour { day_of_week, start_time, end_time, description }
POST   /api/venues/:id/happy-hours/:id/confirm → auth required; confirm existing happy hour

GET    /api/deals?lat=X&lng=Y&radius=Z → THE KILLER QUERY: best beers near me right now
```

**Deals endpoint logic (`GET /api/deals`):**
1. Find venues within radius
2. Get latest prices at those venues
3. Check which venues have active happy hours RIGHT NOW (current day_of_week + current time)
4. For each beer at each venue, calculate:
   - `effective_price` = price (or happy hour price if active)
   - `yg_rate` = from yg_exchange view (if available)
   - `yg_per_dollar` = yg_rate / (effective_price / 100) — higher is better value
   - `avg_stars` = from beer_averages
5. Return sorted by `yg_per_dollar` DESC (best value first), with venue details, happy hour status, and distance
6. Include `happy_hour_active: true/false` and `happy_hour_ends_at` if active

**Response shape:**
```json
{
    "data": [
        {
            "beer_name": "Sierra Nevada Pale Ale",
            "venue": { "id": "...", "name": "Kelly's Taproom", "distance_m": 640 },
            "price_cents": 400,
            "is_happy_hour": true,
            "happy_hour_ends_at": "18:00",
            "yg_rate": 2.1,
            "avg_stars": 4.2,
            "yg_per_dollar": 0.53,
            "last_reported": "2025-02-14T..."
        }
    ]
}
```

### 2F: Social endpoints

```
GET    /api/activity             → recent activity feed: latest ratings, new users, new venues (limit 50)
POST   /api/ratings/:id/cheers   → auth required; toggle cheers reaction (insert or delete)
GET    /api/ratings/:id/cheers   → public; count + list of users who cheered

GET    /api/users/:id            → public user profile: display_name, avatar, join date, total ratings
GET    /api/users/:id/stats      → personal stats breakdown (see below)
```

**User stats response (`GET /api/users/:id/stats`):**
```json
{
    "total_ratings": 47,
    "total_styles": 12,
    "avg_rating": 3.8,
    "avg_yg_value": 2.1,
    "total_yg_portfolio": 98.7,
    "most_rated_style": "IPA",
    "highest_rated_beer": { "beer_name": "Tree House Julius", "rating": 5, "yg_value": 4.1 },
    "total_venues": 8,
    "total_cities": 4,
    "style_distribution": { "IPA": 15, "Stout": 10, "Lager": 8, ... },
    "rating_distribution": { "1": 2, "2": 5, "3": 12, "4": 18, "5": 10 },
    "monthly_activity": [{ "month": "2025-01", "count": 8 }, ...],
    "first_rating_at": "2024-06-15T...",
    "latest_rating_at": "2025-02-14T..."
}
```

### 2G: Map endpoint

```
GET  /api/map                   → all geotagged ratings with venue info, clustered-ready
GET  /api/map/user/:id          → single user's beer trail (geotagged ratings in chronological order)
GET  /api/map/heatmap           → density data: { latitude, longitude, count } grouped by ~0.01 degree grid
```

### 2H: Leaderboard endpoint (time-bounded)

```
GET  /api/leaderboard?period=weekly|monthly|alltime → top reviewers, top beers, top values
```

### 2I: Photo upload endpoint

```
POST /api/upload                → auth required; multipart/form-data, accepts image
```

**Implementation:**
- Use `multer` for multipart parsing in Express
- Store images in a Docker volume mounted at `/data/uploads/` (or Hetzner object storage later)
- Generate unique filename: `{user_id}_{timestamp}_{random}.{ext}`
- Validate: max 5MB, only jpg/png/webp
- Return `{ url: "/uploads/{filename}" }`
- Serve uploads via nginx (add location block to beerbook nginx config)
- Add `uploads_data` named volume to docker-compose

### 2J: Weekly highlight (auto-calculated)

```
GET  /api/highlights/beer-of-the-week → highest avg-rated beer first reviewed in the last 7 days (min 2 ratings)
```

**Success criteria:**
- [ ] All existing endpoints still work (no regressions)
- [ ] New endpoints return correct data shapes
- [ ] Auth-required endpoints reject unauthenticated requests with 401
- [ ] Pagination works on all list endpoints
- [ ] Deals endpoint correctly factors in current time for happy hour detection
- [ ] Photo upload stores file and returns accessible URL
- [ ] Beer search autocomplete returns results within 200ms

---

## Workstream 3: Frontend — Rating Form Upgrade

### 3A: Star rating input

Replace the number input for rating with a clickable/tappable star component:
- 5 stars, click to set rating (1–5)
- Half-star support: click left half of star = X.5 (optional, can defer)
- Visual: filled gold stars for selected, outlined for unselected
- Mobile: large enough tap targets (min 44px per star)
- Animate on selection (brief scale pulse)

### 3B: Beer name autocomplete

- Add typeahead to the beer_name input field
- On each keystroke (debounced 300ms), call `GET /api/beers/search?q={input}`
- Show dropdown with matching beers: "beer_name — brewery (style)"
- Selecting a suggestion auto-fills beer_name, brewery, and style fields
- Allow freeform entry if no match (new beer)
- Style dropdown to match existing dark theme

### 3C: YG Value input

Add a new form field after the star rating:

```html
<div class="form-group yg-input-group">
    <label>YG Value <span class="label-hint">How many Yuengling Golden Pilsners is this worth?</span></label>
    <div class="yg-slider-row">
        <input type="range" min="0.5" max="5" step="0.5" value="1" id="yg-slider">
        <span class="yg-display">1.0 YG</span>
    </div>
    <div class="yg-context">
        <!-- Show contextual hint based on value -->
        <!-- 0.5 = "Barely worth half a YG" -->
        <!-- 1.0 = "Equal to a YG" (baseline) -->
        <!-- 2.0+ = "You'd trade 2 YGs for this" -->
        <!-- 4.0+ = "Premium territory 🏆" -->
    </div>
</div>
```

- Range slider (0.5–5.0, step 0.5) with large draggable thumb for mobile
- Extend range up to 10.0 via manual text entry next to slider
- Show dynamic emoji/text hint based on current value
- Optional — user can skip (null yg_value)
- Gold-themed slider track matching app aesthetic

### 3D: Geotag capture

Add "📍 Add Location" button to rating form:
- On click: request browser geolocation (`navigator.geolocation.getCurrentPosition`)
- On success: reverse geocode via Nominatim (`https://nominatim.openstreetmap.org/reverse?lat=X&lon=Y&format=json`)
  - **IMPORTANT:** Nominatim requires a custom `User-Agent` header (use `BeerBook/1.0`). Respect rate limit (1 req/sec).
  - Extract: `display_name` or build from `address.amenity`, `address.road`, `address.city`, `address.state`
- Show location name in a chip/badge below the button with an "✕" to remove
- Also show a "Type location manually" fallback text input
- On deny/error: show manual input automatically, no error shaming
- Auto-create venue if coordinates don't match an existing venue within 100m radius

### 3E: Photo upload

Add "📷 Add Photo" button:
- Opens file picker (accept `image/jpeg, image/png, image/webp`)
- Also allow camera capture on mobile (`capture="environment"`)
- Show thumbnail preview after selection
- Upload to `/api/upload` on form submit (before rating POST)
- Attach returned `photo_url` to rating payload
- Max 5MB, compress client-side if larger (use canvas resize to max 1200px wide)
- Show upload progress indicator

### 3F: Price logging (optional, tied to venue)

If a venue is attached (via geotag or manual venue selection):
- Show collapsible "💰 Log a price" section
- Fields: price (dollar input, stored as cents), is_happy_hour checkbox
- Submitted alongside rating as a separate API call to `POST /api/venues/:id/prices`
- If no venue, price section is hidden

### 3G: Toast notifications

- Create a toast notification system (reuse existing `.toast-container` CSS)
- Show on: rating saved, rating deleted, cheers given, price logged, location captured
- Auto-dismiss after 3 seconds
- Stack multiple toasts
- Types: success (green), error (red), info (blue)

**Success criteria:**
- [ ] Star rating input works on desktop and mobile
- [ ] Beer autocomplete suggests existing beers within 300ms
- [ ] YG slider submits correct value to API
- [ ] Geolocation capture works and shows human-readable location name
- [ ] Photo upload works, preview displays, URL saved with rating
- [ ] Price log submits correctly when venue is present
- [ ] Toast notifications appear for all key actions
- [ ] All new fields are optional — form still works with just beer_name, style, rating

---

## Workstream 4: The YG Exchange

The YG Exchange is a comparative beer rating system where Yuengling Golden Pilsner (YG) serves as the reserve currency. Every beer gets a YG exchange rate based on community ratings.

### 4A: Trading Floor view (new nav item: "📈 Exchange")

**Layout:** Styled like a stock exchange ticker.

**Components:**
1. **Exchange Rate Table** — all beers with YG rates, sortable
   ```
   THE YG EXCHANGE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Beer                     │ YG Rate │ ⭐  │ Trend │ Ratings
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Tree House Julius        │ 4.1 YG  │ 4.8 │ ↑     │ 12
   Guinness Draught         │ 2.4 YG  │ 4.2 │ ↓     │ 23
   Sierra Nevada PA         │ 1.8 YG  │ 3.9 │ —     │ 8
   Yuengling Golden Pilsner │ 1.0 YG  │ 🔒  │ 🔒    │ —
   Bud Light                │ 0.3 YG  │ 2.1 │ ↓     │ 5
   ```

2. **Trend indicator:** Compare current avg YG to avg YG from >30 days ago. ↑ if higher, ↓ if lower, — if stable (or insufficient historical data).

3. **YG Parity Index** — summary card showing average YG-per-dollar by beer style:
   ```
   Best value per YG dollar:
   Lager: 0.62 YG/$   |   IPA: 0.41 YG/$   |   Stout: 0.38 YG/$
   ```

4. **Cross-Rate Calculator** — interactive widget:
   - Select Beer A and Beer B from dropdowns
   - Shows: "1 {Beer A} = {cross_rate} {Beer B}"
   - Example: "1 Tree House Julius = 1.71 Guinness Draught"

5. **"Would You Trade?"** — fun engagement widget:
   - Shows two random beers with their cross-rate
   - "The crew says 1 Tree House Julius = 2.3 Guinness. Fair trade?"
   - Users tap 👍 or 👎 (stored client-side or as a lightweight API, can be Phase 3)

6. **Arbitrage Alerts** — if two users' YG valuations for the same beer differ by more than 2.0, surface it:
   - "🔔 @Alex values Guinness at 3.5 YG but @Mike says 1.5 YG — settle this over a pint?"

### 4B: Portfolio view (on user profile page)

- Show user's rated beers as a "portfolio" with total YG value
- "Your beer portfolio: 47.3 YGs across 15 beers"
- Table of their ratings with YG values, sorted by value
- Pie chart showing YG allocation by style

### 4C: YG badge on all rating cards

Everywhere a rating is displayed (activity feed, browse, beer detail), show the YG value:
- Small badge: "2.4 YG" in gold, next to the star rating
- Only show if yg_value is not null

**Success criteria:**
- [ ] Exchange view loads with rate table from API
- [ ] Cross-rate calculator works for any two beers with YG data
- [ ] YG badges appear on rating cards when yg_value exists
- [ ] Portfolio view shows on user profile with correct total
- [ ] YG rate of 1.0 is always displayed for "Yuengling Golden Pilsner" as the baseline anchor

---

## Workstream 5: Beer Map & Venues

### 5A: Map view (new nav item: "🗺️ Map")

**Tech:** Leaflet.js (free, no API key)
- CDN: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` + CSS
- Marker clustering plugin: `https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js`

**Layout:**
- Full-width map taking most of the viewport
- Sidebar/drawer (collapsible on mobile) with venue list + filters
- Filter controls: style, min rating, max price, happy hour active now

**Map features:**
1. **Pins for venues** — color-coded by type (bar, brewery, restaurant, store) or by avg rating
2. **Pin popup on click:** venue name, top 3 beers, avg rating, "Happy Hour NOW" badge if active, link to venue detail
3. **Marker clustering** at low zoom levels
4. **User's location** — blue pulsing dot (if geolocation granted)
5. **Heat map layer toggle** — density of ratings by area (use Leaflet.heat plugin)

### 5B: Beer Trail (on user profile or as map filter)

- Show one user's geotagged ratings as a connected path on the map
- Chronological order with numbered markers
- Popup shows: beer name, rating, date, YG value
- Stats shown: "12 beers across 6 venues in 3 cities"

### 5C: Venue detail page

Accessible via map pin click or direct URL (rendered as a modal or in-page view):

**Sections:**
1. **Header:** Venue name, address, map thumbnail
2. **Beer Menu:** Latest reported prices, sorted by price. Each row: beer name, price, happy hour price, last reported, confirmed count, "Confirm" button
3. **Happy Hours:** By day of week, with times and descriptions. "🟢 Active NOW" badge if currently in happy hour window. Stale data warning if >90 days unconfirmed.
4. **Ratings at this venue:** All ratings geotagged to this venue
5. **Stats:** Total beers rated here, avg rating, most popular beer, best YG value
6. **"Log a Price" button** — opens quick price entry form (auth required)
7. **"Add Happy Hour" button** — opens happy hour form (auth required)

### 5D: "Best Beer Near Me" (the north star feature)

- Prominent button/card on dashboard: "🍺 Find the best beer near me"
- On click: request geolocation, then call `GET /api/deals?lat=X&lng=Y`
- Results show as cards sorted by YG-per-dollar:
  ```
  🥇 Sierra Nevada Pale Ale — Kelly's Taproom (0.4 mi)
     $4.00 (Happy Hour! Ends in 47min) · 2.1 YG · 4.2⭐ · 0.53 YG/$
  
  🥈 Guinness Draught — The Blind Pig (0.8 mi)
     $6.50 · 2.4 YG · 4.0⭐ · 0.37 YG/$
  ```
- Also show on map with route/distance

**Success criteria:**
- [ ] Leaflet map renders with venue pins
- [ ] Marker clustering works at low zoom
- [ ] Venue popup shows key info
- [ ] Venue detail page shows prices, happy hours, ratings
- [ ] "Confirm" button increments count on prices and happy hours
- [ ] Stale data (>90 days) shows warning badge
- [ ] Beer trail renders connected path for a user
- [ ] Deals endpoint returns correctly sorted results factoring in current time
- [ ] "Best Beer Near Me" flow works end-to-end

---

## Workstream 6: Dashboard Polish & Stats

### 6A: Enhanced stats cards

Current stats grid shows 4 cards. Expand to include:
- Total Beers Rated (existing)
- Total Reviews (existing)
- Active Reviewers (existing)
- Average Rating (existing)
- **NEW:** Total Venues Discovered
- **NEW:** Average YG Value (community-wide)
- **NEW:** Beer of the Week (auto-calculated, most recent 7 days)
- **NEW:** Happy Hours Active Now (count, with link to map)

Use skeleton loading states (shimmer animation) while data loads.

### 6B: Charts (Chart.js — already in use via `charts.js`)

Extend existing chart section:
- **Radar chart:** community flavor profile (existing data: hoppy, malty, bitter, sweet, fruity)
- **Style distribution:** doughnut chart (existing, enhance with better colors/labels)
- **Rating distribution:** bar chart showing count of 1-star through 5-star ratings
- **YG Distribution:** histogram of YG values across all ratings
- **Monthly activity:** line chart showing ratings per month over time
- **Price trends:** line chart showing avg beer price over time (from price_logs)

### 6C: Activity feed

New section on dashboard below stats:

```
RECENT ACTIVITY
━━━━━━━━━━━━━━━━━━
🍺 Alex rated Tree House Julius ⭐⭐⭐⭐⭐ (4.1 YG) at The Blind Pig
   "Absolute banger of an IPA" · 2 hours ago · 🍻 3 cheers

📍 Mike discovered a new venue: Kelly's Taproom, Philadelphia
   3 hours ago

💰 Sarah logged a price: Guinness Draught $6.50 at The Blind Pig
   5 hours ago

🎉 Jordan joined BeerBook!
   Yesterday
```

- Fetch from `GET /api/activity`
- Show avatar (from Keycloak `picture` claim or initials circle), username, action, timestamp
- Cheers count shown inline with 🍻 emoji
- Click rating to expand/navigate to detail
- Infinite scroll or "Load more" button

### 6D: Better empty states

For every view that can be empty, create an illustrated empty state:
- **No ratings yet:** "🍺 No beers rated yet. Be the first to crack one open!"
- **No venues nearby:** "📍 No venues spotted near you yet. Rate a beer somewhere to put it on the map!"
- **No YG data:** "📈 The Exchange is quiet. Start rating beers with YG values to see the market come alive!"
- **No happy hours:** "🕐 No happy hours logged here yet. Know the specials? Share the intel!"
- **No prices:** "💰 No prices reported. Be the hero — log what you're paying!"

Use consistent styling: centered, light amber text, relevant emoji, call-to-action button.

### 6E: Leaderboard upgrades

Add time-period tabs: **This Week** | **This Month** | **All Time**

New leaderboard categories:
- 🏆 Top Reviewers (most ratings in period)
- ⭐ Highest Rated Beers (in period)
- 🍺 Most Reviewed Beers (in period)
- 📈 Top YG Values (highest avg YG beers in period)
- 💰 Best Value Hunters (highest avg YG-per-dollar — the "Cheapskate Leaderboard")
- 📍 Most Venues Visited (in period)
- 🍻 Most Cheers Received (in period)

**Success criteria:**
- [ ] Stats cards load with skeleton states
- [ ] All charts render with real data
- [ ] Activity feed shows recent actions with avatars and timestamps
- [ ] Empty states display for all empty views
- [ ] Leaderboard tabs switch between weekly/monthly/all-time
- [ ] New leaderboard categories populate correctly

---

## Workstream 7: Social & Discovery

### 7A: User profile page

New nav view or modal accessible by clicking a username anywhere in the app.

**Sections:**
1. **Header card:** Avatar (large), display name, member since, total ratings
2. **Personal stats grid:** (from `/api/users/:id/stats`)
   - Total ratings, avg rating, avg YG value, total YG portfolio
   - Favorite style, highest rated beer
   - Total venues visited, total cities
3. **YG Portfolio:** table of their beers with YG values, portfolio total
4. **Flavor profile radar chart:** their personal flavor averages
5. **Style distribution:** their rated styles as doughnut chart
6. **Rating distribution:** bar chart of their 1–5 star spread
7. **Monthly activity:** line chart of their ratings over time
8. **Recent ratings:** last 10 ratings with full detail
9. **Beer trail map:** small Leaflet map of their geotagged ratings

### 7B: Beer detail page

Accessible by clicking a beer name anywhere in the app.

**Sections:**
1. **Header:** Beer name, brewery, style, ABV (if known)
2. **Aggregate stats:** avg rating, YG rate, review count, flavor radar chart
3. **Price info:** cheapest current price with venue, price history chart
4. **All ratings:** every individual rating for this beer, with user, date, notes, photo, venue
5. **YG context:** "This beer is worth {X} YGs. That's equivalent to {Y} Bud Lights or {Z} of a Tree House Julius."
6. **"Rate this beer" button** — opens rating form pre-filled with beer name, brewery, style

### 7C: Cheers reactions

On every rating card (activity feed, browse, beer detail, profile):
- "🍻 Cheers" button with count
- Click to toggle (add/remove your cheers)
- Animate on cheers: brief glass-clink animation or bounce
- Show "You and 3 others cheered this" when you've cheered

### 7D: Filter/sort controls (Browse view)

Enhance existing browse view with:
- **Style filter:** dropdown (existing, keep)
- **Rating filter:** min stars slider (1–5)
- **YG filter:** min/max YG value range
- **Date range:** "This week" / "This month" / "All time" / custom
- **User filter:** dropdown to filter by specific user
- **Venue filter:** dropdown to filter by venue
- **Sort options:** Most recent, Highest rated, Highest YG, Most cheers, Alphabetical

### 7E: Delete own reviews

- Add a "🗑️ Delete" button (or icon) on rating cards where `rating.user_id === currentUser.sub`
- Confirm dialog: "Delete your rating of {beer_name}? This can't be undone."
- Call `DELETE /api/ratings/:id`
- Remove card from DOM with fade-out animation
- Show toast: "Rating deleted"

**Success criteria:**
- [ ] User profiles load with all stats and charts
- [ ] Beer detail page shows aggregate data and all ratings
- [ ] Cheers toggle works with animation
- [ ] Filter/sort controls filter the browse view correctly
- [ ] Delete own review works with confirmation and toast

---

## Workstream 8: Mobile & PWA

### 8A: Mobile responsive audit

Test all views at 360px, 390px, 414px widths. Fix:
- Rating form: stack fields vertically, full-width inputs
- Star rating: large tap targets (min 44px)
- YG slider: large thumb, full width
- Map: full screen with bottom sheet for venue details
- Exchange table: horizontal scroll or card layout on mobile
- Activity feed: compact cards
- Nav: existing mobile nav pattern (icon-only) should work, verify
- Charts: ensure responsive (Chart.js `maintainAspectRatio: false`)
- Venue detail: stack sections vertically
- Leaderboard: single column

### 8B: PWA manifest

Create `apps/beerbook/manifest.json`:
```json
{
    "name": "BeerBook — Drinks After Work",
    "short_name": "BeerBook",
    "description": "Rate beers, find deals, explore with the crew",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#1a1006",
    "theme_color": "#e6a817",
    "icons": [
        { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
        { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
    ]
}
```

- Add `<link rel="manifest" href="/manifest.json">` to `index.html`
- Add `<meta name="theme-color" content="#e6a817">`
- Add `<meta name="apple-mobile-web-app-capable" content="yes">`
- Generate icons (can use a simple canvas-drawn beer mug or 🍺 emoji rendered to PNG)
- No service worker needed in Phase 2.5

### 8C: Pull-to-refresh feel

Since this is vanilla JS (no service worker), implement a lightweight pull-to-refresh:
- On mobile, detect overscroll at top of page
- Show a refresh indicator
- Reload current view data (not full page reload)
- Use `touchstart`/`touchmove`/`touchend` events

### 8D: Skeleton loading states

For every data-dependent section, show placeholder skeletons while loading:
- Stats cards: grey shimmer rectangles matching card dimensions
- Activity feed: 3–5 placeholder card outlines
- Charts: grey rectangle with subtle animation
- Beer grid: card-shaped placeholders

CSS animation:
```css
.skeleton {
    background: linear-gradient(90deg, var(--dark-800) 25%, var(--dark-700) 50%, var(--dark-800) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: var(--radius-sm);
}
@keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}
```

### 8E: Keyboard shortcuts (desktop)

- `N` — open new rating form
- `Esc` — close modals / go back
- `/` — focus search input
- `M` — switch to map view
- `E` — switch to exchange view
- Show shortcut hints on hover (tooltip) for power users

### 8F: Toast notifications (if not already done in 3G)

Ensure toast system is in place and fires for:
- Rating saved ✅
- Rating deleted 🗑️
- Cheers given 🍻
- Price logged 💰
- Happy hour added 🕐
- Location captured 📍
- Photo uploaded 📷
- Error states (API failures)

**Success criteria:**
- [ ] All views render correctly at 360px width
- [ ] PWA manifest passes Chrome DevTools audit
- [ ] Add-to-homescreen works on iOS and Android
- [ ] Skeleton loaders appear during data fetches
- [ ] Keyboard shortcuts work on desktop
- [ ] Toast notifications fire for all key actions

---

## Workstream 9: Infinite Scroll & Performance

### 9A: Infinite scroll on feed/browse views

- Replace "show all" pattern with paginated loading
- Detect scroll position near bottom (Intersection Observer API)
- Fetch next page from API (`?offset=current+limit`)
- Append results to DOM
- Show loading spinner at bottom during fetch
- Stop when API returns fewer items than `limit` (end of data)

### 9B: Style guide tooltips

- On hover over a style name (e.g., "IPA", "Stout"), show a tooltip with:
  - Brief description of the style
  - Typical ABV range
  - Flavor characteristics
- Store style definitions in a JS object (no API call needed)
- Common styles: IPA, DIPA, NEIPA, Pale Ale, Stout, Porter, Lager, Pilsner, Wheat, Sour, Belgian, Amber, Brown Ale, Saison, Hefeweizen, Barleywine, Scotch Ale, Kölsch, Märzen, Bock

### 9C: Data caching

- Cache API responses in memory (JS Map) with TTL:
  - Stats/leaderboard: 60 seconds
  - Beer search autocomplete: 30 seconds
  - Exchange rates: 60 seconds
  - User profiles: 120 seconds
- Invalidate on mutations (new rating, new price, etc.)
- No localStorage/sessionStorage for data (session tokens only, per existing DECISIONS)

**Success criteria:**
- [ ] Infinite scroll loads additional pages on all list views
- [ ] Style tooltips appear on hover
- [ ] Repeated API calls within TTL are served from cache
- [ ] No jank or layout shift during scroll loading

---

## Constraints

- Vanilla JavaScript only — no React, no Vue, no build step, no npm in frontend
- Static files served by nginx (existing container pattern)
- All API calls go through `beerbook-api` (never expose PostgREST)
- Keep existing warm amber/mahogany pub aesthetic (see `styles.css` CSS variables)
- Keep existing auth flow (Keycloak OIDC PKCE via `supabase.js`)
- No `docker compose down -v` on prod
- Always use explicit compose file path: `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env ...`
- External CDN scripts allowed: Chart.js (existing), Leaflet.js (new), leaflet.markercluster (new), leaflet.heat (new)
- Nominatim for reverse geocoding (free, no API key, respect 1 req/sec rate limit, set User-Agent)
- Photo storage: Docker named volume, served via nginx. No external object storage in Phase 2.5.
- All schema changes are additive (no drops, no column renames, no data migrations)
- Keep demo mode working (localStorage-only fallback when not connected)

---

## Required Output

1. Plan (max 20 bullets — this is a large phase)
2. All file changes (new and modified), organized by workstream
3. Migration SQL (single file, idempotent)
4. Validation commands (VPS-side)
5. Rollback steps (exact, per workstream)
6. Updated runbooks (deploy, smoke tests)

---

## Agent Assumption Log

_Agents must log assumptions here instead of asking (per DECISIONS.md):_

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| | | | |