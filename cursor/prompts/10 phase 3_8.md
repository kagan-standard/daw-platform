# Phase 3.2 — Wire Beer Catalog to UI

Apply `cursor/prompts/00_system.md` rules.

**Prerequisite:** Phase 3.1 complete. The `beers`, `breweries`, and `beer_styles` tables
are populated (90K beers, 4.4K breweries, 105 styles). The `search_beer_catalog()`
PostgreSQL function exists and works. Database is in the `supabase-db` container,
`postgres` database.

## Context Files (read before writing code)
- `DECISIONS.md`
- `apps/beerbook/index.html`
- `apps/beerbook/app.js`
- `apps/beerbook/supabase.js`
- `apps/beerbook/styles.css`
- `apps/beerbook-api/server.js`
- `apps/beerbook/docs/migration-3.1.sql` (for schema reference)

## Goal

Replace the current beer autocomplete (which searches existing ratings) with a search
against the 90K beer catalog. When a user selects a catalog beer, auto-fill all known
fields and link the rating to the catalog via `ratings.beer_id`. Maintain the ability
to rate beers NOT in the catalog (free-text fallback).

---

## Task 1: New API Endpoint — Catalog Search

Add to `server.js`:

```
GET /api/catalog/search?q=<query>&limit=<n>
```

- Calls the existing `search_beer_catalog(query)` PostgreSQL function via RPC
- PostgREST RPC call: `POST /rest/v1/rpc/search_beer_catalog` with body `{ "query": "<q>" }`
- Returns: `{ data: [{ id, name, brewery_name, style, abv, description, review_overall, review_count }] }`
- Default limit: 10
- Minimum query length: 2 characters (return empty array if shorter)
- Auth: not required (catalog is public/global data)

## Task 2: Update Autocomplete to Use Catalog

In `app.js`, find the existing beer autocomplete logic (currently calls
`GET /api/beers/search?q=`).

Replace with:

- Call `GET /api/catalog/search?q=${input}` (debounce 300ms, min 2 chars)
- Dropdown items show: **beer name** — brewery (style) [ABV%]
  - Example: `Pliny the Elder — Russian River (Imperial IPA) 8.0%`
  - If brewery_name is null, omit it
  - If style is null, omit it
  - If abv is null, omit the ABV
- On selection:
  - Auto-fill `beer-name` input with the beer name
  - Auto-fill `beer-brewery` input with brewery_name (if available)
  - Auto-fill `beer-style` select/input with style (if available)
  - Store the selected `beer_id` (catalog ID) in a hidden field or JS variable
- If the user types a name and does NOT select from dropdown, that's fine —
  `beer_id` stays null, it's a free-text rating (existing behavior)

## Task 3: Pass beer_id in Rating Submission

In `supabase.js` (or wherever `addRating` / the POST /api/ratings call is):

- Add `beer_id` to the rating payload (nullable)
- If user selected a catalog beer, include the ID
- If free-text entry, send `beer_id: null`

In `server.js` POST /api/ratings handler:

- Add `beer_id: b.beer_id ?? null` to the record object
- No extra validation needed (the FK is nullable)

## Task 4: "Not in the catalog?" Hint

Below the autocomplete dropdown, if the user has typed 3+ characters and no results
match, show a subtle hint:

```html
<div class="autocomplete-hint">
  Don't see your beer? Just type the name — you can rate anything!
</div>
```

Style: `color: var(--amber-600); font-size: 0.8rem; padding: 4px 8px;`

This reassures users that free-text is fine and the catalog isn't a gate.

## Task 5: Show Catalog Info on Beer Detail (Enhancement)

If a rating has a `beer_id` linked, and the catalog beer has `description`,
`review_overall`, or `abv` data — show a small info card on the beer detail view:

```html
<div class="catalog-info">
  <span class="catalog-badge">📖 From BeerBook Catalog</span>
  <p class="catalog-desc">{description}</p>
  <div class="catalog-stats">
    <span>ABV: {abv}%</span>
    <span>Community: {review_overall}/5</span>
    <span>Style: {style}</span>
  </div>
</div>
```

Only show fields that have data. If no catalog link, don't show this section.

---

## Constraints

- Keep existing free-text rating flow working (beer_id is optional)
- Do NOT break existing ratings (they have beer_id = null, that's fine)
- The `search_beer_catalog()` function already handles fuzzy matching via pg_trgm
- Vanilla JS only
- Match existing dark theme aesthetic
- Mobile-friendly (autocomplete dropdown must work on touch)

## Required Output

1. Plan (max 10 bullets)
2. Modified files: `server.js`, `app.js`, `supabase.js`, `index.html`, `styles.css`
3. Validation commands
4. Rollback steps
