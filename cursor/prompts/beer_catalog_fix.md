# Fix "Add as New Beer" Flow — Comprehensive Bug Fix

Apply `cursor/prompts/00_system.md` rules.

## Context Files (read before writing code)
- `apps/beerbook/app.js` — `bindBeerAutocomplete()`, `_renderBeerAutocompleteDropdown()`, `setNewBeerMode()`, `queueNewBeerValidation()`, `renderNewBeerMatches()`, `bindBreweryAutocomplete()`, `bindLocationAutocomplete()`, rating form submit handler
- `apps/beerbook/supabase.js` — `DB.validateNewBeer()`, `DB.searchBeers()`, `DB.searchBreweries()`
- `apps/beerbook-api/server.js` — POST `/api/ratings`, existing catalog endpoints
- `apps/beerbook-api/routes/beers.js` — `/search` endpoint
- `apps/beerbook/index.html` — rating form markup, `#beer-autocomplete`, `#brewery-autocomplete`, `#autocomplete-hint`
- `apps/beerbook/styles.css` — autocomplete styling, new-beer-mode styling
- `docs/AUTOCOMPLETE_ARCHITECTURE.md`
- `DECISIONS.md`

## Background

The "Add as new beer" flow is broken. When a user searches for a beer not in the catalog, the autocomplete correctly shows "➕ Add 'beer name' as a new beer" — but clicking it does nothing. The form never enters new-beer mode, so users can't add new beers to the catalog through the rating form.

There are **four bugs** that must be fixed together:

---

## Bug 1 (CRITICAL): Blur race condition kills dropdown clicks

**Root cause:** All three autocomplete dropdowns (beer, brewery, location) have the same bug. When the user clicks any dropdown item, focus leaves the input, triggering the `blur` handler which clears `dropdown.innerHTML` after 150ms. On many devices (especially mobile with 300ms tap delay), the `click` event fires **after** the dropdown has been destroyed — so the click handler never runs.

For regular autocomplete items (selecting an existing beer), this intermittently works on desktop because click often fires within 150ms, but it's unreliable on mobile. For the "Add as new beer" button, this is the primary reason `setNewBeerMode(true, q)` never executes.

**Current code pattern (same in all three autocomplete bindings):**
```javascript
input.addEventListener('blur', () => {
    setTimeout(() => {
        dropdown.innerHTML = '';
        dropdown.setAttribute('aria-hidden', 'true');
    }, 150);
});
```

**Fix:** Add `mousedown` and `touchstart` listeners on each dropdown that call `preventDefault()`. This keeps focus on the input when the user interacts with the dropdown, so blur never fires. The click then lands on the intended target, runs the handler, and the handler itself clears the dropdown.

**Apply this fix to ALL THREE autocomplete dropdowns:**

### 1a. Beer autocomplete (`bindBeerAutocomplete`)
In `bindBeerAutocomplete()`, after the dropdown element is referenced, add:
```javascript
// Prevent blur from destroying dropdown before click can fire
dropdown.addEventListener('mousedown', (e) => e.preventDefault());
dropdown.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
```

### 1b. Brewery autocomplete (`bindBreweryAutocomplete`)
In `bindBreweryAutocomplete()`, after the dropdown element is referenced, add the same two listeners on the brewery dropdown.

### 1c. Location autocomplete (`bindLocationAutocomplete`)
In `bindLocationAutocomplete()`, after the dropdown element is referenced, add the same two listeners on the venue-suggestions dropdown.

---

## Bug 2: `hintEl` out of scope in `_renderBeerAutocompleteDropdown`

**Root cause:** `_renderBeerAutocompleteDropdown(dropdown, allResults, isCatalog)` references `hintEl` inside the "Add as new beer" click handler, but `hintEl` is not passed as a parameter. It either resolves to `undefined` or picks up a closure variable from `bindBeerAutocomplete`.

**Fix:** Inside the "Add as new beer" click handler in `_renderBeerAutocompleteDropdown`, resolve `hintEl` directly:
```javascript
const hintEl = document.getElementById('autocomplete-hint');
if (hintEl) hintEl.style.display = 'none';
```

Do NOT add `hintEl` as a parameter to the function signature (to avoid changing all call sites). Just resolve it inside the handler.

