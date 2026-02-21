# BeerBook — Map Upgrade: Near Me Button, Venue List Bottom Sheet, OSM Overpass Integration

## Context Files (read ALL before writing code)
- `apps/beerbook/map.js` — current map view (Leaflet + clustering)
- `apps/beerbook/index.html` — HTML structure for map view
- `apps/beerbook/styles.css` — current styles
- `apps/beerbook-api/server.js` — API routes
- `apps/beerbook-api/routes/breweries.js` — breweries API route (if exists)

---

## Overview

Three changes to the Discover tab of the Beer Map:

1. **"Near Me" floating button** on the map that geolocates the user and re-centers
2. **Persistent venue list bottom sheet** showing all venues visible on the map — appears by default, not just on pin tap
3. **OSM Overpass API integration** to supplement brewery data with bars, pubs, and restaurants that serve beer

---

## Change 1: "Near Me" Floating Button

Add a floating button inside the Leaflet map container (bottom-right, above attribution) that triggers geolocation.

### HTML (inside the `#beer-map` container area, or positioned absolutely over it)
```html
<button id="map-nearme-btn" class="map-nearme-btn" title="Near Me" aria-label="Find venues near me">
  📍 Near Me
</button>
```

### CSS
```css
.map-nearme-btn {
  position: absolute;
  bottom: 40px;
  right: 12px;
  z-index: 1000;
  background: var(--amber-500, #F6AD55);
  color: var(--dark-900, #1a1a2e);
  border: 2px solid var(--amber-400, #ED8936);
  border-radius: 24px;
  padding: 8px 16px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  transition: transform 0.15s, background 0.15s;
}
.map-nearme-btn:hover {
  transform: scale(1.05);
  background: var(--amber-400, #ED8936);
}
.map-nearme-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
```

### JS (in `MapView.bindEvents()`)
```javascript
document.getElementById('map-nearme-btn')?.addEventListener('click', () => this.nearMeLocate());
```

### JS (new method on MapView)
```javascript
nearMeLocate() {
    if (!navigator.geolocation) {
        App.toast('Geolocation not supported', 'error');
        return;
    }
    const btn = document.getElementById('map-nearme-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Locating…'; }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            this._userLat = lat;
            this._userLng = lng;
            this.map.setView([lat, lng], 13);

            // Drop/update user location marker
            if (this.userMarker) this.map.removeLayer(this.userMarker);
            this.userMarker = L.circleMarker([lat, lng], {
                radius: 10, fillColor: '#42a5f5', color: '#fff',
                weight: 2, fillOpacity: 0.9
            }).addTo(this.map).bindPopup('You are here');

            // Trigger viewport reload which will also update the bottom sheet
            if (this.currentLayer === 'discover') {
                this.loadBreweriesInViewport();
            }
            // Also trigger OSM load for bars/pubs/restaurants
            this.loadOSMVenuesInViewport();

            if (btn) { btn.disabled = false; btn.textContent = '📍 Near Me'; }
        },
        () => {
            App.toast('Enable location to find nearby venues', 'info');
            if (btn) { btn.disabled = false; btn.textContent = '📍 Near Me'; }
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
},
```

**Position the button:** The button should be positioned absolutely within the `#view-map` container (which wraps the map), NOT inside the Leaflet map div itself — otherwise Leaflet may interfere. Use `position: relative` on the map wrapper and `position: absolute` on the button.

---

## Change 2: Persistent Venue List Bottom Sheet

Currently the bottom sheet only appears when tapping a single pin. Replace this with a **persistent, draggable bottom sheet** that shows all visible venues sorted by distance (if user location known) or alphabetically.

### States
1. **Collapsed (default):** Shows drag handle + "X Venues Near You" header, ~30% of screen height
2. **Expanded:** User drags up, list fills ~70% of screen, map shrinks above
3. **Single venue detail:** When user taps a pin OR a list item, sheet shows that venue's detail (existing behavior). Back button returns to list.

### HTML Structure
Replace or augment the existing `#brewery-bottom-sheet` with:

