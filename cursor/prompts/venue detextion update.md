CURSOR PROMPT — Venue Type: Migration + OSM Auto-Detect + Picker
=================================================================
Paste everything below into Cursor's chat.
=================================================================

Add a `venue_type` column to the venues table and auto-detect 
venue type from OSM Nominatim reverse geocode data when users 
geotag a rating. The type picker pre-selects based on OSM data 
but the user can always override.

THIS PROMPT HAS 5 TASKS:
1. Database migration
2. DECISIONS.md update  
3. OSM venue type auto-detection
4. Venue type picker on rating form (with pre-selection)
5. API passthrough for venue_type

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 1: Database Migration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create `apps/beerbook/docs/migration-venue-type.sql`:

```sql
-- ============================================
-- Add venue_type to venues (idempotent)
-- Run: docker exec -i supabase-db psql -U postgres -d postgres \
--   < apps/beerbook/docs/migration-venue-type.sql
-- ============================================

ALTER TABLE venues 
    ADD COLUMN IF NOT EXISTS venue_type TEXT 
    CHECK (venue_type IN ('brewery', 'bar', 'restaurant') 
           OR venue_type IS NULL);

CREATE INDEX IF NOT EXISTS idx_venues_type ON venues(venue_type);
```

Also update `apps/beerbook/docs/database-schema.sql` — add the 
`venue_type` column to the venues CREATE TABLE block:

```sql
    venue_type TEXT CHECK (venue_type IN ('brewery', 'bar', 'restaurant') OR venue_type IS NULL),
```

Place it after the `longitude` line, before `created_by`.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 2: Update DECISIONS.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In `cursor/decisions/DECISIONS.md`, find this line in the 
"Beer Price & Happy Hour Decision" section:

```
- **No restaurant/bar category taxonomy.** Venues are just venues. Don't over-engineer venue types.
```

REPLACE it with:

```
- **Simple venue type taxonomy (3 types).** Venues have an optional `venue_type` column: `'brewery'`, `'bar'`, or `'restaurant'` (nullable). Used for color-coded venue type pill badges on Browse rating cards, Map pins/popups, and venue detail sheets. Colors match the Discover map legend: Brewery = #F6AD55 (amber), Bar & Pub = #48BB78 (green), Restaurant = #E87461 (coral). When a user geotags a new rating, the Nominatim reverse geocode response's `class` and `type` fields are used to auto-detect the venue type and pre-select the picker. Users can override or skip. OpenBreweryDB venues are always typed as 'brewery' since that dataset only contains breweries. The field is optional (NULL = no pill shown).
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 3: OSM Venue Type Auto-Detection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The Nominatim reverse geocode response (JSON format) returns 
`class` and `type` fields from OSM tagging. Use these to 
auto-detect the venue type.

Add this helper function to app.js (near the other utility 
methods, or at the top of the geolocation section):

```javascript
/**
 * Detect venue type from Nominatim reverse geocode response.
 * Returns 'brewery', 'bar', 'restaurant', or null if unknown.
 *
 * OSM tagging reference:
 *   class: "amenity" → type: "bar", "pub", "nightclub", 
 *          "restaurant", "cafe", "fast_food", "biergarten"
 *   class: "craft"   → type: "brewery"
 *   class: "industrial" or "amenity" → type: "brewery"
 *
 * The display_name can also contain hints (e.g., "Brewery" in 
 * the name) but we only use class+type for reliability.
 */
detectVenueTypeFromOSM(nominatimData) {
    if (!nominatimData) return null;
    
    const cls = (nominatimData.class || '').toLowerCase();
    const type = (nominatimData.type || '').toLowerCase();
    
    // Bar / Pub types
    if (cls === 'amenity' && ['bar', 'pub', 'nightclub', 'biergarten'].includes(type)) {
        return 'bar';
    }
    
    // Restaurant types
    if (cls === 'amenity' && ['restaurant', 'cafe', 'fast_food'].includes(type)) {
        return 'restaurant';
    }
    
    // Brewery types
    if (type === 'brewery') {
        return 'brewery';
    }
    if (cls === 'craft' && type === 'brewery') {
        return 'brewery';
    }
    
    // Check display_name as a soft hint (only if class/type missed)
    const name = (nominatimData.display_name || '').toLowerCase();
    if (name.includes('brewing') || name.includes('brewery') || name.includes('brewhouse')) {
        return 'brewery';
    }
    if (name.includes(' bar,') || name.includes(' pub,') || name.includes('taproom') || name.includes('tavern') || name.includes('taphouse')) {
        return 'bar';
    }
    if (name.includes('restaurant') || name.includes('grill') || name.includes('bistro') || name.includes('kitchen')) {
        return 'restaurant';
    }
    
    return null; // Unknown — user will need to pick manually
},
```

NOW: Find the geolocation success handler in app.js. Currently 
it calls Nominatim and processes the response. It looks something 
like:

```javascript
const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
    headers: { 'User-Agent': 'BeerBook/1.0' }
});
const data = await resp.json();
const name = data.display_name ? ... : `Location ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
```

