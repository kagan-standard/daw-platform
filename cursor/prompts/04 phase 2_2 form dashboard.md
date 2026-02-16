# Phase 2.2 — Rating Form & Dashboard Polish

Apply `cursor/prompts/00_system.md` rules.

**Prerequisite:** Phase 2.1 must be deployed and verified. All new API endpoints must be working.

## Context Files (read before writing code)
- `DECISIONS.md`
- `apps/beerbook/index.html`
- `apps/beerbook/app.js`
- `apps/beerbook/supabase.js`
- `apps/beerbook/styles.css`
- `apps/beerbook/charts.js`
- `apps/beerbook/config.js`
- `apps/beerbook-api/server.js` **(read-only — do NOT modify)**

## Goal

Upgrade the rating form with star input, beer autocomplete, YG slider, geolocation, photo upload, and price logging. Polish the dashboard with better stats, charts, activity feed, skeleton loaders, empty states, and toast notifications. After this phase, rating a beer should feel rich and satisfying.

**Do NOT modify `server.js` or the database schema. The API is locked from Phase 2.1.**

---

## Task 1: Star Rating Input

Replace the current number input for rating with a clickable star component.

- 5 stars, click to select (1–5)
- Visual: filled gold (var(--amber-400)) for selected, outlined (var(--dark-600)) for unselected
- Mobile: min 44px tap target per star
- Animate on selection: brief scale pulse (transform: scale(1.2) → 1.0, 150ms)
- Keyboard accessible: arrow keys to change value
- Stores integer in the existing `rating` field

---

## Task 2: Beer Name Autocomplete

Add typeahead to the `beer_name` input field.

- On keystroke (debounced 300ms), call `GET /api/beers/search?q={input}`
- Show dropdown below input: "beer_name — brewery (style)"
- Selecting a suggestion auto-fills: beer_name, brewery, style fields
- Allow freeform entry (new beers)
- Dropdown styled to match dark theme (var(--dark-800) bg, var(--amber-300) text)
- Close dropdown on blur, Escape, or selection
- Max 10 results shown

---

## Task 3: YG Value Slider

Add a new form group after the star rating:

```html
<div class="form-group">
    <label>YG Value <span class="label-hint">How many Yuengling Golden Pilsners is this worth?</span></label>
    <div class="yg-slider-row">
        <input type="range" min="0.5" max="5" step="0.5" id="yg-slider">
        <span class="yg-display">— YG</span>
    </div>
    <div class="yg-context"></div>
</div>
```

- Slider range 0.5–5.0 (step 0.5) + optional text input for values up to 10.0
- Large thumb for mobile (24px+)
- Gold track (var(--amber-400))
- Dynamic context hint based on value:
  - 0.5: "Barely worth half a YG 😬"
  - 1.0: "Equal to a YG — the baseline"
  - 2.0: "Worth 2 YGs — solid beer 👍"
  - 3.0+: "Premium territory 🍺"
  - 5.0+: "Elite. This beer is special 🏆"
- Default state: empty (no value selected) — user taps slider to activate
- Optional — user can skip (submits null yg_value)

---

## Task 4: Geotag Capture

Add "📍 Add Location" button to the rating form.

