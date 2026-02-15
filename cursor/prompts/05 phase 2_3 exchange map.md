# Phase 2.3 — YG Exchange & Beer Map

Apply `cursor/prompts/00_system.md` rules.

**Prerequisite:** Phase 2.2 must be deployed and verified. Rating form with YG slider, geotag, and photo must be working. Dashboard polish complete.

## Context Files (read before writing code)
- `DECISIONS.md`
- `apps/beerbook/index.html` (current state after Phase 2.2)
- `apps/beerbook/app.js` (current state)
- `apps/beerbook/supabase.js` (current state)
- `apps/beerbook/styles.css` (current state)
- `apps/beerbook-api/server.js` **(read-only — do NOT modify)**

## Goal

Build two major new views: the YG Exchange trading floor and the Beer Map with venue detail pages. After this phase, users can view exchange rates, calculate cross-rates, explore a map of where the crew has been drinking, see venue details with prices and happy hours, and find the best beer deal near them.

**Do NOT modify `server.js` or the database schema. The API is locked from Phase 2.1.**

---

## Task 1: Add Leaflet.js to index.html

Add CDN script and CSS tags to `index.html` `<head>`:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
```

Also add new script tags before `</body>`:
```html
<script src="exchange.js"></script>
<script src="map.js"></script>
<script src="venues.js"></script>
```

---

## Task 2: Navigation Updates

Add two new nav buttons to the topbar nav:

- "📈 Exchange" → activates exchange view
- "🗺️ Map" → activates map view

Update `App.navigate()` to handle new view IDs: `view-exchange`, `view-map`.

---

## Task 3: YG Exchange View (`exchange.js`)

Create `apps/beerbook/exchange.js` — new file.

### 3A: Exchange Rate Table

The main display. Styled like a stock ticker.

```
THE YG EXCHANGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Beer                     │ YG Rate │ ⭐  │ Trend │ # Rated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tree House Julius        │ 4.1 YG  │ 4.8 │ ↑     │ 12
Guinness Draught         │ 2.4 YG  │ 4.2 │ ↓     │ 23
Yuengling Golden Pilsner │ 1.0 YG  │ 🔒  │ 🔒    │ —
Bud Light                │ 0.3 YG  │ 2.1 │ ↓     │ 5
```

- Fetch from `GET /api/exchange`
- Sortable columns (click header to sort)
- Yuengling Golden Pilsner always shows 1.0 YG, 🔒 for trend (it's the baseline)
- Trend: compare current rate to 30+ days ago (API provides this or compute client-side from data)
  - If insufficient historical data, show "—"
- Color: green for ↑, red for ↓, grey for —
- Skeleton loaders while fetching

### 3B: Cross-Rate Calculator

Interactive widget below the table:

- Two dropdowns: Beer A and Beer B (populated from exchange data)
- Display: "1 {Beer A} = {cross_rate} {Beer B}"
- Cross-rate = yg_rate_A / yg_rate_B
- Update live when either dropdown changes
- Show both directions: "1 Tree House = 1.71 Guinness" and "1 Guinness = 0.58 Tree House"

### 3C: YG Parity Index

Summary card showing average YG-per-dollar by beer style:

```
Best value per YG dollar:
🥇 Lager: 0.62 YG/$  │  🥈 Wheat: 0.48 YG/$  │  🥉 IPA: 0.41 YG/$
```

- Calculate from exchange data + price data (if price data exists)
- If no price data yet, show: "Add beer prices to unlock the YG Parity Index!"

### 3D: Empty State

If no YG data exists at all:
- "📈 The Exchange is quiet. Rate some beers with YG values to see the market come alive!"
- Quick explanation: "YG = Yuengling Golden Pilsner. It's the baseline. Rate how many YGs each beer is worth."

---

## Task 4: Map View (`map.js`)

Create `apps/beerbook/map.js` — new file.

### 4A: Map Container

Add to `index.html`:
```html
<main id="view-map" class="view">
    <div class="view-header">
        <h2>🗺️ Beer Map</h2>
        <p class="view-desc">Where the crew has been drinking</p>
    </div>
    <div class="map-controls">
        <button class="btn btn-primary" id="btn-near-me">🍺 Best Beer Near Me</button>
        <select id="map-filter-style" class="filter-select">
            <option value="">All Styles</option>
        </select>
    </div>
    <div id="beer-map" style="height: 500px; border-radius: var(--radius-md);"></div>
    <div id="map-sidebar" class="map-sidebar"></div>
</main>
```

### 4B: Map Initialization

- Initialize Leaflet map centered on average of all venue coordinates (or user location if available)
- Tile layer: OpenStreetMap default `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Attribution required: `'&copy; OpenStreetMap contributors'`
- Fetch venue data from `GET /api/map`

### 4C: Venue Pins

- One pin per venue (not per rating — cluster ratings by venue)
- Pin color based on avg rating at venue: gold (4+), amber (3-4), grey (<3)
- Marker clustering via leaflet.markercluster at low zoom
- Pin popup on click:
  ```
  Kelly's Taproom
  ⭐ 4.2 avg · 8 beers rated
  🟢 Happy Hour NOW (ends 6pm)
  Top beer: Sierra Nevada (2.1 YG)
  [View Venue Detail]
  ```

### 4D: User Location

- If geolocation granted: show blue pulsing dot for user position
- "🍺 Best Beer Near Me" button:
  1. Request geolocation
  2. Call `GET /api/deals?lat=X&lng=Y`
  3. Show results in sidebar as cards sorted by YG-per-dollar
  4. Also pin results on map with numbered markers

