# Phase 3.6 — External API Integrations (Beer, Brewery & Venue Lookup)

Apply `cursor/prompts/00_system.md` rules.

**Prerequisite:** Phase 2.4 must be deployed and verified. Existing beer autocomplete from local `ratings` table must be working.

## Context Files (read before writing code)
- `DECISIONS.md`
- `apps/beerbook/app.js` — existing `bindBeerAutocomplete()` method
- `apps/beerbook/supabase.js` — existing `searchBeers()` method
- `apps/beerbook/styles.css`
- `apps/beerbook/index.html` — existing rating form, location capture flow
- `apps/beerbook-api/server.js` **(read-only — do NOT modify)**

## Goal

Enhance the rating form with external API fallbacks for beer, brewery, and venue discovery. The local database remains the primary data source — external APIs fill gaps when the user searches for something the crew hasn't rated yet. All external API calls happen **client-side** (no server.js changes). No API keys required.

**Do NOT modify `server.js` or the database schema.**

## Multi-Tenant Note (Path A)

These external API integrations are stateless client-side calls — no tenant scoping needed. However, when external data is used to create new ratings or venues, those records will inherit whatever `crew_id` scoping exists on the `ratings` and `venues` tables. No special Path A work required in this phase.

---

## Task 1: Beer Autocomplete — OpenFoodFacts Fallback

Modify the existing `bindBeerAutocomplete()` flow in `app.js` to add a fallback when the local database returns few or no results.

### Flow

1. User types in beer name field (existing debounce 300ms)
2. First: query local DB via `DB.searchBeers(q)` (existing, unchanged)
3. If local results < 3: **also** query OpenFoodFacts in parallel
4. Merge results: local results first (labeled "From your crew"), then OpenFoodFacts results (labeled "From beer database")
5. Deduplicate by normalized beer name (lowercase, trimmed)

### OpenFoodFacts API

```
GET https://world.openfoodfacts.org/cgi/search.pl?search_terms={query}&categories_tags_en=beers&json=1&page_size=10&fields=product_name,brands,categories_tags_en,image_front_small_url
```

- No API key required
- No authentication
- Rate limit: be polite, 1 req/sec max (the debounce handles this)
- Custom header: `User-Agent: BeerBook/1.0 (drinksafterwork.net)`

### Response Parsing

OpenFoodFacts returns:
```json
{
  "products": [
    {
      "product_name": "Sierra Nevada Pale Ale",
      "brands": "Sierra Nevada Brewing Co.",
      "categories_tags_en": ["beers", "pale-ales"],
      "image_front_small_url": "https://..."
    }
  ]
}
```

Map to autocomplete format:
```javascript
{
  beer_name: product.product_name,
  brewery: product.brands || '',
  style: extractStyle(product.categories_tags_en), // parse most specific beer category
  source: 'openfoodfacts'  // used for UI labeling only
}
```

### Style Extraction Helper

`categories_tags_en` is an array like `["beers", "pale-ales", "american-pale-ales"]`. Extract the most specific (last/longest) beer-related tag, convert from slug to display name:
```javascript
function extractBeerStyle(tags) {
    if (!Array.isArray(tags)) return '';
    const beerTags = tags.filter(t => t !== 'beers' && t !== 'alcoholic-beverages');
    if (!beerTags.length) return '';
    const best = beerTags[beerTags.length - 1]; // most specific
    return best.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
```

### Autocomplete Dropdown UI Changes

Update the dropdown rendering to show grouped results:

```html
<!-- When both local and external results exist -->
<div class="autocomplete-group-label">From your crew</div>
<div class="autocomplete-item" data-source="local" ...>Sierra Nevada Pale Ale — Sierra Nevada (IPA)</div>
...
<div class="autocomplete-group-label">From beer database</div>
<div class="autocomplete-item" data-source="openfoodfacts" ...>Sierra Nevada Torpedo — Sierra Nevada Brewing Co. (Extra IPA)</div>
...
```

- Group labels styled: `font-size: 0.75rem; color: var(--amber-400); text-transform: uppercase; padding: 6px 12px; opacity: 0.7;`
- External results get a subtle "🌐" icon prefix to distinguish them
- Selecting an external result auto-fills beer_name, brewery, style — same as local

### Error Handling

- If OpenFoodFacts is unreachable or returns error: silently ignore, show only local results
- Never block the autocomplete on an external API failure
- Wrap the fetch in try/catch, log to console only

### New Method in `supabase.js`

