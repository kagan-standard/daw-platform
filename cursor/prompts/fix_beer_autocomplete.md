# Fix: Beer Name Autocomplete — Single Reliable Search Path

Apply `cursor/prompts/00_system.md` rules.

## Context Files (read before writing code)
- `ARCHITECTURE.md`
- `DECISIONS.md`
- `apps/beerbook-api/routes/beers.js` (the `/search` endpoint — **this is the file to fix**)
- `apps/beerbook/supabase.js` (the `DB.searchBeers()` method — frontend caller)
- `apps/beerbook/app.js` (the `bindBeerAutocomplete()` method — UI wiring)

## Problem

The beer name autocomplete on the rating form keeps breaking and being re-fixed in a cycle. Each time, the same set of fixes is re-applied (contains-match patterns, RPC parsing, merge behavior). This indicates the root cause is architectural fragility, not a simple bug.

**Root cause analysis:**

The current search has multiple code paths that can diverge:
1. The backend `/api/beers/search` endpoint queries PostgREST with an ILIKE pattern
2. The frontend `DB.searchBeers()` has (or has had) fallback logic to try `/api/catalog/search` if `/api/beers/search` fails
3. The ILIKE pattern construction has been inconsistent (prefix-only vs contains-match)
4. The `%` character sanitization has been inconsistent
5. The response parsing has been fragile (expecting specific shapes from PostgREST)

**The fix must eliminate all ambiguity by consolidating to one search path with no fallbacks, no RPC indirection, and bulletproof response handling.**

---

## Workstream 1: Backend — Rewrite `/api/beers/search` in `beers.js`

Replace the existing `router.get('/search', ...)` handler with a clean, defensive implementation.

### Requirements:

```javascript
// GET /api/beers/search?q=X — autocomplete, top 10 unique beers
router.get('/search', (req, res, next) => {
  // 1. Sanitize: trim, strip %, strip *, lowercase for matching
  const q = (req.query.q || '').trim().replace(/[%*]/g, '');
  if (!q || q.length < 2) return res.json({ data: [] });

  // 2. Build PostgREST query — contains-match (not prefix-only)
  //    The pattern is: *query* which PostgREST translates to ILIKE '%query%'
  const encoded = encodeURIComponent(q);
  
  // 3. Query ratings table for beer_name matches
  //    Also try brewery match as secondary signal
  //    Select only the fields we need
  //    Order by beer_name for deterministic results
  //    Fetch enough rows to deduplicate from (50 is plenty)
  const url = `/ratings?or=(beer_name.ilike.*${encoded}*,brewery.ilike.*${encoded}*)&select=beer_name,brewery,style&order=beer_name.asc&limit=50`;
  
  rest('GET', url, {})
    .then(({ status, body }) => {
      // 4. Defensive response parsing — handle any shape
      if (status >= 400) return res.json({ data: [] }); // Fail silent, not loud
      
      let rows = [];
      if (Array.isArray(body)) {
        rows = body;
      } else if (body && Array.isArray(body.data)) {
        rows = body.data;
      } else if (body && typeof body === 'object') {
        rows = []; // Unknown shape — return empty, don't crash
      }
      
      // 5. Deduplicate by beer_name (case-insensitive)
      const seen = new Set();
      const deduped = [];
      for (const r of rows) {
        const name = (r.beer_name || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({
          beer_name: name,
          brewery: (r.brewery || '').trim(),
          style: (r.style || '').trim()
        });
        if (deduped.length >= 10) break;
      }
      
      // 6. Always return { data: [...] } — consistent shape, always
      res.json({ data: deduped });
    })
    .catch(err => {
      // 7. Never crash the server on autocomplete failure
      console.error('Beer search error:', err.message);
      res.json({ data: [] });
    });
});
```

### Key design decisions (DO NOT deviate):

| Decision | Rationale |
|----------|-----------|
| Contains-match (`*query*`) not prefix (`query*`) | Users type partial names like "hazy" expecting "Super Hazy IPA" |
| Query `ratings` table, not an RPC function | RPC functions can be missing, have wrong signatures, or return unexpected shapes. Direct table query via PostgREST is reliable and testable. |
| `or=(beer_name.ilike.*q*,brewery.ilike.*q*)` | Searches both fields in one query — user might type "sierra" meaning the brewery |
| Silent failure (`res.json({ data: [] })`) on errors | Autocomplete should never show errors to the user. Empty results are fine; 500s are not. |
| No fallback to `/api/catalog/search` or any other endpoint | Multiple code paths = multiple failure modes. One path. |
| Strip `%` and `*` from input | These are PostgREST wildcards and will corrupt the query pattern |
| Fetch 50, return 10 | Gives enough rows to deduplicate from while keeping response fast |
| `order=beer_name.asc` | Deterministic ordering prevents results from shuffling between requests |