```html
<div id="venue-list-sheet" class="venue-list-sheet collapsed" aria-hidden="false">
  <div class="venue-sheet-handle" id="venue-sheet-handle">
    <span class="venue-sheet-handle-bar"></span>
  </div>
  <div class="venue-sheet-header" id="venue-sheet-header">
    <h3 id="venue-sheet-title">Venues Near You</h3>
    <p id="venue-sheet-subtitle" class="venue-sheet-subtitle">Based on current map view</p>
  </div>
  <div class="venue-sheet-list" id="venue-sheet-list">
    <!-- Dynamically populated venue cards -->
  </div>
  <!-- Single venue detail (hidden by default, shown when a venue is selected) -->
  <div class="venue-sheet-detail" id="venue-sheet-detail" style="display:none;">
    <button class="venue-sheet-back" id="venue-sheet-back">← Back to list</button>
    <div id="venue-sheet-detail-body"></div>
  </div>
</div>
```

### CSS
```css
.venue-list-sheet {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1001;
  background: var(--dark-850, #141428);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
  transition: max-height 0.3s ease;
  max-height: 35vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.venue-list-sheet.expanded {
  max-height: 70vh;
}
.venue-list-sheet.hidden {
  max-height: 0;
  overflow: hidden;
}

.venue-sheet-handle {
  display: flex;
  justify-content: center;
  padding: 10px 0 4px;
  cursor: grab;
}
.venue-sheet-handle-bar {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--dark-500, #555);
}

.venue-sheet-header {
  padding: 0 16px 8px;
}
.venue-sheet-header h3 {
  font-size: 1.1rem;
  color: var(--amber-200, #F6AD55);
  margin: 0;
}
.venue-sheet-subtitle {
  font-size: 0.8rem;
  color: var(--amber-600, #b07d3a);
  margin: 4px 0 0;
}

.venue-sheet-list {
  overflow-y: auto;
  flex: 1;
  padding: 0 12px 12px;
  -webkit-overflow-scrolling: touch;
}

/* Individual venue card in the list */
.venue-list-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--dark-800, #1e1e3a);
  border: 1px solid var(--dark-600, #333);
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.venue-list-card:hover, .venue-list-card:active {
  background: var(--dark-700, #2a2a4a);
}

.venue-list-card-icon {
  font-size: 1.5rem;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--dark-700, #2a2a4a);
  flex-shrink: 0;
}

.venue-list-card-info {
  flex: 1;
  min-width: 0;
}
.venue-list-card-name {
  font-weight: 700;
  color: var(--foam-cream, #f5f0e1);
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.venue-list-card-meta {
  font-size: 0.8rem;
  color: var(--amber-500, #b07d3a);
  margin-top: 2px;
}

.venue-list-card-distance {
  font-weight: 700;
  color: var(--amber-300, #F6AD55);
  font-size: 0.9rem;
  flex-shrink: 0;
  text-align: right;
}

.venue-sheet-back {
  background: none;
  border: none;
  color: var(--amber-400, #ED8936);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 8px 0;
  margin-bottom: 8px;
}
```

### JS — Drag Handle Logic
```javascript
// In MapView, add this to bindEvents():
this._initSheetDrag();

// New method:
_initSheetDrag() {
    const handle = document.getElementById('venue-sheet-handle');
    const sheet = document.getElementById('venue-list-sheet');
    if (!handle || !sheet) return;

    handle.addEventListener('click', () => {
        sheet.classList.toggle('expanded');
    });

    // Optional: touch drag for smoother UX
    let startY = 0;
    handle.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
    }, { passive: true });
    handle.addEventListener('touchend', (e) => {
        const endY = e.changedTouches[0].clientY;
        const diff = startY - endY;
        if (diff > 30) sheet.classList.add('expanded');
        else if (diff < -30) sheet.classList.remove('expanded');
    }, { passive: true });
},
```

### JS — Populating the Venue List

After `loadBreweriesInViewport()` and `loadOSMVenuesInViewport()` complete, call a new method `updateVenueListSheet()`:

```javascript
updateVenueListSheet() {
    const listEl = document.getElementById('venue-sheet-list');
    const titleEl = document.getElementById('venue-sheet-title');
    const subtitleEl = document.getElementById('venue-sheet-subtitle');
    const sheet = document.getElementById('venue-list-sheet');
    if (!listEl || !sheet) return;

    // Combine brewery data + OSM data
    let allVenues = [];

    // From breweries (existing DB data)
    (this.breweryData || []).forEach(b => {
        if (b.latitude == null || b.longitude == null) return;
        const category = this.getBreweryCategory(b.brewery_type);
        if (!this.isBreweryTypeVisible(category)) return;
        allVenues.push({
            id: b.id,
            name: b.name,
            type: b.brewery_type || 'brewery',
            category: category,
            lat: b.latitude,
            lng: b.longitude,
            source: 'beerbook',
            phone: b.phone,
            city: b.city,
            state: b.state
        });
    });

    // From OSM data
    (this._osmVenues || []).forEach(v => {
        allVenues.push({
            id: 'osm_' + v.id,
            name: v.name,
            type: v.type,
            category: v.category,
            lat: v.lat,
            lng: v.lng,
            source: 'osm',
            phone: v.phone,
            website: v.website
        });
    });

    // Calculate distance if user location known
    if (this._userLat != null && this._userLng != null) {
        allVenues.forEach(v => {
            v.distance = this._haversine(this._userLat, this._userLng, v.lat, v.lng);
        });
        allVenues.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
    } else {
        allVenues.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Filter to active category filters
    const activeFilters = Array.from(document.querySelectorAll('.map-filters .filter-chip.active'))
        .map(c => c.dataset.type);

    if (activeFilters.length > 0) {
        allVenues = allVenues.filter(v => {
            if (activeFilters.includes('brewery') && ['micro','nano','regional','large','contract','proprietor'].includes(v.type)) return true;
            if (activeFilters.includes('brewpub') && v.type === 'brewpub') return true;
            if (activeFilters.includes('bar') && ['bar','taproom','beergarden','pub','restaurant'].includes(v.type)) return true;
            return false;
        });
    }

    // Update header
    const count = allVenues.length;
    if (titleEl) titleEl.textContent = `${count} Venue${count !== 1 ? 's' : ''} Near You`;
    if (subtitleEl) subtitleEl.textContent = this._userLat != null ? 'Sorted by distance' : 'Based on current map view';

    // Render cards (limit to first 50 for performance)
    const display = allVenues.slice(0, 50);
    listEl.innerHTML = display.map(v => {
        const icon = this._venueIcon(v);
        const distText = v.distance != null ? this._formatDist(v.distance) : '';
        const meta = [v.type, v.city, v.state].filter(Boolean).join(' · ');
        const sourceTag = v.source === 'osm' ? '<span class="venue-osm-tag">OSM</span>' : '';
        return `
            <div class="venue-list-card" data-venue-id="${v.id}" data-lat="${v.lat}" data-lng="${v.lng}" data-source="${v.source}">
                <div class="venue-list-card-icon">${icon}</div>
                <div class="venue-list-card-info">
                    <div class="venue-list-card-name">${Utils.escapeHtml(v.name)} ${sourceTag}</div>
                    <div class="venue-list-card-meta">${Utils.escapeHtml(meta)}</div>
                </div>
                ${distText ? `<div class="venue-list-card-distance">${distText}</div>` : ''}
            </div>
        `;
    }).join('');

    // Card click → center map + show detail
    listEl.querySelectorAll('.venue-list-card').forEach(card => {
        card.addEventListener('click', () => {
            const lat = parseFloat(card.dataset.lat);
            const lng = parseFloat(card.dataset.lng);
            const id = card.dataset.venueId;
            const source = card.dataset.source;
            this.map.setView([lat, lng], 15);
            if (source === 'beerbook' && !id.startsWith('osm_')) {
                this.openBreweryDetail(id, true);
            }
            // For OSM venues, just center — no detail sheet yet (future feature)
        });
    });

    // Show the sheet
    sheet.classList.remove('hidden');
    sheet.setAttribute('aria-hidden', 'false');
},

// Helper: haversine distance in miles
_haversine(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
},

_formatDist(miles) {
    if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
    return `${miles.toFixed(1)} mi`;
},

_venueIcon(v) {
    if (v.category === 'bar' || v.type === 'pub' || v.type === 'bar') return '🍺';
    if (v.category === 'brewpub' || v.type === 'brewpub') return '🍽️';
    if (v.type === 'restaurant') return '🍴';
    return '🏭';
},
```

### Wiring It Up

In `loadBreweriesInViewport()`, after `this.renderBreweryPins()`, add:
```javascript
this.updateVenueListSheet();
```

In `toggleBreweryFilter()`, after `this.renderBreweryPins()`, add:
```javascript
this.updateVenueListSheet();
```

---

## Change 3: OSM Overpass API Integration

Query the Overpass API for bars, pubs, and restaurants within the current map viewport. This supplements your brewery database with venue types you don't have.

### New Properties on MapView
```javascript
_osmVenues: [],
_osmLoading: false,
_osmLastBounds: null,
```