```javascript
async searchBeersExternal(q) {
    if (!q || q.length < 3) return [];
    try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&categories_tags_en=beers&json=1&page_size=10&fields=product_name,brands,categories_tags_en`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'BeerBook/1.0' }
        });
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.products) return [];
        return data.products
            .filter(p => p.product_name)
            .map(p => ({
                beer_name: p.product_name,
                brewery: p.brands || '',
                style: extractBeerStyle(p.categories_tags_en),
                source: 'openfoodfacts'
            }));
    } catch (e) {
        console.warn('OpenFoodFacts search failed:', e.message);
        return [];
    }
}
```

---

## Task 2: Brewery Autocomplete — Open Brewery DB

Add brewery name autocomplete to the `beer-brewery` input field. Currently this field has no autocomplete.

### API

```
GET https://api.openbrewerydb.org/v1/breweries/autocomplete?query={q}
```

- No API key required
- Returns up to 15 results
- Response:
```json
[
  {
    "id": "sierra-nevada-brewing-co",
    "name": "Sierra Nevada Brewing Co.",
    "brewery_type": "regional",
    "city": "Chico",
    "state": "California",
    "country": "United States",
    "website_url": "http://www.sierranevada.com"
  }
]
```

### Implementation

1. Add a new `<div id="brewery-autocomplete" class="autocomplete-dropdown" aria-hidden="true"></div>` after the brewery input in `index.html`
2. New method `bindBreweryAutocomplete()` in `app.js` — same pattern as beer autocomplete
3. Debounce 300ms, minimum 2 characters
4. Dropdown shows: `"Sierra Nevada Brewing Co. — Chico, CA (Regional)"`
5. Selecting fills the brewery input field only
6. Styled identically to beer autocomplete dropdown

### New Method in `supabase.js`

```javascript
async searchBreweries(q) {
    if (!q || q.length < 2) return [];
    try {
        const url = `https://api.openbrewerydb.org/v1/breweries/autocomplete?query=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn('Open Brewery DB search failed:', e.message);
        return [];
    }
}
```

### Error Handling

Same as Task 1 — silent failure, local-only fallback. If the API is down, the brewery field just works as a plain text input (current behavior, no regression).

---

## Task 3: Venue Suggestions — Overpass API (OpenStreetMap)

When the user clicks "📍 Add Location" and geolocation succeeds, query Overpass API for nearby bars, pubs, restaurants, and breweries. Show them as selectable venue suggestions instead of requiring the user to type a venue name manually.

### Flow

1. User clicks "📍 Add Location" → geolocation succeeds (existing flow, unchanged)
2. After getting coordinates: **in parallel** with the existing Nominatim reverse geocode, query Overpass for nearby venues
3. Show a new **venue picker** UI between the location chip and the price section
4. User can: select a suggested venue, OR type a custom venue name (existing manual flow)
5. Selected venue populates `venue_id` (if it matches an existing DAW venue) or stages a new venue creation on submit

### Overpass API Query

```
[out:json][timeout:10];
(
  node["amenity"~"bar|pub|restaurant|biergarten|cafe"](around:200,{lat},{lng});
  node["craft"="brewery"](around:200,{lat},{lng});
  way["amenity"~"bar|pub|restaurant|biergarten|cafe"](around:200,{lat},{lng});
  way["craft"="brewery"](around:200,{lat},{lng});
);
out center tags;
```

Endpoint: `https://overpass-api.de/api/interpreter`
Method: POST with `data=` form-encoded body

- No API key required
- Rate limit: be polite, max 1 concurrent request
- Timeout: 10 seconds (set in query and in fetch)
- 200m radius is good default — catches the bar you're sitting in without too much noise

### Response Parsing

Overpass returns `elements` array. Each element has:
```json
{
  "type": "node",
  "id": 123456,
  "lat": 39.9526,
  "lon": -75.1652,
  "tags": {
    "name": "The Blind Pig",
    "amenity": "bar",
    "addr:street": "123 Main St",
    "addr:city": "Philadelphia",
    "opening_hours": "Mo-Sa 11:00-02:00",
    "website": "https://..."
  }
}
```

For `way` elements, coordinates are in `center.lat` / `center.lon`.

Map to venue suggestion format:
```javascript
{
  osm_id: element.id,
  name: element.tags.name || 'Unknown Venue',
  type: element.tags.amenity || element.tags.craft || 'venue',
  latitude: element.lat || element.center?.lat,
  longitude: element.lon || element.center?.lon,
  address: buildAddress(element.tags), // addr:street, addr:city, addr:state
  source: 'overpass'
}
```

Filter out results with no `name` tag (unnamed POIs are useless).

### Venue Picker UI

Add a new section to the rating form, visible only when location is captured:

```html
<div id="venue-picker" class="venue-picker" style="display:none;">
    <label>Where are you drinking?</label>
    <div id="venue-suggestions" class="venue-suggestions">
        <!-- Loading state -->
        <div class="venue-suggestion-skeleton">
            <div class="skeleton" style="height:40px;margin-bottom:6px;"></div>
            <div class="skeleton" style="height:40px;margin-bottom:6px;"></div>
        </div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" id="btn-custom-venue">
        + Add a different place
    </button>
</div>
```

Each venue suggestion is a clickable card:
```html
<div class="venue-suggestion" data-osm-id="123" data-name="The Blind Pig" data-lat="39.95" data-lng="-75.16">
    <span class="venue-icon">🍺</span>
    <div class="venue-info">
        <div class="venue-name">The Blind Pig</div>
        <div class="venue-meta">Bar · 50m away · 123 Main St</div>
    </div>
</div>
```

### Venue Icons by Type

```javascript
function venueIcon(type) {
    switch(type) {
        case 'bar': case 'pub': return '🍺';
        case 'restaurant': return '🍽️';
        case 'biergarten': return '🌿';
        case 'brewery': return '🏭';
        case 'cafe': return '☕';
        default: return '📍';
    }
}
```

### Distance Calculation

Show distance from user in the venue card:
```javascript
function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

Display as: `50m away` (if <1000m) or `1.2 km away` (if >=1000m).

Sort suggestions by distance ascending.

### Venue Selection Logic

When user selects a suggested venue:
1. Check if a DAW venue already exists within 100m of the selected OSM venue (query `GET /api/venues?lat=X&lng=Y&radius=100`)
2. If match found: set `venue_id` to the existing DAW venue ID
3. If no match: store the OSM venue data for creation on form submit — create a new DAW venue via `POST /api/venues` with `{ name, latitude, longitude, address }`
4. Show selected venue as a chip (similar to location chip): `"🍺 The Blind Pig ✕"`
5. Clicking ✕ clears venue selection and re-shows suggestions

### "Add a different place" Button

If the user's bar isn't in the Overpass results:
1. Click "Add a different place" → show a text input for venue name
2. On submit: create venue with the user's geolocated coordinates + typed name

### New Method in `supabase.js`

```javascript
async searchNearbyVenues(lat, lng, radius = 200) {
    try {
        const query = `[out:json][timeout:10];(node["amenity"~"bar|pub|restaurant|biergarten|cafe"](around:${radius},${lat},${lng});node["craft"="brewery"](around:${radius},${lat},${lng});way["amenity"~"bar|pub|restaurant|biergarten|cafe"](around:${radius},${lat},${lng});way["craft"="brewery"](around:${radius},${lat},${lng}););out center tags;`;
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(query)
        });
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.elements) return [];
        return data.elements
            .filter(e => e.tags && e.tags.name)
            .map(e => ({
                osm_id: e.id,
                name: e.tags.name,
                type: e.tags.amenity || e.tags.craft || 'venue',
                latitude: e.lat || e.center?.lat,
                longitude: e.lon || e.center?.lon,
                address: [e.tags['addr:street'], e.tags['addr:city'], e.tags['addr:state']].filter(Boolean).join(', '),
                source: 'overpass'
            }));
    } catch (e) {
        console.warn('Overpass API search failed:', e.message);
        return [];
    }
}
```

### Error Handling

- If Overpass is unreachable: hide venue picker, fall back to manual venue entry (existing flow)
- If no venues found within 200m: show "No nearby venues found" + manual entry option
- Never block the rating form on Overpass failure

---

## Task 4: Styling

All new UI elements must match the existing dark theme. Add to `styles.css`:

### Autocomplete Group Labels
```css
.autocomplete-group-label {
    font-size: 0.7rem;
    color: var(--amber-400);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 6px 12px 2px;
    opacity: 0.7;
    pointer-events: none;
}

