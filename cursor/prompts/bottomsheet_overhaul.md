# BeerBook — Bottom Sheet Cleanup: Single Sheet, Layer Awareness, Empty States, Collapsed UX

## Context Files (read ALL before writing code)
- `apps/beerbook/map.js` — map view logic, `getAllVenues()`, `showVenueDetail()`, layer toggling
- `apps/beerbook/bottomSheet.js` — the `bb-sheet` bottom sheet controller
- `apps/beerbook/index.html` — contains both `bb-sheet-root` AND legacy `brewery-bottom-sheet`
- `apps/beerbook/styles.css` — contains styles for both sheet systems

---

## Overview

Five changes in one pass:

1. **Remove the legacy `brewery-bottom-sheet`** entirely (DOM, CSS, JS)
2. **Make `getAllVenues()` layer-aware** — Discover vs My Map show different data
3. **Never show "Unknown Venue"** — skip unnamed entries, show fun empty states
4. **Improve collapsed sheet UX** — show header text + chevron affordance at minimum
5. **Update sheet headers per mode** — different copy for Discover vs My Map

---

## Change 1: Remove Legacy Bottom Sheet

The old `brewery-bottom-sheet` is dead code. The new `bb-sheet` handles all detail views. Remove every trace.

### HTML (`index.html`)

Delete this entire block:
```html
<div id="brewery-bottom-sheet" class="brewery-bottom-sheet" aria-hidden="true">
    <div class="brewery-bottom-sheet-backdrop"></div>
    <div class="brewery-bottom-sheet-panel">
        <div class="brewery-bottom-sheet-drag"></div>
        <div id="brewery-bottom-sheet-body" class="brewery-bottom-sheet-body"></div>
    </div>
</div>
```

### CSS (`styles.css`)

Delete ALL styles related to the legacy sheet. Search for and remove any rules targeting:
- `.brewery-bottom-sheet`
- `.brewery-bottom-sheet-backdrop`
- `.brewery-bottom-sheet-panel`
- `.brewery-bottom-sheet-drag`
- `.brewery-bottom-sheet-body`
- `.brewery-bottom-sheet.open`
- `.brewery-sheet-loading`

### JS (`map.js`)

Remove these methods entirely:
- `showBreweryBottomSheet(breweryId)` — the full method
- `closeBrewerySheet()` — the full method

Remove from `bindEvents()`:
```javascript
// DELETE this line:
document.querySelector('.brewery-bottom-sheet-backdrop')?.addEventListener('click', () => this.closeBrewerySheet());
```

Update `openBreweryDetail()` — it currently branches between bottom sheet and popup. Since the legacy sheet is gone, all mobile detail should go through `bb-sheet`. Update to:

```javascript
openBreweryDetail(breweryId, useBottomSheet) {
    if (useBottomSheet && this._bottomSheet) {
        // Use the new bb-sheet system
        this.showVenueDetail(breweryId, 'beerbook');
    } else {
        this.fetchAndShowBreweryPopup(breweryId);
    }
},
```

---

## Change 2: Layer-Aware `getAllVenues()`

`getAllVenues()` currently mixes brewery DB data and ratings data regardless of which layer is active. Fix it to branch on `this.currentLayer`.