---

## Bug 3: `GET /api/catalog/validate-new` endpoint does not exist (404)

**Root cause:** `queueNewBeerValidation()` calls `DB.validateNewBeer(name, brewery)`, which hits `GET /api/catalog/validate-new?name=...&brewery=...`. This endpoint **does not exist on the server** — it returns 404. So the entire new-beer duplicate-checking pipeline silently fails: `_newBeerMatches` stays empty, `_newBeerConfirmed` stays false, and `renderNewBeerMatches()` never shows the "Similar beers exist" / "Rate This Instead" / "Confirm New Beer" UI.

**Fix:** Add the endpoint to `server.js`. This uses the existing `search_beer_catalog` RPC function with enhanced similarity matching.

Add this route in `server.js` in the Phase 3.2 Catalog section (near the existing `/api/catalog/search` route):

```javascript
// GET /api/catalog/validate-new?name=...&brewery=...
// Returns similar beers from the catalog to prevent duplicates when adding new beers
app.get('/api/catalog/validate-new', async (req, res) => {
  const name = (req.query.name || '').trim();
  const brewery = (req.query.brewery || '').trim();
  if (name.length < 2) return res.json({ data: [] });

  try {
    // Search by beer name
    const nameSearchRes = await rest('POST', '/rpc/search_beer_catalog', {
      body: JSON.stringify({ search_term: name, max_results: 20 }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (nameSearchRes.status >= 400) {
      return res.json({ data: [] }); // Silent failure — don't block the form
    }

    const candidates = Array.isArray(nameSearchRes.body) ? nameSearchRes.body : [];

    // Filter and score: keep beers where name is similar OR (name somewhat similar AND brewery matches)
    const results = candidates
      .map(beer => {
        const nameSim = beer.similarity_score || 0;
        // Simple brewery similarity: check if brewery names share significant overlap
        const beerBrewery = (beer.brewery_name || '').toLowerCase();
        const inputBrewery = brewery.toLowerCase();
        const breweryMatch = brewery.length >= 2 && (
          beerBrewery.includes(inputBrewery) ||
          inputBrewery.includes(beerBrewery) ||
          beerBrewery === inputBrewery
        );
        return {
          id: beer.id,
          name: beer.name,
          brewery_name: beer.brewery_name,
          style: beer.style,
          abv: beer.abv != null ? Number(beer.abv) : null,
          name_similarity: nameSim,
          brewery_match: breweryMatch,
        };
      })
      .filter(b => b.name_similarity > 0.4 || (b.name_similarity > 0.25 && b.brewery_match))
      .sort((a, b) => b.name_similarity - a.name_similarity)
      .slice(0, 5);

    res.json({ data: results });
  } catch (e) {
    console.error('Validate new beer error:', e);
    res.json({ data: [] }); // Silent failure
  }
});
```

Then verify `DB.validateNewBeer()` in `supabase.js` hits this endpoint correctly. It should be:
```javascript
async validateNewBeer(name, brewery) {
    if (this.isDemo) return { matches: [] };
    try {
        const out = await this._api('GET', `/api/catalog/validate-new?name=${encodeURIComponent(name)}&brewery=${encodeURIComponent(brewery)}`);
        return { matches: (out && Array.isArray(out.data)) ? out.data : [] };
    } catch (err) {
        console.warn('validateNewBeer failed:', err.message);
        return { matches: [] };
    }
}
```

If the existing `validateNewBeer` in `supabase.js` has different return shapes, update `queueNewBeerValidation()` in `app.js` accordingly so that `_newBeerMatches` is populated from the response and `_newBeerConfirmed` is set to `true` only when matches is empty.

---

## Bug 4: Competing "not found" pathways with inconsistent thresholds

**Root cause:** Three different code paths each define "not in catalog" differently:

| Path | Trigger | Logic | Problem |
|------|---------|-------|---------|
| A. Autocomplete search | User types beer name | Text search via `search_beer_catalog` (name only) | "Not found" = zero search results |
| B. Validate-new (typing) | User in new-beer mode, types name + brewery | `DB.validateNewBeer(name, brewery)` | Shows "similar beers exist" at different threshold than A |
| C. Submit (409) | Form submission with `is_new_beer: true` | Server-side `findSimilarBeers` | **Currently broken** — `findSimilarBeers` doesn't exist on server |