---

## Workstream 2: Frontend — Clean up `DB.searchBeers()` in `supabase.js`

Replace the existing `searchBeers` method. **Remove any fallback logic** that tries alternate endpoints.

### Requirements:

```javascript
async searchBeers(q) {
    if (this.isDemo) return [];
    if (!q || q.length < 2) return [];
    try {
        const out = await this._api('GET', `/api/beers/search?q=${encodeURIComponent(q)}`);
        return (out && Array.isArray(out.data)) ? out.data : [];
    } catch (err) {
        console.warn('searchBeers failed:', err.message);
        return []; // Silent failure — never break the form
    }
}
```

### What to remove:
- Any `if (!results.length)` fallback to `/api/catalog/search`
- Any `if (!results.length)` fallback to `/api/catalog/beers`
- Any direct Supabase RPC calls for search
- Any retry logic or alternate endpoint attempts

**One endpoint. One call. Done.**

---

## Workstream 3: Frontend — Verify `bindBeerAutocomplete()` in `app.js`

This should already be correct, but verify these properties:

1. **Debounce is present** — at least 200ms between keystrokes triggering search
2. **Minimum 2 characters** before searching (matches backend check)
3. **Dropdown is cleared** before each new search fires
4. **Click handler on items** populates beer-name, beer-brewery, and beer-style fields
5. **Dropdown hides** after selection
6. **No duplicate event listeners** — the `bindBeerAutocomplete()` method should only be called once

If any of these are broken, fix them. If they're fine, don't touch this file.

---

## Workstream 4: Remove dead code

Search the entire codebase for any references to these patterns and remove them:
- `/api/catalog/search` (if this endpoint/route doesn't exist, remove references to it)
- `searchBeersRPC` or `search_beers` RPC function calls
- Any commented-out autocomplete code in `supabase.js` or `beers.js`
- Any `TODO` or `FIXME` comments related to autocomplete

**Do not remove the `/api/catalog/beers` or `/api/catalog/breweries` endpoints if they exist and serve other purposes (like the catalog browse feature). Only remove dead search/autocomplete fallback references.**

---

## Acceptance Criteria

1. Type "hazy" in the beer name field → dropdown shows beers with "hazy" in the name
2. Type "sierra" in the beer name field → dropdown shows Sierra Nevada beers (matched on brewery)
3. Type "ip" in the beer name field → dropdown shows IPAs (matched on beer name containing "ip")
4. Type "a" → nothing happens (minimum 2 chars)
5. Type "%*" → nothing happens (sanitized to empty)
6. Select a dropdown item → beer name, brewery, style fields populate
7. Network error / API down → no error shown, empty dropdown, form still works for manual entry
8. `curl 'http://localhost:PORT/api/beers/search?q=test'` returns `{ "data": [...] }` shape always
9. No console errors during normal autocomplete usage
10. No references to fallback search endpoints remain in frontend code

## Validation Commands

```bash
# Test the endpoint directly
curl -s 'https://api.beerbook.drinksafterwork.net/api/beers/search?q=hazy' | jq '.data | length'
curl -s 'https://api.beerbook.drinksafterwork.net/api/beers/search?q=sierra' | jq '.data[0]'
curl -s 'https://api.beerbook.drinksafterwork.net/api/beers/search?q=' | jq '.'  # should return { data: [] }
curl -s 'https://api.beerbook.drinksafterwork.net/api/beers/search?q=%25%2A' | jq '.'  # should return { data: [] }

# Check no fallback references remain
grep -r "catalog/search" apps/beerbook/ apps/beerbook-api/
grep -r "searchBeersRPC\|search_beers" apps/beerbook/ apps/beerbook-api/
```

## Rollback

- Restore `apps/beerbook-api/routes/beers.js` from git
- Restore `apps/beerbook/supabase.js` from git
- Redeploy

## Constraints

- Do NOT add new npm packages
- Do NOT create new route files — edit the existing `beers.js`
- Do NOT add RPC functions to Supabase
- Do NOT add fallback endpoints — the whole point is eliminating fallbacks
- Do NOT modify `app.js` unless `bindBeerAutocomplete()` is actually broken

## Agent Assumption Log

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| | 1 | PostgREST `or=()` filter syntax works with `ilike` on the `ratings` table | Standard PostgREST syntax, used elsewhere in the codebase |
| | 1 | `ratings` table has `beer_name`, `brewery`, `style` columns | Confirmed in existing schema and working `/search` endpoint |
| | 2 | `DB._api()` method handles auth headers and base URL | Existing pattern used by all other API calls in `supabase.js` |
| | 3 | `bindBeerAutocomplete()` is called once during app initialization | Existing pattern in `app.js` init flow |