```javascript
getAllVenues() {
    let allVenues = [];

    if (this.currentLayer === 'discover') {
        // === DISCOVER MODE: Breweries + OSM venues only ===
        // NO ratings data, NO mapData

        (this.breweryData || []).forEach((b) => {
            if (b.latitude == null || b.longitude == null) return;
            if (!b.name || !b.name.trim()) return; // skip unnamed
            const category = this.getVenueCategory(b.brewery_type);
            allVenues.push({
                id: b.id,
                name: b.name.trim(),
                type: b.brewery_type || 'micro',
                lat: b.latitude,
                lng: b.longitude,
                source: 'beerbook',
                city: b.city,
                state: b.state
            });
        });

        (this._osmVenues || []).forEach((v) => {
            if (!v.name || !v.name.trim()) return; // skip unnamed
            allVenues.push({
                id: 'osm_' + v.id,
                name: v.name.trim(),
                type: v.type || 'bar',
                lat: v.lat,
                lng: v.lng,
                source: 'osm',
                city: null,
                state: null
            });
        });

    } else if (this.currentLayer === 'mymap') {
        // === MY MAP MODE: Venues from user + crew ratings ===
        // Only include ratings that have a named venue

        const venues = this.venuesFromRatings();
        venues.forEach((v) => {
            if (!v.name || !v.name.trim() || v.name === 'Unknown') return; // skip unnamed
            allVenues.push({
                id: v.id || `pin_${v.latitude}_${v.longitude}`,
                name: v.name.trim(),
                type: 'rated', // generic type for rated venues
                lat: v.latitude,
                lng: v.longitude,
                source: 'rating',
                avgRating: v.avgRating,
                count: v.count,
                topBeer: v.topBeer
            });
        });
    }

    // Deduplicate by id
    const seen = new Set();
    allVenues = allVenues.filter(v => {
        const key = String(v.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Calculate distance if user location known
    if (this._userLat != null && this._userLng != null) {
        allVenues.forEach(v => {
            v.distance = this._haversine(this._userLat, this._userLng, v.lat, v.lng);
        });
        allVenues.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
    } else {
        allVenues.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    return allVenues;
},
```

### Refresh sheet on layer toggle

In `setLayer()`, after changing `this.currentLayer` and updating visibility, refresh the bottom sheet:

```javascript
setLayer(layer) {
    this.currentLayer = layer;
    // ... existing toggle button updates ...
    this.updateLayerVisibility();

    // Refresh the bottom sheet for the new layer
    if (this._bottomSheet) {
        this._bottomSheet.refresh(); // or however bb-sheet reloads its list
    }
    // If bb-sheet doesn't have a refresh method, call whatever method
    // rebuilds the venue list from getAllVenues()
},
```

---

## Change 3: Empty States (No "Unknown Venue" Ever)

When the filtered venue list is empty but there ARE pins on the map, show a contextual empty state in the sheet. When there are truly zero pins and zero venues, show a different message.

### Discover Mode Empty States

In the sheet renderer (likely in `bottomSheet.js`), when the venue list is empty:

```javascript
// If no venues to show in Discover mode
if (allVenues.length === 0) {
    listEl.innerHTML = `
        <div class="venue-sheet-empty">
            <p class="venue-sheet-empty-text">No breweries or bars mapped here yet</p>
            <p class="venue-sheet-empty-sub">Know a spot? Rate a beer there to put it on the map 🍺</p>
        </div>
    `;
    return;
}
```

### My Map Mode Empty States

Two scenarios:

**A) There are pins on the map (geotagged ratings exist) but all are unnamed:**
```javascript
// Pins exist but no named venues
if (allVenues.length === 0 && hasMapPins) {
    listEl.innerHTML = `
        <div class="venue-sheet-empty">
            <p class="venue-sheet-empty-text">Beers rated around here, but no venues tagged</p>
            <p class="venue-sheet-empty-sub">Someone's drinking at home 🏠</p>
        </div>
    `;
    return;
}
```

**B) No pins at all in viewport:**
```javascript
if (allVenues.length === 0 && !hasMapPins) {
    listEl.innerHTML = `
        <div class="venue-sheet-empty">
            <p class="venue-sheet-empty-text">No ratings in this area yet</p>
            <p class="venue-sheet-empty-sub">Be the first — grab a beer and rate it here 🍻</p>
        </div>
    `;
    return;
}
```

### Detecting "hasMapPins"