After processing the Nominatim response (after setting 
location-name, location-chip, etc.), add:

```javascript
// Auto-detect venue type from OSM data
const detectedType = this.detectVenueTypeFromOSM(data);
if (detectedType) {
    // Pre-select the matching pill button
    document.getElementById('rating-venue-type').value = detectedType;
    document.querySelectorAll('.venue-type-opt').forEach(btn => {
        if (btn.dataset.type === detectedType) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

// Show the type picker (new venue being created)
this.updateVenueTypePicker();
```

This means when someone geotags at a bar, the "Bar & Pub" pill 
automatically highlights. They can tap a different one to 
override, or just leave it.

IMPORTANT: The Nominatim response for the SAME coordinate can 
vary — sometimes it returns the POI (bar, restaurant), sometimes 
the nearest address (house, road). That's why:
1. Auto-detection is best-effort, not guaranteed
2. The picker always shows so the user can correct
3. NULL is acceptable (no pill if they skip it)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 4: Venue Type Picker on Rating Form
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When a user adds a location and no existing venue is matched 
(new venue will be created), show a type picker with the 
existing pill styles. If OSM detected a type (Task 3), it's 
already pre-selected.

ADD to index.html — inside the `.location-group` div, after 
`#location-chip`:

```html
<div id="venue-type-picker" class="venue-type-picker" style="display:none;">
    <p class="venue-type-picker__label">What kind of place?</p>
    <div class="venue-type-picker__options">
        <button type="button" class="venue-type-opt" data-type="brewery">
            <span class="venue-type-pill venue-type-pill--brewery">Brewery</span>
        </button>
        <button type="button" class="venue-type-opt" data-type="bar">
            <span class="venue-type-pill venue-type-pill--bar">Bar & Pub</span>
        </button>
        <button type="button" class="venue-type-opt" data-type="restaurant">
            <span class="venue-type-pill venue-type-pill--restaurant">Restaurant</span>
        </button>
    </div>
</div>
<input type="hidden" id="rating-venue-type" value="">
```

ADD to styles.css:

```css
/* ============ VENUE TYPE PICKER (Rating Form) ============ */
.venue-type-picker {
    margin-top: 8px;
}
.venue-type-picker__label {
    font-size: 12px;
    font-weight: 600;
    color: var(--amber-500, #B0BEC5);
    margin-bottom: 6px;
}
.venue-type-picker__options {
    display: flex;
    gap: 8px;
}
.venue-type-opt {
    background: none;
    border: 2px solid transparent;
    border-radius: 9999px;
    padding: 2px;
    cursor: pointer;
    transition: border-color 0.2s, transform 0.15s;
}
.venue-type-opt:hover {
    transform: scale(1.05);
}
.venue-type-opt.selected {
    border-color: var(--amber-400, #F4B223);
    transform: scale(1.05);
}
```

ADD to app.js — in bindEvents() or a new method called from init:

```javascript
// Venue type picker button selection (user override)
document.querySelectorAll('.venue-type-opt').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.venue-type-opt').forEach(b => 
            b.classList.remove('selected'));
        btn.classList.add('selected');
        document.getElementById('rating-venue-type').value = btn.dataset.type;
    });
});
```

ADD this method to App:

```javascript
updateVenueTypePicker() {
    const picker = document.getElementById('venue-type-picker');
    if (!picker) return;
    const hasLocation = !!document.getElementById('rating-location-name').value;
    const hasVenueId = !!document.getElementById('rating-venue-id').value;
    // Show ONLY when creating a new venue (location set, no existing venue)
    picker.style.display = (hasLocation && !hasVenueId) ? 'block' : 'none';
},
```

Call `this.updateVenueTypePicker()` in these places:
1. After geolocation success (after the OSM auto-detect code 
   from Task 3)
2. After manual location input blur/change
3. After location autocomplete selection
4. Inside `clearLocation()` — also reset state:
   ```javascript
   document.getElementById('rating-venue-type').value = '';
   document.querySelectorAll('.venue-type-opt').forEach(b => 
       b.classList.remove('selected'));
   ```

DO NOT show picker when `rateFromVenue()` is called from map.js 
— that sets venue_id (existing venue), so `updateVenueTypePicker` 
will correctly hide it.

ADD to form reset (after successful submit / `resetRatingForm`):

