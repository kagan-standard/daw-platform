# Phase 3.3 — Brewery Map

Apply `cursor/prompts/00_system.md` rules.

**Prerequisite:** Phase 3.2 complete. The `breweries` table has 13,210 entries, 7,833 with
latitude/longitude coordinates. Each brewery has a `brewery_type` field.

## Context Files (read before writing code)
- `DECISIONS.md`
- `apps/beerbook/index.html`
- `apps/beerbook/app.js`
- `apps/beerbook/map.js` (if it exists)
- `apps/beerbook/styles.css`
- `apps/beerbook-api/server.js`

## Goal

Add a brewery map that displays all breweries with coordinates as pins, with distinct
icons per brewery type. Users can tap a pin to see brewery details. The map should load
fast despite ~8K pins (use marker clustering).

---

## Task 1: Brewery API Endpoint

Add to `server.js`:

```
GET /api/breweries/map?bounds=sw_lat,sw_lng,ne_lat,ne_lng
```

- Returns breweries within the given map viewport bounds
- Fields: `id, name, latitude, longitude, brewery_type, city, state, website_url, phone`
- Limit: 500 results per request (closest to viewport center first)
- If no bounds provided, return top 500 by proximity to user or a default center
- No auth required (public data)

Also add:

```
GET /api/breweries/:id
```

- Returns full brewery detail including linked beers (if any)
- Fields: all brewery columns + `beers` array (name, style, abv from beers table)

## Task 2: Map Pin Icons

Use Leaflet DivIcon or custom SVG markers with distinct icons per brewery type category.
Use emoji or simple SVG icons — no external icon libraries needed.

**Pin categories and colors:**

| Category | brewery_type values | Icon | Color |
|----------|-------------------|------|-------|
| Brewery | micro, nano, regional, large, contract, proprietor | 🏭 (factory/brewery icon) | Amber/Gold (`var(--amber-400)` / `#F6AD55`) |
| Brewpub | brewpub | 🍽️ (dining icon) | Orange (`#ED8936`) |
| Bar/Taproom | bar, taproom, beergarden | 🍺 (beer mug icon) | Green (`#48BB78`) |
| Other | cidery, location, or unknown | 📍 (pin icon) | Gray (`#A0AEC0`) |

**Do NOT show pins for `closed` or `planning` brewery types.**

Each pin icon should be:
- A colored circle (28px diameter) with the emoji centered inside
- Slightly larger on hover (32px) with a subtle shadow
- The color serves as the circle background

## Task 3: Marker Clustering

With ~8K pins, rendering all at once will lag. Use Leaflet.markercluster:
- CDN: `https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/`
- Cluster icons should use amber theme colors to match the app
- Spiderfy on click for overlapping pins
- Load pins for the current viewport via the bounds API (Task 1)
- Reload pins on map `moveend` event (debounced 500ms)

## Task 4: Pin Popup / Detail Panel

When a user taps a pin, show a popup or bottom sheet with:

```
[Icon] Brewery Name
Type: Brewpub | City, State
📞 Phone (if available)
🌐 Visit Website → (if website_url available, opens in new tab)

Beers in catalog: (count)
- Beer Name 1 (Style, ABV%)
- Beer Name 2 (Style, ABV%)
[See all →] (if more than 3)

⭐ Rate a beer from here →  (links to rate view with brewery pre-filled)
```

If no beers are linked: "No beers cataloged yet — rate one to be the first!"

On mobile, use a bottom sheet instead of a popup (more thumb-friendly).

## Task 5: Map Filters

Add a simple filter bar above the map:

```html
<div class="map-filters">
  <button class="filter-chip active" data-type="brewery">🏭 Breweries</button>
  <button class="filter-chip active" data-type="brewpub">🍽️ Brewpubs</button>
  <button class="filter-chip active" data-type="bar">🍺 Bars</button>
</div>
```

- Toggle chips on/off to show/hide pin categories
- Active state: filled background with category color
- Inactive: outlined, dimmed
- Persist filter state in sessionStorage

## Task 6: "Near Me" Button

Add a location button on the map:

```html
<button class="map-locate-btn" title="Find breweries near me">📍</button>
```

- On click: `navigator.geolocation.getCurrentPosition()`
- Pan map to user's location, zoom to level 13
- Show a blue dot for user's position
- On error/deny: toast "Enable location to find nearby breweries"

## Task 7: Integration with Existing Map

The app already has a Beer Map view (`view-map` in index.html, `map.js`). 
The brewery pins should be **added to the existing map**, not a separate view.

- Existing map shows user rating pins (where people rated beers)
- Add brewery pins as a separate layer that can be toggled
- Add a layer toggle: "My Ratings" vs "Breweries" (or show both)
- Brewery pins should be visually distinct from rating pins

---

## Constraints

- Leaflet.js and leaflet.markercluster are already available (added in Phase 2.3) — 
  check if CDN links are in index.html, add if missing
- Vanilla JS only
- Match existing dark theme (dark map tiles, amber accents)
- Mobile-first: bottom sheet > popup, large tap targets
- Do NOT break existing map functionality (user rating pins)
- Pins for `closed` and `planning` breweries should NOT be shown

## Required Output

1. Plan (max 10 bullets)
2. Modified files: `server.js`, `map.js`, `index.html`, `styles.css`, `app.js`
3. Validation commands
4. Rollback steps