To know if there are pins on the map even though the venue list is empty, check:
- Discover: `this.breweryData.length > 0` (shouldn't happen since those have names, but just in case)
- My Map: `this.mapData.length > 0` (geotagged ratings exist but may be unnamed)

Pass this info through to the sheet, or let `getAllVenues()` return a metadata object:
```javascript
return { venues: allVenues, hasPinsOnMap: (this.currentLayer === 'mymap' && this.mapData.length > 0) };
```

### Empty State CSS

```css
.venue-sheet-empty {
    text-align: center;
    padding: 20px 16px;
}
.venue-sheet-empty-text {
    color: var(--foam-cream, #f5f0e1);
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0 0 6px;
}
.venue-sheet-empty-sub {
    color: var(--amber-600, #b07d3a);
    font-size: 0.82rem;
    margin: 0;
}
```

---

## Change 4: Improved Collapsed Sheet UX

The collapsed sheet currently shows too little — just a thin drag handle bar that users don't recognize as interactive. Fix the collapsed state to always show:

1. Drag handle bar (existing)
2. Chevron arrow pointing up (indicating "pull up")
3. Header text ("X Venues Nearby" or "X Places Your Crew Rated")

### HTML Structure Update

Update the sheet header area inside `bb-sheet` (the section above the scrollable list):

```html
<div class="bb-sheet-header">
    <div class="bb-sheet-handle">
        <span class="bb-sheet-handle-bar"></span>
    </div>
    <div class="bb-sheet-chevron" id="bb-sheet-chevron">
        <span class="bb-sheet-chevron-icon">︿</span>
    </div>
    <div class="bb-sheet-title-row">
        <h3 id="bb-sheet-title" class="bb-sheet-title">Venues Nearby</h3>
    </div>
</div>
```

The chevron flips when expanded:
- Collapsed: `︿` (up arrow — "pull me up")
- Expanded: `﹀` (down arrow — "pull me down")

### CSS

```css
.bb-sheet-header {
    flex-shrink: 0;
    cursor: grab;
    padding: 0 16px;
    user-select: none;
    -webkit-user-select: none;
}

.bb-sheet-handle {
    display: flex;
    justify-content: center;
    padding: 10px 0 2px;
}
.bb-sheet-handle-bar {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--dark-500, #555);
}

.bb-sheet-chevron {
    display: flex;
    justify-content: center;
    padding: 2px 0;
}
.bb-sheet-chevron-icon {
    font-size: 0.9rem;
    color: var(--amber-500, #b07d3a);
    transition: transform 0.3s ease;
    line-height: 1;
}

/* Flip chevron when sheet is expanded */
.bb-sheet-root[data-state="MAX"] .bb-sheet-chevron-icon,
.bb-sheet-root[data-state="MID"] .bb-sheet-chevron-icon {
    transform: rotate(180deg);
}

.bb-sheet-title {
    font-size: 1rem;
    color: var(--amber-200, #F6AD55);
    margin: 4px 0 8px;
    font-weight: 700;
}
```

### Minimum Collapsed Height

The collapsed state (MIN) needs enough height to show the handle + chevron + title. Set the MIN height to at least **80px**:

In `bottomSheet.js` or wherever the sheet states are defined, ensure:

```javascript
const SHEET_STATES = {
    MIN: 80,    // handle + chevron + title visible
    MID: '50vh',
    MAX: '85vh'
};
```

Or in CSS if heights are controlled there:
```css
.bb-sheet-root[data-state="MIN"] .bb-sheet {
    height: 80px;
    /* or max-height: 80px; depending on implementation */
}
```

### Chevron Toggle in JS

When the sheet state changes, the chevron flips automatically via the CSS selector `.bb-sheet-root[data-state="MAX"]`. No extra JS needed if the `data-state` attribute is already being set on `.bb-sheet-root`.

If clicking the header/chevron should toggle the sheet:

```javascript
// In bottomSheet.js init or wherever events are bound:
document.querySelector('.bb-sheet-header')?.addEventListener('click', () => {
    const root = document.getElementById('bb-sheet-root');
    if (!root) return;
    const current = root.dataset.state;
    if (current === 'MIN') {
        this.setState('MID'); // or however the sheet expands
    } else {
        this.setState('MIN'); // collapse back
    }
});
```

---

## Change 5: Dynamic Sheet Headers Per Mode

The sheet title should update based on the current layer and venue count.

### In `getAllVenues()` or wherever the sheet list is populated:

**Discover mode:**
```javascript
const title = document.getElementById('bb-sheet-title');
if (title) {
    if (allVenues.length === 0) {
        title.textContent = 'Discover Venues';
    } else {
        title.textContent = `${allVenues.length} Venue${allVenues.length !== 1 ? 's' : ''} Nearby`;
    }
}
```

**My Map mode:**
```javascript
const title = document.getElementById('bb-sheet-title');
if (title) {
    if (allVenues.length === 0) {
        title.textContent = 'Your Beer Map';
    } else {
        title.textContent = `${allVenues.length} Place${allVenues.length !== 1 ? 's' : ''} You & Your Crew Rated`;
    }
}
```

Update the title every time the venue list refreshes AND when the layer toggles.

---

## Change 6: My Map Card Rendering

My Map cards should show different info than Discover cards. Discover shows venue type + location. My Map shows rating info:

**Discover card:**
```
┃ Fine Creek Brewing Company
┃ Brewery · Powhatan · Virginia          2.3 mi
```

**My Map card:**
```
┃ The Veil Brewing Co.
┃ ⭐ 4.2 avg · 3 beers rated             1.1 mi
```

In the card renderer, branch on the venue source:

```javascript
_renderCard(venue) {
    const category = this.getVenueCategory(venue.type);
    const { color, label } = this.getVenuePinStyle(category);
    const distText = venue.distance != null ? this._formatDist(venue.distance) : '';

    let meta = '';
    if (venue.source === 'rating') {
        // My Map mode — show rating info
        const avg = venue.avgRating != null ? `⭐ ${venue.avgRating.toFixed(1)} avg` : '';
        const count = venue.count ? `${venue.count} beer${venue.count !== 1 ? 's' : ''} rated` : '';
        meta = [avg, count].filter(Boolean).join(' · ');
    } else {
        // Discover mode — show venue type + location
        meta = [label, venue.city, venue.state].filter(Boolean).join(' · ');
    }

    // For My Map cards, use a neutral border color since they don't have venue categories
    const borderColor = venue.source === 'rating' ? 'var(--amber-500, #F6AD55)' : color;

    return `
        <div class="venue-list-card" data-venue-id="${venue.id}" data-lat="${venue.lat}" data-lng="${venue.lng}" data-source="${venue.source}" style="border-left: 3px solid ${borderColor}">
            <div class="venue-list-card-info">
                <div class="venue-list-card-name">${Utils.escapeHtml(venue.name)}</div>
                <div class="venue-list-card-meta">${Utils.escapeHtml(meta)}</div>
            </div>
            ${distText ? `<div class="venue-list-card-distance">${distText}</div>` : ''}
        </div>
    `;
}
```

---

## Cleanup Checklist

After implementing, verify:
- [ ] `brewery-bottom-sheet` fully removed from HTML
- [ ] All `.brewery-bottom-sheet*` CSS rules removed
- [ ] `showBreweryBottomSheet()` and `closeBrewerySheet()` removed from map.js
- [ ] Backdrop click listener for legacy sheet removed from `bindEvents()`
- [ ] `getAllVenues()` returns ONLY brewery+OSM data in Discover mode
- [ ] `getAllVenues()` returns ONLY named rated venues in My Map mode
- [ ] "Unknown Venue" never appears anywhere in the UI
- [ ] Empty states render correctly for both modes
- [ ] Collapsed sheet shows handle + chevron + title (minimum ~80px)
- [ ] Chevron flips on expand/collapse
- [ ] Sheet refreshes when toggling between Discover and My Map
- [ ] Layer toggle still works correctly for pins (existing behavior)

---

## Constraints
- Vanilla JS only
- Do NOT change the Leaflet map, tile layer, or clustering
- Do NOT change the Near Me geolocation logic
- Do NOT change the Overpass/OSM integration
- Keep `bb-sheet` as the single sheet system — do not create a third one
- The `bb-sheet` detail view (when tapping a specific venue) should still work as-is
- My Map pins for unnamed geotagged ratings should still appear on the map — just not in the sheet list