### New Method: `loadOSMVenuesInViewport()`
```javascript
async loadOSMVenuesInViewport() {
    if (!this.map || this._osmLoading) return;
    if (this.map.getZoom() < 11) {
        // Don't query OSM at low zoom — too many results
        this._osmVenues = [];
        return;
    }

    const b = this.map.getBounds();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const boundsKey = `${sw.lat.toFixed(3)},${sw.lng.toFixed(3)},${ne.lat.toFixed(3)},${ne.lng.toFixed(3)}`;

    // Skip if bounds haven't changed significantly
    if (this._osmLastBounds === boundsKey) return;

    this._osmLoading = true;
    this._osmLastBounds = boundsKey;

    const bbox = `${sw.lat},${sw.lng},${ne.lat},${ne.lng}`;
    const query = `
        [out:json][timeout:10];
        (
          node["amenity"="bar"](${bbox});
          node["amenity"="pub"](${bbox});
          node["amenity"="restaurant"]["cuisine"~"beer|brewery|gastropub"](${bbox});
          node["microbrewery"="yes"](${bbox});
          node["craft"="brewery"](${bbox});
          way["amenity"="bar"](${bbox});
          way["amenity"="pub"](${bbox});
        );
        out center 200;
    `;

    try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!res.ok) {
            console.warn('OSM Overpass query failed:', res.status);
            this._osmLoading = false;
            return;
        }

        const data = await res.json();
        const elements = data.elements || [];

        this._osmVenues = elements
            .filter(el => el.tags && el.tags.name) // Skip unnamed venues
            .map(el => {
                const lat = el.lat || (el.center && el.center.lat);
                const lng = el.lon || (el.center && el.center.lon);
                if (!lat || !lng) return null;

                const tags = el.tags;
                let type = tags.amenity || 'bar';
                let category = 'bar';
                if (tags.microbrewery === 'yes' || tags.craft === 'brewery') {
                    type = 'brewery';
                    category = 'brewery';
                }
                if (type === 'restaurant') category = 'bar'; // show restaurants under bar filter

                return {
                    id: el.id,
                    name: tags.name,
                    type: type,
                    category: category,
                    lat: lat,
                    lng: lng,
                    phone: tags.phone || tags['contact:phone'] || null,
                    website: tags.website || tags['contact:website'] || null,
                    hours: tags.opening_hours || null
                };
            })
            .filter(Boolean);

        // Deduplicate: if an OSM venue is within ~50m of a brewery in our DB, skip it
        // (likely the same place)
        if (this.breweryData && this.breweryData.length > 0) {
            this._osmVenues = this._osmVenues.filter(osm => {
                return !this.breweryData.some(b => {
                    if (!b.latitude || !b.longitude) return false;
                    const d = this._haversine(osm.lat, osm.lng, b.latitude, b.longitude);
                    return d < 0.03; // ~160 feet / 50 meters
                });
            });
        }

        this.renderOSMPins();
        this.updateVenueListSheet();
    } catch (err) {
        console.warn('OSM Overpass error:', err);
    }

    this._osmLoading = false;
},
```