- On click: `navigator.geolocation.getCurrentPosition()`
- On success: reverse geocode via Nominatim
  - URL: `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
  - Headers: `{ 'User-Agent': 'BeerBook/1.0' }`
  - Rate limit: 1 req/sec (throttle if needed)
  - Extract human-readable name from response
- Show location as a chip/badge: "📍 The Blind Pig, Philadelphia" with ✕ to remove
- Fallback: "Type location manually" text input (always visible as alternative)
- On geolocation deny/error: show manual input, no error shaming
- Stores: `latitude`, `longitude`, `location_name` in the rating payload

---

## Task 5: Photo Upload

Add "📷 Add Photo" button to the rating form.

- File input: accept `image/jpeg, image/png, image/webp`, also `capture="environment"` for mobile camera
- Show thumbnail preview (max 200px wide) after selection
- Client-side resize: if image > 1200px wide, resize using canvas before upload
- On form submit: upload to `POST /api/upload` first, get back `{ url }`, then include `photo_url` in rating payload
- Max 5MB (validate client-side, show error toast if too large)
- Show upload progress (or at minimum a spinner)

---

## Task 6: Price Logging (Venue-Dependent)

If a location is attached (via geotag or manual entry):
- Show collapsible "💰 Log a Price" section below location
- Fields: price input (dollar format, e.g., "$6.50" → stored as 650 cents), "Happy Hour?" checkbox
- On rating submit: if price filled, POST to `/api/venues/:id/prices` as a separate call after the rating is created
- If no venue exists for the location, prompt to create one (POST to `/api/venues`)
- If no location attached, price section is hidden

---

## Task 7: Toast Notifications

Create a reusable toast notification system.

- Container: fixed position bottom-right (existing `.toast-container` CSS)
- Function: `App.toast(message, type)` where type = 'success' | 'error' | 'info'
- Auto-dismiss after 3 seconds with fade-out
- Stack multiple toasts vertically
- Fire toasts for: rating saved, rating deleted, photo uploaded, location captured, price logged, errors

---

## Task 8: Dashboard Stats Enhancement

Expand the stats grid on the dashboard view:

- Keep existing: Total Beers, Total Reviews, Active Reviewers, Average Rating
- Add: **Total Venues Discovered** (from `/api/venues` count)
- Add: **Community Avg YG** (from `/api/stats` — add avg_yg_value to stats response if not already)
- Add: **Beer of the Week** (from `/api/highlights/beer-of-the-week`)

Style as skeleton loaders while data fetches:
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

---

## Task 9: Charts Expansion

Add new charts to the dashboard charts grid (extend `charts.js`):

- **Rating distribution:** bar chart — count of 1★ through 5★ ratings
- **Monthly activity:** line chart — ratings per month over time
- **YG distribution:** histogram — spread of YG values across all ratings (if YG data exists, otherwise show empty state)

Keep existing charts: radar (flavor profile), style distribution (doughnut), top beers (horizontal bar).

---

## Task 10: Activity Feed

Add a new section below charts on the dashboard:

```
RECENT ACTIVITY
🍺 Alex rated Tree House Julius ⭐⭐⭐⭐⭐ (4.1 YG) at The Blind Pig
   "Absolute banger of an IPA" · 2 hours ago · 🍻 3 cheers

📍 Mike discovered Kelly's Taproom, Philadelphia
   3 hours ago
