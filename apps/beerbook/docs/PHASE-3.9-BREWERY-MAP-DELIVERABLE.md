# Phase 3.9 — Brewery Map — Deliverable

## Plan (executed)

1. Add `GET /api/breweries/map?bounds=sw_lat,sw_lng,ne_lat,ne_lng` and `GET /api/breweries/:id` to `server.js` (no auth).
2. Add `getBreweriesMap(bounds)` and `getBrewery(id)` in `supabase.js`.
3. Add map layer toggle (My Ratings / Breweries / Both) and brewery filter chips in `index.html`; persist filter state in sessionStorage.
4. Add brewery pin layer in `map.js`: fetch by viewport bounds, Leaflet.markercluster, DivIcons per type (brewery/brewpub/bar/other) with emoji and colors; exclude closed/planning via API.
5. Pin popup and bottom sheet: brewery name, type, city/state, phone, website, beers list, "Rate a beer from here" with brewery pre-fill.
6. "Near Me" location button: geolocate, pan to user, zoom 13, blue dot; toast on error.
7. Debounced moveend (500 ms) to reload brewery pins when map moves.
8. Dark map tiles (CartoDB Dark), amber cluster styling; mobile bottom sheet for brewery detail.
9. Pre-fill brewery name on rate view when user clicks "Rate a beer from here" (sessionStorage + app.js on navigate to rate).
10. No change to existing rating pins or Best Beer Near Me / My Trail flows.

## Modified files

- `apps/beerbook-api/server.js` — brewery map and detail endpoints
- `apps/beerbook/map.js` — brewery layer, clustering, filters, layer toggle, locate, bottom sheet
- `apps/beerbook/index.html` — layer toggle, filter chips, locate button, brewery bottom sheet
- `apps/beerbook/styles.css` — map layer toggle, filter chips, brewery pins, cluster, bottom sheet
- `apps/beerbook/app.js` — pre-fill brewery name when navigating to rate from map
- `apps/beerbook/supabase.js` — getBreweriesMap, getBrewery

## Validation commands (VPS)

```bash
# From project root on VPS (/opt/daw-platform or equivalent)

# 1. API: breweries map (no bounds = first 500 with coords)
curl -s "http://localhost:3001/api/breweries/map" | head -c 500

# 2. API: breweries in bounds (US example)
curl -s "http://localhost:3001/api/breweries/map?bounds=38.8,-77.2,39.0,-76.9" | head -c 500

# 3. API: single brewery (use an id from step 1)
curl -s "http://localhost:3001/api/breweries/YOUR_BREWERY_ID" | head -c 500

# 4. Smoke: map view loads without JS errors; switch layers; tap pin; use "Near Me" and filters
```

## Rollback steps

1. **API** — Remove the Phase 3.9 block in `server.js`: delete the `// ---------- Phase 3.9: Brewery map` section (GET `/api/breweries/map` and GET `/api/breweries/:id`). Restart beerbook-api.
2. **Frontend** — Revert `map.js`, `index.html`, `styles.css`, `app.js`, `supabase.js` to pre–Phase 3.9 versions (git or backup). Redeploy static assets.
3. **No DB or schema changes** — nothing to roll back in the database.

## Assumptions

- `breweries` table exists and has columns: id, name, latitude, longitude, brewery_type, city, state or state_province, website_url, phone. API uses `state ?? state_province` in response.
- `beers.brewery_id` exists for linked beers on GET `/api/breweries/:id`.
- Leaflet and Leaflet.markercluster are loaded from CDN in index.html (already present).
- Filter chip "Bars" includes brewery_type values bar, taproom, beergarden; "Breweries" includes micro, nano, regional, large, contract, proprietor; "Brewpubs" is brewpub; all others (e.g. cidery, location) use "Other" and the single "Other" chip is not in the filter bar per prompt (only Breweries, Brewpubs, Bars), so "Other" pins are shown when any filter is active and no chip specifically hides them. Implemented: three chips (brewery, brewpub, bar); "other" category pins are shown when at least one chip is active and no chip filters them out—actually the prompt says "Toggle chips on/off to show/hide pin categories", so we have three categories in the UI and "other" is always shown (no chip for it). Done.
