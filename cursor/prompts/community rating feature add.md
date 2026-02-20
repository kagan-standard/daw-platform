# Add Community Average Rating to BeerBook UI

Apply `cursor/prompts/00_system.md` rules.

## Context Files (read before writing code)
- `apps/beerbook-api/routes/beers.js` (current beer search endpoint)
- `apps/beerbook/app.js` (autocomplete binding + beer detail rendering)
- `apps/beerbook/supabase.js` (DB.searchBeers function)
- `apps/beerbook/index.html` (autocomplete dropdown markup + beer detail section)
- `apps/beerbook/styles.css` (autocomplete styling)

## Current State
- The `beers` table has **90,010 beers**; **44,403** have `review_overall` (1–5 scale) and `review_count` populated (source: `full_reviews`).
- A Postgres function `search_beer_catalog(search_term, max_results)` already exists and returns: `id, name, brewery_name, style, abv, review_overall, review_count, source, similarity_score`.
- The current `/api/beers/search?q=X` endpoint queries the `ratings` table (user reviews only), NOT the `beers` catalog. It returns `{ data: [{ beer_name, brewery, style }] }`.
- The autocomplete dropdown currently shows: `"Beer Name — Brewery (Style)"` with no rating info.

## Goal
Show a **community average rating** as a numeric score (e.g. "3.85 / 5") in two places:
1. **Beer search autocomplete dropdown** — each suggestion shows the community rating + review count when available
2. **Beer detail/profile view** — when viewing a beer's details, show the community average prominently

---

## Task 1: Update `/api/beers/search` to use the beer catalog

In `apps/beerbook-api/routes/beers.js`, update the `GET /search` handler:

### Option A (preferred): Use the existing `search_beer_catalog` RPC function
```javascript
// Call the Postgres function via PostgREST RPC
rest('POST', '/rpc/search_beer_catalog', {
  body: JSON.stringify({ search_term: q, max_results: 10 }),
  headers: { 'Content-Type': 'application/json' }
})
```

This returns: `id, name, brewery_name, style, abv, review_overall, review_count, source, similarity_score`

### Option B (fallback): If RPC doesn't work through your PostgREST proxy, query the beers table directly
```javascript
rest('GET', `/beers?or=(name.ilike.${encoded}*,brewery_name.ilike.${encoded}*)&select=id,name,brewery_name,style,abv,review_overall,review_count&order=review_count.desc.nullslast&limit=10`)
```

### Merge with user ratings
After getting catalog results, also check the `ratings` table for any user-submitted beers not in the catalog. Deduplicate by normalized name. Return a unified response:

```javascript
res.json({
  data: results.map(b => ({
    id: b.id || null,
    beer_name: b.name || b.beer_name,
    brewery: b.brewery_name || b.brewery || '',
    style: b.style || '',
    abv: b.abv || null,
    review_overall: b.review_overall ? parseFloat(b.review_overall) : null,
    review_count: b.review_count || 0,
    source: b.source || 'user'
  }))
});
```

---

## Task 2: Update autocomplete dropdown in frontend

In `apps/beerbook/app.js`, update the `bindBeerAutocomplete()` method.

Change the dropdown item rendering to include the community rating:

```javascript
const ratingBadge = b.review_overall
  ? `<span class="autocomplete-rating">${parseFloat(b.review_overall).toFixed(1)} / 5</span>`
  : '';
const reviewCount = b.review_count
  ? `<span class="autocomplete-reviews">(${b.review_count.toLocaleString()} reviews)</span>`
  : '';

const label = `<span class="autocomplete-beer-info">
  <span class="autocomplete-beer-name">${Utils.escapeHtml(b.beer_name || b.name || '')}</span>
  <span class="autocomplete-beer-meta">${Utils.escapeHtml(b.brewery || '')} · ${Utils.escapeHtml(b.style || '')}</span>
</span>
${ratingBadge}${reviewCount}`;
```

Also store the `beer_id` in `data-beer-id` on the autocomplete item so it can be used when submitting a rating:
```html
data-beer-id="${b.id || ''}"
```

When a user selects an autocomplete item, also set a hidden `beer_id` value for the rating submission.

---

## Task 3: Update `DB.searchBeers` in supabase.js

Make sure the frontend `searchBeers` function hits the updated endpoint and passes through the new fields (review_overall, review_count, id).

---

## Task 4: Add community rating to beer detail view

If there's a beer detail/profile page or modal, show the community rating prominently:

```html
<div class="community-rating">
  <span class="community-rating-score">3.85 / 5</span>
  <span class="community-rating-label">Community Avg · 497 reviews</span>
</div>
```

If no beer detail page exists yet, add one that opens when clicking a beer name anywhere in the app (autocomplete, browse, activity feed). It should show:
- Beer name, brewery, style, ABV
- Community average rating (from `beers` table)
- BeerBook user ratings (from `ratings` table)

---

## Task 5: CSS styling

In `apps/beerbook/styles.css`, add styles for the rating display in autocomplete:

```css
/* Autocomplete item layout */
.autocomplete-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.autocomplete-beer-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.autocomplete-beer-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.autocomplete-beer-meta {
  font-size: 0.8em;
  opacity: 0.7;
}
.autocomplete-rating {
  font-weight: 700;
  font-size: 0.85em;
  color: var(--accent, #f5a623);
  white-space: nowrap;
}
.autocomplete-reviews {
  font-size: 0.75em;
  opacity: 0.6;
  white-space: nowrap;
}

/* Beer detail community rating */
.community-rating {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  background: var(--card-bg, rgba(255,255,255,0.05));
}
.community-rating-score {
  font-size: 1.5em;
  font-weight: 700;
  color: var(--accent, #f5a623);
}
.community-rating-label {
  font-size: 0.8em;
  opacity: 0.7;
}
```

---

## Constraints
- Do NOT break existing rating submission flow
- Do NOT change the `ratings` table or any schema
- The autocomplete must still auto-fill beer name, brewery, and style fields when selected
- If a beer has no community rating (review_overall is null), just don't show a rating badge — don't show "N/A" or "0 / 5"
- Keep the response fast — the search should return in <200ms

## Validation
```bash
# Test the updated search endpoint
curl -s "https://api.beerbook.drinksafterwork.net/api/beers/search?q=sierra" | jq '.data[0]'
# Should return: { beer_name, brewery, style, review_overall, review_count, ... }

# Test with a beer that has ratings
curl -s "https://api.beerbook.drinksafterwork.net/api/beers/search?q=pliny" | jq '.data[] | {beer_name, review_overall, review_count}'
```
