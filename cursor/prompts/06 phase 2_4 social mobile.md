# Phase 2.4 — Social, Profiles & Mobile Polish

Apply `cursor/prompts/00_system.md` rules.

**Prerequisite:** Phase 2.3 must be deployed and verified. YG Exchange and Beer Map must be working.

## Context Files (read before writing code)
- `DECISIONS.md`
- `apps/beerbook/index.html` (current state after Phase 2.3)
- `apps/beerbook/app.js` (current state)
- `apps/beerbook/supabase.js` (current state)
- `apps/beerbook/styles.css` (current state)
- `apps/beerbook/charts.js` (current state)
- `apps/beerbook/exchange.js` (current state — read-only unless bug fix needed)
- `apps/beerbook/map.js` (current state — read-only unless bug fix needed)
- `apps/beerbook/venues.js` (current state — read-only unless bug fix needed)
- `apps/beerbook-api/server.js` **(read-only — do NOT modify)**

## Goal

Add user profiles, beer detail pages, cheers reactions, advanced filtering, and then finish with a complete mobile responsive audit, PWA manifest, keyboard shortcuts, infinite scroll, and performance polish. After this phase, BeerBook is feature-complete for Phase 2.

**Do NOT modify `server.js` or the database schema. The API is locked from Phase 2.1.**

---

## Task 1: User Profiles (`profiles.js`)

Create `apps/beerbook/profiles.js` — new file.

Add `<script src="profiles.js"></script>` to index.html.

### 1A: Profile Trigger

Clicking a username anywhere in the app (activity feed, rating cards, leaderboard, browse) opens that user's profile. Implement as either:
- A new view `view-profile` with `App.navigate('profile', { userId })`, or
- A modal overlay

Whichever is chosen, it must have a back button / close to return to previous view.

### 1B: Profile Layout

```
┌────────────────────────────────────────┐
│  [Avatar]  Alex                        │
│  Member since June 2024                │
│  47 ratings · 12 styles · 8 venues     │
├────────────────────────────────────────┤
│  📊 Stats                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │ 3.8  │ │ 2.1  │ │ 47.3 │ │ IPA  │  │
│  │ Avg★ │ │AvgYG │ │YG Tot│ │ Fav  │  │
│  └──────┘ └──────┘ └──────┘ └──────┘  │
├────────────────────────────────────────┤
│  📈 YG Portfolio                       │
│  Tree House Julius    ★★★★★  4.1 YG   │
│  Guinness Draught     ★★★★   2.4 YG   │
│  ...                                   │
│  Total: 47.3 YGs                       │
├────────────────────────────────────────┤
│  [Flavor Radar Chart] [Style Doughnut] │
│  [Rating Distribution] [Monthly Chart] │
├────────────────────────────────────────┤
│  🗺️ Beer Trail (mini map)              │
│  [small Leaflet map of their ratings]  │
├────────────────────────────────────────┤
│  Recent Ratings                        │
│  [last 10 rating cards]               │
└────────────────────────────────────────┘
```

### 1C: Data Fetching

- `GET /api/users/:id` — profile header (name, avatar, join date)
- `GET /api/users/:id/stats` — all stats
- `GET /api/ratings/user/:id?limit=10` — recent ratings
- `GET /api/map/user/:id` — beer trail data (for mini map)
- `GET /api/exchange/portfolio/:id` — YG portfolio

### 1D: Charts on Profile