### Rendering OSM Pins
```javascript
renderOSMPins() {
    // Remove old OSM markers
    if (this._osmCluster) {
        this.map.removeLayer(this._osmCluster);
        this._osmCluster = null;
    }

    if (!this._osmVenues || this._osmVenues.length === 0) return;

    const markers = [];
    this._osmVenues.forEach(v => {
        // Respect active filters
        if (!this.isBreweryTypeVisible(v.category)) return;

        const icon = L.divIcon({
            className: 'osm-venue-pin',
            html: `<span class="osm-pin-circle">${v.type === 'pub' ? '🍺' : v.type === 'restaurant' ? '🍴' : '🍺'}</span>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const m = L.marker([v.lat, v.lng], { icon });
        const meta = [v.type, v.hours].filter(Boolean).join(' · ');
        m.bindPopup(`
            <div class="map-popup map-popup-osm">
                <strong>${Utils.escapeHtml(v.name)}</strong><br>
                <span class="osm-source-badge">via OpenStreetMap</span><br>
                ${Utils.escapeHtml(meta)}<br>
                ${v.phone ? `📞 ${Utils.escapeHtml(v.phone)}<br>` : ''}
                ${v.website ? `<a href="${Utils.escapeHtml(v.website)}" target="_blank" rel="noopener">🌐 Website →</a><br>` : ''}
                <a href="#" class="osm-rate-link" data-venue-name="${Utils.escapeHtml(v.name)}">⭐ Rate a beer from here →</a>
            </div>
        `);

        m.on('popupopen', () => {
            m.getPopup().getElement()?.querySelector('.osm-rate-link')?.addEventListener('click', (e) => {
                e.preventDefault();
                try { sessionStorage.setItem('beerbook_rate_venue_name', v.name); } catch(_) {}
                if (typeof App !== 'undefined' && App.navigate) App.navigate('rate');
            });
        });

        markers.push(m);
    });

    this._osmCluster = L.markerClusterGroup({
        iconCreateFunction: (cluster) => {
            const count = cluster.getChildCount();
            return L.divIcon({
                className: 'osm-cluster',
                html: `<span class="osm-cluster-count">${count}</span>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });
        }
    });

    markers.forEach(m => this._osmCluster.addLayer(m));

    if (this.currentLayer === 'discover') {
        this.map.addLayer(this._osmCluster);
    }
},
```

### CSS for OSM Pins
```css
.osm-venue-pin {
  display: flex;
  align-items: center;
  justify-content: center;
}
.osm-pin-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #48BB78;
  font-size: 14px;
  border: 2px solid rgba(255,255,255,0.3);
}

.osm-cluster {
  display: flex;
  align-items: center;
  justify-content: center;
}
.osm-cluster-count {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #48BB78;
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  border: 2px solid rgba(255,255,255,0.4);
}

.osm-source-badge {
  font-size: 0.7rem;
  color: #48BB78;
  font-style: italic;
}

.venue-osm-tag {
  display: inline-block;
  font-size: 0.6rem;
  background: #48BB78;
  color: #fff;
  border-radius: 4px;
  padding: 1px 4px;
  margin-left: 4px;
  vertical-align: middle;
}
```

### Wiring OSM into the Map Lifecycle

In `_onMapMoveEnd()`, after the existing `loadBreweriesInViewport()` call, add:
```javascript
this.loadOSMVenuesInViewport();
```

In `updateLayerVisibility()`, add handling for `this._osmCluster`:
```javascript
if (this._osmCluster) {
    if (showBreweries) this.map.addLayer(this._osmCluster);
    else this.map.removeLayer(this._osmCluster);
}
```

In `toggleBreweryFilter()`, after `this.renderBreweryPins()`:
```javascript
this.renderOSMPins();
this.updateVenueListSheet();
```

---

## Change 4: Update the Bars Filter Chip

The "Bars" filter chip should now reflect that it covers OSM-sourced bars, pubs, and restaurants too. Update the chip's label if desired:

Current: `🍺 Bars`
Keep as-is — "Bars" is the right umbrella term. The chip's `data-type="bar"` value should match `category === 'bar'` which already covers bars, pubs, taprooms, restaurants from OSM.

---

## Important Notes

1. **Overpass API Rate Limits:** The public Overpass endpoint (`overpass-api.de`) has rate limits. The debounced `moveend` handler (500ms) plus the zoom check (minimum zoom 11) should keep requests reasonable. If you hit limits, consider caching results in `sessionStorage` keyed by bounds.

2. **The bottom sheet should ONLY show in Discover mode**, not My Map mode. In `setLayer()`, when switching to `mymap`, hide the venue list sheet. When switching to `discover`, show it.

3. **Deduplication is critical.** Many breweries in your DB will also appear in OSM. The haversine proximity check (~50m) handles this, but you could also do name-based fuzzy matching for extra safety.

4. **Mobile performance:** Limit the venue list to 50 items max. The OSM query uses `out center 200` to cap at 200 results.

5. **The `#view-map` container** needs `position: relative` so the bottom sheet and Near Me button can be absolutely positioned within it.

6. **Do NOT change** the existing bottom sheet behavior for single-brewery detail. The venue list sheet's detail view can reuse `showBreweryBottomSheet()` for BeerBook-source breweries.

---

## Constraints
- Vanilla JS only (no React, no build tools)
- Keep all existing map functionality intact (My Map, trail, deals sidebar)
- OSM requests are client-side (no new API routes needed for this)
- Use existing CSS variable names from `styles.css` where available
- Mobile-first — bottom sheet must be touch-friendly
- Do NOT remove or break the existing `#brewery-bottom-sheet` — the venue list sheet is a new, separate element