Path A can say "not found" while Path B immediately says "similar beers exist" for the same beer (because B uses name+brewery similarity while A uses text search). Path C may produce yet another result.

**Fix — Simplify to two consistent paths:**

1. **Autocomplete (Path A):** Searches catalog. If no results and ≥ 3 chars → show "Add as new beer" option. This is the entry point into new-beer mode. **No changes needed here.**

2. **Validate-new (Path B) — align with Path A:** Once the user clicks "Add as new beer" and enters a brewery, `queueNewBeerValidation` calls the new `/api/catalog/validate-new` endpoint (Bug 3 fix above). This shows "Similar beers exist" only for genuinely close matches. The endpoint uses the same `search_beer_catalog` RPC as autocomplete, plus brewery filtering, so results are consistent. **This is fixed by Bug 3.**

3. **Submit validation (Path C) — remove the 409 blocking check:** The server-side `findSimilarBeers` call on submit **does not exist** (there's no such function or endpoint). Remove the client-side 409 handling that expects it. On submit with `is_new_beer: true`, the rating should insert normally with `beer_id: null`. The duplicate protection is already provided by Path B (validate-new while typing).

   In `app.js`, in the submit handler, find the block around line ~890 that catches a 409 response with `err.details.matches` and tries to show similar beers. Remove or simplify this — if `queueNewBeerValidation` (Path B) already confirmed the beer is new, trust that confirmation and submit without a second server-side similarity check.

   Specifically, change the submit error handling so that a 409 from the server (which currently can't happen since `findSimilarBeers` doesn't exist) doesn't attempt to populate `_newBeerMatches` and re-render. Just let the normal error handling apply.

---

## Summary of changes

### `apps/beerbook/app.js`
1. **`bindBeerAutocomplete()`** — Add `mousedown`/`touchstart` + `preventDefault()` on `#beer-autocomplete` dropdown
2. **`bindBreweryAutocomplete()`** — Add same `mousedown`/`touchstart` + `preventDefault()` on `#brewery-autocomplete` dropdown
3. **`bindLocationAutocomplete()`** — Add same `mousedown`/`touchstart` + `preventDefault()` on `#venue-suggestions` dropdown
4. **`_renderBeerAutocompleteDropdown()`** — Fix `hintEl` scope: resolve via `document.getElementById('autocomplete-hint')` inside the "Add as new beer" click handler
5. **Submit handler** — Remove/simplify the 409 + `findSimilarBeers` match handling that references a nonexistent server endpoint. If `_newBeerConfirmed` is true, trust it.

### `apps/beerbook-api/server.js`
6. **Add `GET /api/catalog/validate-new`** endpoint (see Bug 3 implementation above)

### `apps/beerbook/supabase.js`
7. **Verify `validateNewBeer()`** hits the correct endpoint and returns `{ matches: [...] }`. Fix if needed.

### Files NOT modified
- `apps/beerbook/index.html` — no markup changes needed
- `apps/beerbook/styles.css` — no style changes needed (new-beer mode styles already exist)
- `apps/beerbook-api/routes/beers.js` — no changes
- Database schema — no changes

---

## Acceptance Criteria

### "Add as new beer" flow works end-to-end
- [ ] Type a beer name not in catalog (e.g. "Totally Made Up IPA") → autocomplete shows "➕ Add 'Totally Made Up IPA' as a new beer"
- [ ] Click/tap the "Add as new beer" option → form enters new-beer mode:
  - Helper banner appears: "🆕 Adding a new beer requires Brewery, Style, and ABV..."
  - Brewery placeholder changes to "Required to add a beer"
  - Style first option changes to "Required to add a beer"
  - ABV placeholder changes to "Required to add a beer"
  - Submit button text changes to "🍺 Submit Rating & Add Beer"
- [ ] Type a brewery name → after 300ms, `queueNewBeerValidation` fires and checks for similar beers
- [ ] If similar beers found → "Similar beers already exist" UI shows with "Rate This Instead" options
- [ ] If no similar beers → `_newBeerConfirmed = true`, user can submit
- [ ] Submit with all required fields → rating created with `beer_id: null` and `is_new_beer: true`

### Blur race condition fixed on ALL dropdowns
- [ ] On mobile (or throttled network): click any beer autocomplete suggestion → it selects correctly every time
- [ ] On mobile: click "Add as new beer" → new-beer mode activates every time
- [ ] On mobile: click any brewery autocomplete suggestion → brewery fills correctly every time
- [ ] On mobile: click any location suggestion → location fills correctly every time

### Existing flows still work
- [ ] Select a catalog beer from autocomplete → fills name, brewery, style, ABV, beer_id as before
- [ ] Rate a catalog beer → submits with `beer_id` linked
- [ ] Demo mode → autocomplete still works (uses local search, validate-new skipped)
- [ ] Form validation → still requires beer name, style, and star rating
- [ ] Existing ratings with `beer_id: null` → unaffected

---

## Validation Commands

```bash
# Test the new validate-new endpoint
curl -s 'https://api.beerbook.drinksafterwork.net/api/catalog/validate-new?name=pliny&brewery=russian' | jq .
# Should return similar beers from catalog

curl -s 'https://api.beerbook.drinksafterwork.net/api/catalog/validate-new?name=zzzznotabeer&brewery=zzzzz' | jq .
# Should return { data: [] }

curl -s 'https://api.beerbook.drinksafterwork.net/api/catalog/validate-new?name=a&brewery=b' | jq .
# Should return { data: [] } (name too short)

# Verify existing endpoints still work
curl -s 'https://api.beerbook.drinksafterwork.net/api/beers/search?q=hazy' | jq '.data | length'
curl -s 'https://api.beerbook.drinksafterwork.net/api/catalog/search?q=pliny&limit=5' | jq .
```

## Manual Test Script

1. Open BeerBook → Rate a Beer
2. Type "Dead Beer Scrolls" (a name not in catalog)
3. Wait for autocomplete → should show "➕ Add 'Dead Beer Scrolls' as a new beer"
4. Tap/click it → form should enter new-beer mode (banner, required placeholders, button text change)
5. Type "Test Brewery" in Brewery field → wait for validate-new check
6. Select "IPA" style, enter "6.5" ABV, give star rating
7. Submit → should succeed with `is_new_beer: true`

**Repeat step 3-4 on mobile or with Chrome DevTools mobile emulation** to verify the blur fix works on touch devices.

---

## Constraints

- Do NOT modify database schema
- Do NOT add new npm packages
- Do NOT create new route files — add the new endpoint in `server.js` with the other catalog routes
- Do NOT break existing autocomplete flows (catalog beer selection must still work)
- Do NOT break demo mode
- Vanilla JS only
- The `setNewBeerMode`, `queueNewBeerValidation`, `renderNewBeerMatches`, and related functions already exist in `app.js` — do NOT rewrite them. Only fix the bugs that prevent them from being reached/triggered.

## Rollback

1. `app.js`: Remove the three `mousedown`/`touchstart` preventDefault listeners on dropdowns. Revert `hintEl` fix. Revert submit handler changes.
2. `server.js`: Remove the `GET /api/catalog/validate-new` route.
3. `supabase.js`: Revert any changes to `validateNewBeer()`.
4. Redeploy.

## Agent Assumption Log

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| | Bug 1 | `mousedown` + `preventDefault()` on dropdown prevents input blur on all browsers | Standard autocomplete pattern; widely used in dropdown components |
| | Bug 1 | The same blur race affects brewery and location autocomplete dropdowns | Confirmed: no `preventDefault` calls exist on any dropdown in current code |
| | Bug 3 | `search_beer_catalog` RPC returns `similarity_score` that can be used for duplicate detection | Confirmed in migration-3.1.sql and schema docs |
| | Bug 3 | Simple substring brewery matching is sufficient for validate-new | Full trigram similarity on brewery would require a new Postgres function; substring catch covers most cases |
| | Bug 4 | Server-side `findSimilarBeers` does not exist | Confirmed: `/api/catalog/validate-new` returns 404; no `findSimilarBeers` function in server.js |
| | Bug 4 | Removing the 409 submit-time similarity check is safe | The typing-time validate-new check (Path B) provides duplicate protection before submit |