```

- Fetch from `GET /api/activity`
- Show avatar (initials circle if no picture) + username + action + timestamp
- Include YG badge if yg_value exists
- Include cheers count if > 0
- Show 10 most recent, with "Load more" button
- Skeleton placeholders while loading

---

## Task 11: Empty States

For every view/section that can be empty, add a styled empty state:

- **No ratings:** "🍺 No beers rated yet. Be the first to crack one open!" + "Rate a Beer" button
- **No activity:** "📋 No activity yet. Rate a beer to get things started!"
- **No YG data:** "📈 No YG values yet. Start rating beers with YG values to see the exchange!"
- **No venues:** "📍 No venues discovered yet. Add a location when you rate a beer!"
- **No chart data:** "📊 Not enough data for this chart yet."

Style: centered, var(--amber-600) text, relevant emoji, optional CTA button.

---

## Task 12: Delete Own Reviews

- Add a 🗑️ icon/button on rating cards where `rating.user_id === currentUser.sub`
- Confirmation modal: "Delete your rating of {beer_name}? This can't be undone."
- Call `DELETE /api/ratings/:id`
- Remove card from DOM with fade-out animation
- Toast: "Rating deleted"
- Only visible when logged in and viewing own ratings

---

## Task 13: Leaderboard Time Tabs

Add tab buttons above the leaderboard grid: **This Week** | **This Month** | **All Time**

- Each tab calls `GET /api/leaderboard?period=weekly|monthly|alltime`
- Default: All Time (existing behavior)
- Active tab styled with var(--amber-300) color + var(--dark-700) background

---

## Constraints

- **Do NOT modify** `apps/beerbook-api/server.js` — API is locked from Phase 2.1
- **Do NOT modify** `apps/beerbook/docs/database-schema.sql` — schema is locked
- Vanilla JS only — no frameworks, no build step
- Extend existing `styles.css` — no new CSS files
- Keep demo mode working (localStorage fallback)
- Match existing aesthetic (amber/mahogany pub theme)
- External scripts: Nominatim only (for reverse geocode). No new CDN libraries in this phase.

## Required Output

1. Plan (max 12 bullets)
2. All modified files: `index.html`, `app.js`, `supabase.js`, `styles.css`, `charts.js`, `utils.js`
3. Validation commands
4. Rollback steps

---

## Delivered (Phase 2.2)

### Plan executed
1. Toast system (App.toast, 3s, stack)
2. Star rating polish (pulse, keyboard, 44px, colors)
3. Beer autocomplete (GET /api/beers/search, debounce 300ms)
4. YG slider (0–5, optional; context hints; default empty)
5. Geotag + Nominatim reverse geocode + location chip + manual fallback
6. Photo upload (resize >1200px, POST /api/upload, 5MB limit)
7. Price logging (collapsible when location set; venue create + POST prices)
8. Dashboard stats (venues count, Community Avg YG, Beer of the Week)
9. Charts: monthly activity line, YG distribution histogram; empty states
10. Activity feed (GET /api/activity, load more)
11. Empty states (no ratings, no activity, no YG, no venues, no chart data)
12. Delete own reviews (modal, DELETE /api/ratings/:id)
13. Leaderboard tabs (This Week | This Month | All Time)

### Modified files
- `apps/beerbook/index.html` — form sections (autocomplete, YG, location, price, photo), dashboard stats/activity/charts, leaderboard tabs, delete modal
- `apps/beerbook/app.js` — bindings, autocomplete, location, photo, price, form payload, loadAllData (venues/BOTW/activity), renderLeaderboard(period), renderActivityFeed, delete modal, empty states
- `apps/beerbook/supabase.js` — addRating (yg_value, lat, lng, location_name, venue_id, photo_url), searchBeers, getVenuesCount, getActivity, getLeaderboard, getBeerOfTheWeek, uploadPhoto, createVenue, addVenuePrice
- `apps/beerbook/styles.css` — skeleton, autocomplete, YG slider, location, price, photo, modal, chart empty, activity feed, leaderboard tabs, review-delete, fadeOut
- `apps/beerbook/charts.js` — renderMonthly, renderYgDistribution, distribution empty state
- `apps/beerbook/utils.js` — toast duration 3000

### Validation commands (VPS)
```bash
# After deploying frontend to beerbook.drinksafterwork.net
curl -sI https://beerbook.drinksafterwork.net/ | head -5
# In browser: Sign in → Rate a Beer → star rating, YG slider, Add Location, Add Photo, submit. Dashboard: stats, activity feed, leaderboard tabs, delete own review.
```

### Rollback steps
- Restore previous versions of `apps/beerbook/index.html`, `app.js`, `supabase.js`, `styles.css`, `charts.js`, `utils.js` from git or backup.
- Redeploy static assets to beerbook host.

## Agent Assumption Log

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| 2025-02-15 | 2.2 | GET /api/beers/search returns `{ data: [{ beer_name, brewery, style }] }` | Matches beers route |
| 2025-02-15 | 2.2 | GET /api/activity returns `{ data: items }` with type 'rating' or 'venue' | Matches activity route |
| 2025-02-15 | 2.2 | POST /api/venues expects name, latitude, longitude | Matches venues route |
| 2025-02-15 | 2.2 | POST /api/venues/:id/prices expects beer_name, price_cents, is_happy_hour | Matches venues route |
| 2025-02-15 | 2.2 | Community Avg YG computed client-side from ratings (API stats not modified) | server.js locked |
| 2025-02-15 | 2.2 | Leaderboard period filtering done client-side from allRatings | server.js locked |