```javascript
document.getElementById('rating-venue-type').value = '';
document.querySelectorAll('.venue-type-opt').forEach(b => 
    b.classList.remove('selected'));
const picker = document.getElementById('venue-type-picker');
if (picker) picker.style.display = 'none';
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 5: Pass venue_type Through API on Venue Creation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In app.js, find the rating form submit handler where 
`DB.createVenue()` is called. Currently something like:

```javascript
const venue = await DB.createVenue({ 
    name: locationName, 
    latitude: lat, 
    longitude: lng 
});
```

Change to:

```javascript
const venueType = document.getElementById('rating-venue-type').value || null;
const venue = await DB.createVenue({ 
    name: locationName, 
    latitude: lat, 
    longitude: lng,
    venue_type: venueType
});
```

In supabase.js, find the createVenue method and ensure it 
includes venue_type in the payload:

```javascript
async createVenue(data) {
    const body = {
        name: data.name,
        latitude: data.latitude,
        longitude: data.longitude,
        venue_type: data.venue_type || null,
        created_by: this.currentUser?.id || 'demo'
    };
    // ... POST to /api/venues (rest of method unchanged)
}
```

PostgREST picks up the new column automatically after migration.
No server.js changes needed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```bash
# Run migration
docker exec -i supabase-db psql -U postgres -d postgres \
  < apps/beerbook/docs/migration-venue-type.sql

# Verify column
docker exec supabase-db psql -U postgres -d postgres \
  -c "\d venues"

# Check distribution (should be mostly NULL initially)
docker exec supabase-db psql -U postgres -d postgres \
  -c "SELECT venue_type, COUNT(*) FROM venues GROUP BY venue_type;"

# Verify DECISIONS.md updated
grep -c "Simple venue type taxonomy" cursor/decisions/DECISIONS.md
```

UI test scenarios:

1. GEOTAG AT A KNOWN BAR:
   - Rate view → click "Add Location" while at/near a bar
   - Nominatim returns class=amenity, type=bar
   - Verify: "Bar & Pub" pill auto-selects with gold border
   - Submit → new venue has venue_type = 'bar'

2. GEOTAG AT A RESIDENTIAL ADDRESS:
   - Rate view → click "Add Location" in a neighborhood
   - Nominatim returns class=place, type=house
   - Verify: picker shows, but NO pill pre-selected
   - User manually taps "Restaurant" → gold border appears
   - Submit → new venue has venue_type = 'restaurant'

3. GEOTAG AT A BREWERY:
   - Nominatim returns class=craft, type=brewery (or name 
     contains "Brewing")
   - Verify: "Brewery" pill auto-selects
   - User can override by tapping "Bar & Pub" instead

4. RATE FROM MAP (existing venue):
   - Click pin → "Rate a beer from here" → navigates to Rate
   - Verify: location pre-filled, type picker NOT shown
   - (existing venue already has type from OpenBreweryDB)

5. SKIP TYPE:
   - Add location → picker shows → don't tap any pill
   - Submit → venue created with venue_type = NULL
   - Browse card shows venue name but no pill (graceful)

6. CLEAR AND RE-ADD:
   - Add location → auto-selects "Bar"
   - Clear location (✕ on chip)
   - Verify: picker hides, selection cleared
   - Re-add different location → fresh detection

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROLLBACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Schema is additive only. To revert:
```sql
ALTER TABLE venues DROP COLUMN IF EXISTS venue_type;
DROP INDEX IF EXISTS idx_venues_type;
```

Frontend gracefully handles NULL venue_type (no pill shown).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. DO NOT duplicate the .venue-type-pill CSS classes or the 
   venueTypePill()/venueTypeMeta() helpers — they already exist 
   in styles.css and map.js from a previous implementation.

2. The detectVenueTypeFromOSM() function uses both class+type 
   (reliable) and display_name (soft fallback). Class+type won't 
   always match — Nominatim returns the NEAREST OSM object, which 
   may be a house or road, not the POI you're standing in. That's 
   why the picker always shows for user confirmation.

3. The display_name checks use patterns like ' bar,' (with 
   trailing comma) to avoid false positives on street names like 
   "Barlow Street". The comma indicates it's a POI name in the 
   Nominatim display_name format: "Bar Name, Street, City, ..."

4. The three DB values are lowercase: 'brewery', 'bar', 
   'restaurant'. The frontend maps to display labels:
   - 'brewery' → "Brewery" → #F6AD55 (amber)
   - 'bar' → "Bar & Pub" → #48BB78 (green)
   - 'restaurant' → "Restaurant" → #E87461 (coral)

5. OpenBreweryDB venues on the map already have types handled 
   client-side by venueTypeMeta() in map.js. This prompt only 
   affects USER-CREATED venues from the rating form.

6. Run the migration BEFORE deploying the frontend changes. 
   PostgREST needs to see the column before createVenue() can 
   include it. The frontend will degrade gracefully if the 
   column doesn't exist yet (venue_type just won't be saved).

7. DO NOT modify server.js — the API routes pass through to 
   PostgREST which auto-discovers schema changes.
