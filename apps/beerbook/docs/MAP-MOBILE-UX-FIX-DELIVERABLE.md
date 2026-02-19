# Fix: Map Mobile UX — Layer Toggle + Layout — Deliverable

## Plan (executed)

1. **Bug 1 — Layer toggle on mobile:** In `map.js` bind layer button clicks with `e.preventDefault()` and `e.stopPropagation()` so no parent handler (e.g. body delegation) intercepts or resets state; added `-webkit-tap-highlight-color: transparent` on `.map-layer-btn` and `.filter-chip` to avoid misleading tap flash.
2. **Default layer:** Set default `currentLayer` to `'breweries'` in `map.js` and made "Breweries" the active layer button in `index.html`; filter chips stay visible by default.
3. **Viewport pinch:** Updated the single viewport meta in `index.html` to `maximum-scale=1.0, user-scalable=no` so the page does not zoom; Leaflet still handles map pinch.
4. **Layout (HTML):** Map view got class `view-map`; header title wrapped in `.view-map-title` for mobile hide; locate button moved into `.map-wrapper` and labeled "📍 Near Me"; style filter and "Best Beer Near Me" left in DOM but hidden via CSS.
5. **Layout (CSS):** Hid `#btn-near-me` and `#map-filter-style` with `display: none` and TODO comments; `.map-wrapper` added with relative positioning; locate button styled as `.map-locate-float` (bottom-left on map, 44px min tap target, semi-transparent dark); map view uses flex so map fills remaining space.
6. **Mobile (< 768px):** Hide `.view-map-title`; compact tagline; `.view-map` height `calc(100vh - 52px - 82px)` and `padding-bottom: 0`; map container flexes and has no margin/gap to bottom; `.map-controls` hidden on mobile; no gap between map and bottom nav.
7. **Desktop:** Title kept; same default layer and hidden Best Beer Near Me / style filter; locate button floated on map bottom-left; no extra space below map.
8. **No regressions:** Pins, popups, clusters, and existing map behavior unchanged; vanilla JS and existing dark theme preserved.

## Modified files

- **apps/beerbook/index.html** — Viewport meta; map view structure (view-map, view-header classes, default Breweries active, map-wrapper, locate button moved and labeled).
- **apps/beerbook/map.js** — Default `currentLayer: 'breweries'`; layer button handler with `preventDefault` and `stopPropagation`.
- **apps/beerbook/styles.css** — Hide Best Beer Near Me and style filter (with TODOs); view-map flex layout; map-wrapper and beer-map-container flex/height; map-locate-float positioning and styles; mobile overrides (title hide, tagline, view height, map fill, no gap, map-controls hide); tap-highlight transparent on layer and filter buttons; `.view-map.active` display flex.

## Validation steps

1. **Viewport:** Resize to 375px; confirm page zoom is disabled (pinch doesn’t zoom the app); pinch on the map still zooms the map.
2. **Layer toggle:** At 375px, tap "Breweries" and "Both"; layer should switch and stay (no revert to "My Ratings"); tap "My Ratings" and confirm rating pins show.
3. **Layout mobile:** Map view shows tagline only (no "Beer Map" title), layer row, filter chips, then map filling to bottom nav with no brown gap; "📍 Near Me" floats bottom-left on the map with 44px min tap target.
4. **Layout desktop:** "Beer Map" title visible; default layer Breweries; "Best Beer Near Me" and style dropdown not visible; "📍 Near Me" on map bottom-left; no empty bar below map.
5. **Map behavior:** Brewery pins load by default; pan/zoom still loads breweries; popups and bottom sheet unchanged.

## Rollback steps

1. **index.html:** Revert viewport to `content="width=device-width, initial-scale=1.0"`; restore map view HTML to previous structure (title, no view-map/view-map-title classes, locate in map-controls as icon-only, "My Ratings" default active).
2. **map.js:** Set `currentLayer: 'ratings'`; remove `e.preventDefault()` and `e.stopPropagation()` from the layer button listener.
3. **styles.css:** Remove `#btn-near-me` and `#map-filter-style` hiding; remove view-map, map-wrapper, map-locate-float, and mobile map layout rules; remove tap-highlight and `.view-map.active`; restore original `.beer-map-container` and `.map-controls` rules as needed.
4. No changes to app.js or backend.