.autocomplete-item[data-source="openfoodfacts"]::before {
    content: "🌐 ";
    font-size: 0.75rem;
}
```

### Venue Picker
```css
.venue-picker {
    margin: 12px 0;
}

.venue-suggestions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 8px 0;
}

.venue-suggestion {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--dark-700);
    border: 1px solid var(--dark-600);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
}

.venue-suggestion:hover,
.venue-suggestion.selected {
    border-color: var(--amber-400);
    background: var(--dark-600);
}

.venue-icon {
    font-size: 1.3rem;
    flex-shrink: 0;
}

.venue-name {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.9rem;
}

.venue-meta {
    font-size: 0.75rem;
    color: var(--text-muted);
}

.venue-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--dark-700);
    border: 1px solid var(--amber-400);
    border-radius: 100px;
    font-size: 0.85rem;
    color: var(--amber-300);
}

.venue-chip-remove {
    cursor: pointer;
    opacity: 0.7;
    font-size: 0.75rem;
}

.venue-chip-remove:hover {
    opacity: 1;
}

.venue-suggestion-skeleton {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
```

### Brewery Autocomplete

Reuse existing `.autocomplete-dropdown` and `.autocomplete-item` styles — no new CSS needed. Just ensure the brewery dropdown is positioned correctly relative to its input.

---

## Modified Files

- `apps/beerbook/index.html` — brewery autocomplete dropdown div, venue picker section in rating form
- `apps/beerbook/app.js` — modified `bindBeerAutocomplete()` with OpenFoodFacts fallback, new `bindBreweryAutocomplete()`, new venue picker logic in `captureLocation()`, venue selection handlers
- `apps/beerbook/supabase.js` — new methods: `searchBeersExternal()`, `searchBreweries()`, `searchNearbyVenues()`
- `apps/beerbook/styles.css` — autocomplete group labels, venue picker, venue suggestion cards, venue chip

## Files NOT Modified

- `apps/beerbook-api/server.js` — **read-only, do NOT modify**
- `apps/beerbook/docs/database-schema.sql` — no schema changes
- No new dependencies — all external APIs called via native `fetch()`

---

## Success Criteria

- [ ] Beer autocomplete shows local results first, OpenFoodFacts fallback when <3 local results
- [ ] Local and external results are visually grouped ("From your crew" / "From beer database")
- [ ] OpenFoodFacts failure does not break autocomplete (graceful fallback)
- [ ] Brewery input has working autocomplete from Open Brewery DB
- [ ] Brewery autocomplete failure falls back to plain text input (no regression)
- [ ] After geolocation capture, nearby bars/pubs/restaurants appear as selectable venue suggestions
- [ ] Venue suggestions show name, type icon, distance, and address
- [ ] Selecting a venue sets `venue_id` (existing DAW venue) or stages creation (new venue)
- [ ] "Add a different place" allows manual venue entry
- [ ] Overpass failure does not break the location/rating flow
- [ ] All new UI matches dark theme (var(--dark-*), var(--amber-*))
- [ ] Mobile: all new touch targets ≥ 44px, venue cards are tappable
- [ ] No new npm packages — all via native fetch()

---

## Validation Commands (VPS)

```bash
# After deploying frontend to beerbook.drinksafterwork.net
curl -sI https://beerbook.drinksafterwork.net/ | head -5

# Test OpenFoodFacts API directly
curl -s "https://world.openfoodfacts.org/cgi/search.pl?search_terms=pale+ale&categories_tags_en=beers&json=1&page_size=3&fields=product_name,brands" | jq '.products[].product_name'

# Test Open Brewery DB API directly
curl -s "https://api.openbrewerydb.org/v1/breweries/autocomplete?query=sierra" | jq '.[].name'

# Test Overpass API directly (Philadelphia example)
curl -s -X POST "https://overpass-api.de/api/interpreter" -d 'data=[out:json][timeout:10];node["amenity"~"bar|pub"](around:200,39.9526,-75.1652);out tags;' | jq '.elements[].tags.name'

# In browser: Sign in → Rate a Beer → type "pale ale" in beer name → verify grouped results
# In browser: Type "Sierra" in brewery field → verify dropdown
# In browser: Click "📍 Add Location" → allow geolocation → verify venue suggestions appear
```

## Rollback Steps

- Restore previous versions of `apps/beerbook/index.html`, `app.js`, `supabase.js`, `styles.css` from git
- Redeploy static assets to beerbook host
- No backend or schema rollback needed (no backend changes in this phase)

## Agent Assumption Log

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| | 1 | OpenFoodFacts `categories_tags_en` filter works for beer category | Documented in OFF API |
| | 1 | OFF response includes `products` array with `product_name`, `brands` | Documented in OFF API |
| | 2 | Open Brewery DB autocomplete endpoint returns array of brewery objects | Documented in OBDB API v1 |
| | 3 | Overpass `around:200` radius is sufficient for "bar you're sitting in" | 200m catches most venues without noise |
| | 3 | Overpass `way` elements have `center` when `out center` is used | Documented in Overpass QL |
| | 3 | Venue matching uses existing `GET /api/venues?lat=X&lng=Y&radius=100` | Existing endpoint from Phase 2.1 |