### 4E: Beer Trail

- URL parameter or toggle: `?user=:id` or a "My Trail" button
- Fetch from `GET /api/map/user/:id`
- Show connected path (polyline) between geotagged ratings in chronological order
- Numbered markers at each stop
- Popup: beer name, rating, YG value, date

### 4F: Deals Results (sidebar)

When "Best Beer Near Me" is triggered, show results in `#map-sidebar`:

```
🥇 Sierra Nevada Pale Ale — Kelly's Taproom (0.4 mi)
   $4.00 (🟢 Happy Hour! Ends in 47min) · 2.1 YG · 4.2⭐ · 0.53 YG/$

🥈 Guinness Draught — The Blind Pig (0.8 mi)
   $6.50 · 2.4 YG · 4.0⭐ · 0.37 YG/$
```

- Cards with click-to-zoom on map
- If no deals found: "No beer deals found nearby. Try expanding your radius or logging some prices!"

### 4G: Mobile Map Behavior

- Map takes full width on mobile
- Sidebar becomes a bottom sheet (drawer) that slides up
- Pin popups remain usable with touch

---

## Task 5: Venue Detail (`venues.js`)

Create `apps/beerbook/venues.js` — new file.

Venue detail is rendered as a modal overlay or a slide-in panel (not a separate page/view — it overlays the map or can be linked from activity feed).

### 5A: Venue Detail Layout

```
┌────────────────────────────────────┐
│ Kelly's Taproom                    │
│ 📍 123 Main St, Philadelphia, PA  │
│ 🟢 Happy Hour NOW (ends 6:00pm)   │
├────────────────────────────────────┤
│ 🍺 Beer Menu                      │
│ ┌────────────────────────────────┐ │
│ │ Sierra Nevada PA    $4.00  🟢 │ │
│ │ Guinness Draught    $6.50     │ │
│ │ Bud Light           $3.00  🟢 │ │
│ │ + Log a Price                 │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ 🕐 Happy Hours                    │
│ Mon–Fri: 4:00–6:00pm              │
│   "$2 off all drafts"             │
│ Sat: 12:00–3:00pm                 │
│   "Half price pints"              │
│ ⚠️ Last confirmed 4 months ago    │
│ [✓ Confirm] [+ Add Happy Hour]    │
├────────────────────────────────────┤
│ ⭐ Ratings Here (8 total)          │
│ [rating cards for this venue]     │
└────────────────────────────────────┘
```

### 5B: Data Fetching

- Fetch from `GET /api/venues/:id` — returns all venue data in one call
- Beer menu from venue's price logs
- Happy hours from venue's happy hour records
- Ratings filtered by `venue_id`

### 5C: Stale Data Warning

- Price logs not confirmed within 90 days: show "⚠️ Last confirmed {X} ago"
- Happy hours not confirmed within 90 days: same warning
- Style: var(--warning) color, small font

### 5D: Confirm Buttons

- "✓ Confirm" on prices and happy hours
- Auth required — show login prompt if not signed in
- Call `POST /api/venues/:id/prices/:id/confirm` or `POST /api/venues/:id/happy-hours/:id/confirm`
- Increment count in UI without full refresh
- Toast: "Confirmed! Thanks for keeping the data fresh."

### 5E: Log a Price (Quick Form)

- Inline form at bottom of beer menu
- Fields: beer name (autocomplete), price, happy hour checkbox
- Auth required
- Submit to `POST /api/venues/:id/prices`
- Append to beer menu list on success

### 5F: Add Happy Hour

- Expandable form below happy hours section
- Fields: day of week (dropdown), start time, end time, description
- Auth required
- Submit to `POST /api/venues/:id/happy-hours`
- Append to happy hours list on success

---

## Task 6: YG Badges Everywhere

On every rating card across the app (activity feed, browse, beer detail, leaderboard):

- Show YG badge next to star rating: small gold pill "2.4 YG"
- Only visible when `yg_value` is not null
- Style: `background: var(--amber-400); color: var(--dark-900); font-size: 0.75rem; padding: 2px 8px; border-radius: 10px;`

---

## Task 7: Styles for New Views

Add to `styles.css`:

- Exchange table styling (stock ticker aesthetic, monospace numbers)
- Cross-rate calculator card
- Map container, sidebar, bottom sheet (mobile)
- Venue detail modal/panel
- Beer menu table
- Happy hour cards
- Deal result cards
- YG badge pill
- Pin popup styling (override Leaflet defaults to match theme)
- Map filter controls

Keep consistent with existing theme: dark backgrounds, amber accents, rounded corners.

---

## Constraints

- **Do NOT modify** `apps/beerbook-api/server.js` — API locked from Phase 2.1
- **Do NOT modify** database schema
- Vanilla JS only — no frameworks, no build step
- New CDN dependencies: Leaflet.js, leaflet.markercluster (added in Task 1)
- Three new JS files: `exchange.js`, `map.js`, `venues.js`
- Extend `styles.css` — no separate CSS files
- Nominatim tile attribution required on map
- Demo mode: exchange and map can show empty states in demo mode (no mock geo data needed)

## Required Output

1. Plan (max 12 bullets)
2. New files: `exchange.js`, `map.js`, `venues.js`
3. Modified files: `index.html`, `app.js`, `styles.css`
4. Validation commands
5. Rollback steps

## Agent Assumption Log

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| | | | |