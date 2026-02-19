# Phase 3.2 — Wire Beer Catalog to UI — Deliverable

## Plan (executed)

1. Add GET `/api/catalog/search?q=&limit=` and GET `/api/catalog/beer/:id` in `server.js` (RPC + single beer).
2. Add `beer_id` to POST `/api/ratings` payload in `server.js` (nullable).
3. In `supabase.js`: add `searchCatalog()`, `getCatalogBeer()`, and `beer_id` in `addRating()` (and demo path).
4. In `app.js`: replace beer autocomplete to use catalog search when not demo (debounce 300ms, min 2 chars); dropdown format "beer name — brewery (style) ABV%"; on select store `beer_id` in hidden field and fill name/brewery/style/abv.
5. Add hidden input `#rating-beer-id` and "Not in the catalog?" hint in `index.html`; show hint when 3+ chars and no catalog results.
6. In `app.js` rating submit: include `beer_id` from `#rating-beer-id`; in `resetRatingForm` clear `#rating-beer-id`.
7. Add `data-beer-id` to beer-name links (recent reviews, browse, profile, activity) when rating has `beer_id`.
8. In `openBeerDetail(beerName, brewery, style, beerId)`: when `beerId` present, fetch catalog beer and render catalog info card (description, ABV, community rating, style) only for fields with data.
9. Add CSS for `.autocomplete-hint` and `.catalog-info` (and children) in `styles.css`.

## Modified files

- `apps/beerbook-api/server.js` — catalog search + catalog beer by id; `beer_id` in POST /api/ratings.
- `apps/beerbook/app.js` — beer autocomplete (catalog + demo fallback), `_renderBeerAutocompleteDropdown`, rating payload `beer_id`, reset form, `data-beer-id` on links, `openBeerDetail(beerId)` + catalog info card.
- `apps/beerbook/supabase.js` — `searchCatalog()`, `getCatalogBeer()`, `beer_id` in addRating (and demo).
- `apps/beerbook/index.html` — hidden `#rating-beer-id`, `#autocomplete-hint` div.
- `apps/beerbook/styles.css` — `.autocomplete-hint`, `.catalog-info` (and `.catalog-badge`, `.catalog-desc`, `.catalog-stats`).

## Validation commands (VPS-side)

```bash
# From project root on VPS (/opt/daw-platform or equivalent)

# 1. Catalog search (no auth)
curl -s "https://api.beerbook.drinksafterwork.net/api/catalog/search?q=pliny&limit=5" | jq .

# 2. Short query returns empty
curl -s "https://api.beerbook.drinksafterwork.net/api/catalog/search?q=a&limit=5" | jq '.data | length'
# Expect: 0

# 3. Catalog beer by id (use an id from step 1)
curl -s "https://api.beerbook.drinksafterwork.net/api/catalog/beer/<BEER_ID>" | jq .

# 4. Submit rating with beer_id (requires valid JWT)
# Use app UI: select a catalog beer in autocomplete, submit rating; then open that beer detail and confirm "From BeerBook Catalog" card appears when the rating has beer_id.
```

## Rollback steps

1. **server.js**: Remove the two catalog route blocks (GET `/api/catalog/search`, GET `/api/catalog/beer/:id`). Remove `beer_id: b.beer_id ?? b.beerId ?? null` from the POST /api/ratings record.
2. **supabase.js**: Remove `searchCatalog`, `getCatalogBeer`; remove `beer_id` from addRating record and body and from demo rev object.
3. **app.js**: Restore previous `bindBeerAutocomplete` (searchBeers + searchBeersExternal, no catalog); remove `_renderBeerAutocompleteDropdown`; remove `beer_id` from rating object and from `resetRatingForm`; remove `data-beer-id` from all beer-name-link renders and from openBeerDetail(beerId) and catalog info HTML.
4. **index.html**: Remove `<input type="hidden" id="rating-beer-id">` and the `#autocomplete-hint` div.
5. **styles.css**: Remove `.autocomplete-hint` and `.catalog-info` (and children) rules.

Database and Phase 3.1 schema are unchanged; `ratings.beer_id` remains nullable. No migration rollback required.