Reuse chart rendering functions from `charts.js` but scoped to user data:
- Personal flavor radar chart (from their ratings' flavor averages)
- Personal style distribution doughnut
- Personal rating distribution bar chart (1★–5★)
- Monthly activity line chart

If user has < 3 ratings, show simplified stats without charts.

---

## Task 2: Beer Detail Page

Clicking a beer name anywhere in the app opens a beer detail view/modal.

### 2A: Layout

```
┌────────────────────────────────────────┐
│  Tree House Julius                     │
│  Tree House Brewing · NEIPA · 6.8% ABV│
├────────────────────────────────────────┤
│  ⭐ 4.8 avg  │  4.1 YG  │  12 ratings │
├────────────────────────────────────────┤
│  [Flavor Radar Chart for this beer]    │
├────────────────────────────────────────┤
│  💰 Price Info                         │
│  Cheapest: $5.00 at Kelly's Taproom    │
│  [Price history sparkline if data]     │
├────────────────────────────────────────┤
│  📈 YG Context                         │
│  "Worth 4.1 YGs. That's equivalent to │
│   1.7 Guinness or 13.7 Bud Lights."   │
├────────────────────────────────────────┤
│  All Ratings                           │
│  [individual rating cards with user,   │
│   date, notes, photo, venue, YG]       │
├────────────────────────────────────────┤
│  [🍺 Rate This Beer] button            │
└────────────────────────────────────────┘
```

### 2B: Data Fetching

- `GET /api/beers/:name` — aggregated stats + all ratings + price history

### 2C: "Rate This Beer" Button

- Pre-fills the rating form with beer_name, brewery, style
- Navigates to the rate view with fields populated

### 2D: YG Context

Generate a human-readable comparison using cross-rates:
- Pick 2–3 well-known beers from the exchange data
- "Worth {X} YGs. That's {cross_rate_1} {beer_1} or {cross_rate_2} {beer_2}."
- If beer IS Yuengling Golden Pilsner: "This IS the baseline. 1.0 YG. The standard."

---

## Task 3: Cheers Reactions

### 3A: Cheers Button on Rating Cards

On every rating card (activity feed, browse, beer detail, profile):

```html
<button class="cheers-btn" data-rating-id="...">
    🍻 <span class="cheers-count">3</span>
</button>
```

- Click toggles cheers: `POST /api/ratings/:id/cheers`
- If user already cheered: remove cheers (un-cheers), decrement count
- If user hasn't cheered: add cheers, increment count
- Animate on cheers: brief bounce + emoji grows
- Show "You and 3 others" when you've cheered
- Requires auth — show subtle "Sign in to cheers" if not logged in
- Fetch initial cheers data when rendering cards: `GET /api/ratings/:id/cheers`
  - **Optimization:** batch cheers counts — the activity/browse API responses could include `cheers_count` per rating to avoid N+1 fetches. If the API already includes this, use it. If not, fetch in bulk or accept the latency for now.

### 3B: Cheers in Leaderboard

Add "🍻 Most Cheered" category to leaderboard (from `/api/leaderboard`).

---

## Task 4: Advanced Filter/Sort Controls

Enhance the Browse view (`view-browse`) filters:

- **Style filter:** dropdown (existing — keep)
- **Min rating:** slider or dropdown (1–5 stars)
- **YG range:** min/max inputs (only show if YG data exists)
- **User filter:** dropdown populated from known users
- **Sort options:** Most Recent, Highest Rated, Highest YG, Most Cheers, Alphabetical
- **Clear all filters** button

Apply filters client-side if all data is loaded, or via API query params if paginated.

---

## Task 5: Infinite Scroll

Replace "show all" pattern on list views (browse, activity feed) with paginated infinite scroll:

- Use Intersection Observer API on a sentinel element at the bottom
- When sentinel enters viewport, fetch next page: `?offset=current+limit`
- Append results to DOM
- Show small loading spinner at bottom during fetch
- Stop when API returns fewer items than `limit`
- Works on: browse beer grid, activity feed, profile's recent ratings

---

## Task 6: Style Guide Tooltips

On hover over a style name (anywhere: rating cards, browse, beer detail):

- Show tooltip with brief style description + typical ABV range
- Store definitions in a JS object (no API call):
  ```javascript
  const STYLE_GUIDE = {
      'IPA': { desc: 'India Pale Ale — hoppy, bitter, aromatic', abv: '5.5–7.5%' },
      'DIPA': { desc: 'Double IPA — stronger, hoppier IPA', abv: '7.5–10%' },
      'NEIPA': { desc: 'New England IPA — hazy, juicy, less bitter', abv: '6–8%' },
      'Stout': { desc: 'Dark, roasted, often creamy', abv: '4–8%' },
      'Porter': { desc: 'Dark malt, chocolate/coffee notes', abv: '4–6.5%' },
      // ... 15+ common styles
  };
  ```
- Styled tooltip: var(--dark-700) bg, small font, 200ms delay before show
- Dismiss on mouse leave or tap elsewhere (mobile)

---

## Task 7: Mobile Responsive Audit

Test ALL views at 360px, 390px, and 414px widths. Fix any issues:

- **Rating form:** fields stack vertically, full-width inputs, star rating large targets
- **YG slider:** full width, large thumb
- **Dashboard stats:** 2-column at tablet, 1-column at phone
- **Charts:** responsive (maintainAspectRatio: false), stack vertically
- **Activity feed:** compact cards, truncate long notes
- **Exchange table:** horizontal scroll wrapper OR card layout (table doesn't fit on phone)
- **Map:** full width, sidebar becomes bottom drawer
- **Venue detail:** full-screen modal on mobile
- **Beer detail:** full-screen modal on mobile
- **Profile:** stack all sections vertically
- **Leaderboard:** single column
- **Browse:** single column grid, filters collapsible
- **Nav:** existing icon-only pattern should work — verify
- **Modals/overlays:** max-width 100vw, no horizontal overflow

Fix any issues found. Verify with actual responsive testing (Chrome DevTools device mode).

---

## Task 8: PWA Manifest

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

- Add `<link rel="manifest" href="/manifest.json">` to `index.html` head
- Add `<meta name="theme-color" content="#e6a817">`
- Add `<meta name="apple-mobile-web-app-capable" content="yes">`
- Generate icons: render a simple beer-themed icon to PNG (canvas-based or use a 🍺 emoji rendered at 192px and 512px)
- Create `apps/beerbook/icons/` directory

No service worker needed — just the manifest for add-to-homescreen.

---

## Task 9: Keyboard Shortcuts (Desktop)

Add keyboard shortcut handler (only active when no input/textarea is focused):

- `N` — navigate to rate view (new rating)
- `Esc` — close any open modal/overlay, or go back to previous view
- `/` — focus the search input on browse view
- `M` — navigate to map view
- `E` — navigate to exchange view
- `B` — navigate to browse view
- `D` — navigate to dashboard
- `L` — navigate to leaderboard

Show keyboard shortcut hints as tooltips on nav buttons (title attribute or custom tooltip).

Optional: `?` key opens a shortcuts cheat sheet modal.

---

## Task 10: Client-Side Data Caching

Add a simple in-memory cache to `supabase.js` API methods:

```javascript
const _cache = new Map();
function cachedFetch(key, ttlMs, fetchFn) {
    const cached = _cache.get(key);
    if (cached && Date.now() - cached.time < ttlMs) return cached.data;
    return fetchFn().then(data => {
        _cache.set(key, { data, time: Date.now() });
        return data;
    });
}
```

TTLs:
- Stats / leaderboard: 60 seconds
- Exchange rates: 60 seconds
- Beer search autocomplete: 30 seconds
- User profiles: 120 seconds
- Map data: 120 seconds

Invalidate relevant cache keys on mutations (new rating, new price, cheers toggle, etc.).

---

## Task 11: Final Smoke Test

After all tasks, verify the complete feature set:

1. [ ] Rate a beer with: stars, YG value, geotag, photo, price — all submitted correctly
2. [ ] View dashboard: stats load, charts render, activity feed populates
3. [ ] Browse: filter by style, sort by rating, infinite scroll loads more
4. [ ] Leaderboard: weekly/monthly/alltime tabs switch
5. [ ] Exchange: rate table loads, cross-rate calculator works
6. [ ] Map: pins appear, "Best Beer Near Me" returns results, venue detail opens
7. [ ] Venue detail: prices shown, happy hours shown, confirm buttons work
8. [ ] User profile: click username, stats load, charts render, beer trail map shows
9. [ ] Beer detail: click beer name, aggregate stats shown, all ratings listed
10. [ ] Cheers: toggle works, count updates, animation plays
11. [ ] Delete own review: confirmation modal, deletion works, toast shown
12. [ ] Mobile: all views work at 360px width
13. [ ] PWA: manifest detected, add-to-homescreen prompt available
14. [ ] Keyboard shortcuts: N, Esc, /, M, E, B, D, L all work
15. [ ] Demo mode: app loads and shows empty states without API connection

---

## Constraints

- **Do NOT modify** `apps/beerbook-api/server.js` — API locked from Phase 2.1
- **Do NOT modify** database schema
- Vanilla JS only
- One new JS file: `profiles.js`
- Extend `styles.css` — no separate CSS files
- No new CDN libraries beyond what Phase 2.3 added
- Demo mode must keep working

## Required Output

1. Plan (max 15 bullets)
2. New files: `profiles.js`, `manifest.json`, `icons/icon-192.png`, `icons/icon-512.png`
3. Modified files: `index.html`, `app.js`, `supabase.js`, `styles.css`, `charts.js`
4. Full smoke test results
5. Validation commands
6. Rollback steps
7. Updated runbooks (deploy, smoke tests)

## Agent Assumption Log

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| | | | |