/* ============================================
   BeerBook — Beer Map (Leaflet)
   Phase 3.9: Brewery pins, clustering, layer toggle
   ============================================ */

function venueTypeMeta(breweryType) {
    if (!breweryType) return null;
    const bt = String(breweryType).toLowerCase();
    if (['micro', 'regional', 'large', 'nano', 'contract'].includes(bt)) {
        return { className: 'venue-type-pill--brewery', label: 'Brewery' };
    }
    if (['brewpub', 'bar'].includes(bt)) {
        return { className: 'venue-type-pill--bar', label: 'Bar & Pub' };
    }
    if (bt === 'restaurant') {
        return { className: 'venue-type-pill--restaurant', label: 'Restaurant' };
    }
    return null;
}

function venueTypePill(breweryType) {
    const meta = venueTypeMeta(breweryType);
    if (!meta) return '';
    return `<span class="venue-type-pill ${meta.className}">${meta.label}</span>`;
}

function rateFromVenue(venueId, venueName, lat, lng) {
    const latEl = document.getElementById('rating-lat');
    const lngEl = document.getElementById('rating-lng');
    const locationNameEl = document.getElementById('rating-location-name');
    const venueIdEl = document.getElementById('rating-venue-id');
    const chipText = document.getElementById('location-chip-text');
    const chip = document.getElementById('location-chip');
    const manual = document.getElementById('location-manual');
    const priceSec = document.getElementById('price-log-section');
    const cleanName = venueName || 'Selected Venue';

    if (latEl) latEl.value = Number.isFinite(Number(lat)) ? String(lat) : '';
    if (lngEl) lngEl.value = Number.isFinite(Number(lng)) ? String(lng) : '';
    if (locationNameEl) locationNameEl.value = cleanName;
    if (venueIdEl) {
        venueIdEl.value = venueId || '';
        venueIdEl.removeAttribute('data-pending-venue');
    }
    if (chipText) chipText.textContent = `📍 ${cleanName}`;
    if (chip) chip.style.display = 'inline-flex';
    if (manual) manual.value = cleanName;
    if (typeof App !== 'undefined' && typeof App.togglePriceSection === 'function') {
        App.togglePriceSection();
    } else if (priceSec) {
        priceSec.style.display = 'block';
    }
    if (typeof App !== 'undefined' && App.navigate) App.navigate('rate');
}

if (typeof window !== 'undefined') {
    window.venueTypePill = venueTypePill;
    window.rateFromVenue = rateFromVenue;
}

const MapView = {
    map: null,
    markersCluster: null,
    orphanMarkersCluster: null,
    venueLayer: null,
    userMarker: null,
    trailLayer: null,
    dealsMarkers: [],
    mapData: [],
    mapVenueData: [],
    styles: [],
    initDone: false,
    trailMarkers: [],
    eventsBound: false,
    breweryCluster: null,
    _osmCluster: null,
    _breweryMarkersById: {},
    _osmMarkersById: {},
    _highlightedMarker: null,
    _highlightTimeout: null,
    breweryData: [],
    _osmVenues: [],
    _osmLoading: false,
    _osmLastBounds: null,
    _osmLastQueryTime: 0,
    _lastBreweryBounds: null,
    _userLat: null,
    _userLng: null,
    currentLayer: 'discover',
    moveEndDebounce: null,
    _bottomSheet: null,
    VENUE_CATEGORIES: {
        brewery: {
            types: ['micro', 'nano', 'regional', 'large', 'contract', 'proprietor', 'brewpub'],
            icon: '🏭',
            color: '#F6AD55',
            label: 'Brewery'
        },
        bar: {
            types: ['bar', 'pub', 'taproom', 'beergarden'],
            icon: '🍺',
            color: '#48BB78',
            label: 'Bar & Pub'
        },
        restaurant: {
            types: ['restaurant'],
            icon: '🍽️',
            color: '#E87461',
            label: 'Restaurant'
        }
    },

    async onShow() {
        const container = document.getElementById('beer-map');
        if (!container) return;
        if (!this.map) {
            this.map = L.map('beer-map').setView([39.5, -98], 4);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO'
            }).addTo(this.map);
            this.map.on('moveend', () => this._onMapMoveEnd());
        }
        if (!this.initDone) {
            this.initDone = true;
            this.bindEvents();
        }
        const viewMap = document.getElementById('view-map');
        if (viewMap) viewMap.classList.toggle('map-mode-mymap', this.currentLayer === 'mymap');
        const nearMeBtn = document.getElementById('map-nearme-btn');
        if (nearMeBtn) nearMeBtn.style.display = this.currentLayer === 'discover' ? 'inline-flex' : 'none';
        await this.loadMap();
        this._ensureBottomSheet();
        if (this.currentLayer === 'discover') {
            this._bottomSheet?.show();
            this._bottomSheet?.snapTo('MIN');
            this._bottomSheet?.updateVenues();
            this.loadBreweriesInViewport();
            this.loadOSMVenuesInViewport();
        } else {
            this._bottomSheet?.clearSelection();
            this._bottomSheet?.hide();
        }
        this.updateLayerVisibility();
        this.map.invalidateSize();
    },

    bindEvents() {
        if (this.eventsBound) return;
        this.eventsBound = true;
        document.getElementById('btn-near-me')?.addEventListener('click', () => this.bestNearMe());
        document.getElementById('btn-my-trail')?.addEventListener('click', () => this.showMyTrail());
        document.getElementById('map-nearme-btn')?.addEventListener('click', () => this.nearMeLocate());
        document.getElementById('map-filter-style')?.addEventListener('change', () => this.applyStyleFilter());
        document.getElementById('beer-map')?.addEventListener('click', (e) => this._onPopupVenueClick(e));
        document.querySelectorAll('.map-toggle-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.setLayer(btn.dataset.layer);
            });
        });
        document.querySelector('.brewery-bottom-sheet-backdrop')?.addEventListener('click', () => this.closeBrewerySheet());
        this._ensureBottomSheet();
        if (DB.currentUser && DB.currentUser.id) {
            const trailBtn = document.getElementById('btn-my-trail');
            if (trailBtn) trailBtn.style.display = 'inline-flex';
        }
    },

    setLayer(layer) {
        this.currentLayer = layer;
        document.querySelectorAll('.map-toggle-btn').forEach((btn) => {
            const active = btn.dataset.layer === layer;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active);
        });
        const viewMap = document.getElementById('view-map');
        if (viewMap) {
            viewMap.classList.toggle('map-mode-mymap', layer === 'mymap');
        }
        const nearMeBtn = document.getElementById('map-nearme-btn');
        if (nearMeBtn) nearMeBtn.style.display = layer === 'discover' ? 'inline-flex' : 'none';
        this.updateLayerVisibility();
        this._ensureBottomSheet();
        if (layer === 'discover') {
            this._bottomSheet?.show();
            this._bottomSheet?.snapTo('MIN');
            if (this.breweryData.length === 0) {
                this.loadBreweriesInViewport();
            } else {
                this._bottomSheet?.updateVenues();
            }
            this.loadOSMVenuesInViewport();
        } else {
            this._bottomSheet?.clearSelection();
            this._bottomSheet?.hide();
        }
    },

    updateLayerVisibility() {
        const showRatings = this.currentLayer === 'mymap';
        const showBreweries = this.currentLayer === 'discover';
        if (this.markersCluster) {
            if (showRatings) this.map.addLayer(this.markersCluster);
            else this.map.removeLayer(this.markersCluster);
        }
        if (this.orphanMarkersCluster) {
            if (showRatings) this.map.addLayer(this.orphanMarkersCluster);
            else this.map.removeLayer(this.orphanMarkersCluster);
        }
        if (this.breweryCluster) {
            if (showBreweries) this.map.addLayer(this.breweryCluster);
            else this.map.removeLayer(this.breweryCluster);
        }
        if (this._osmCluster) {
            if (showBreweries) this.map.addLayer(this._osmCluster);
            else this.map.removeLayer(this._osmCluster);
        }
    },

    toggleBreweryFilter() {
        // No-op: Discover filters were removed for a simplified UI.
    },

    persistFilterState() {
        // No-op: Discover filters were removed for a simplified UI.
    },

    restoreFilterState() {
        // No-op: Discover filters were removed for a simplified UI.
    },

    _ensureBottomSheet() {
        if (this._bottomSheet || typeof window.BottomSheet === 'undefined') return;
        this._bottomSheet = window.BottomSheet.create({
            mountEl: document.getElementById('view-map'),
            getVenues: () => this.getAllVenues(),
            onSelectVenue: ({ id, source, lat, lng }) => {
                this.focusVenueFromList({ id, source, lat, lng, skipDetail: true });
            },
            renderDetail: (venueId, source) => {
                if (source === 'osm') return this.showVenueSheetOSMDetail(venueId);
                return this.showVenueSheetBreweryDetail(venueId);
            }
        });

        const sheetEl = document.getElementById('bb-sheet');
        if (sheetEl && typeof L !== 'undefined' && L.DomEvent) {
            L.DomEvent.disableClickPropagation(sheetEl);
            L.DomEvent.disableScrollPropagation(sheetEl);
        }
    },

    getVenueCategory(venueType) {
        const t = (venueType || '').toLowerCase();
        for (const [cat, { types }] of Object.entries(this.VENUE_CATEGORIES)) {
            if (types.includes(t)) return cat;
        }
        return 'brewery';
    },

    getVenuePinStyle(category) {
        const c = this.VENUE_CATEGORIES[category] || this.VENUE_CATEGORIES.brewery;
        return { icon: c.icon, color: c.color, label: c.label };
    },

    venueTypePill(type) {
        return venueTypePill(type);
    },

    isBreweryTypeVisible() {
        return true;
    },

    _onMapMoveEnd() {
        if (this.moveEndDebounce) clearTimeout(this.moveEndDebounce);
        this.moveEndDebounce = setTimeout(() => {
            this.moveEndDebounce = null;
            if (this.currentLayer === 'discover') {
                console.log('MapView: moveend fired discover');
                this.loadBreweriesInViewport();
                this.loadOSMVenuesInViewport();
            }
        }, 1000);
    },

    async loadBreweriesInViewport() {
        if (!this.map) return;
        const b = this.map.getBounds();
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        const boundsKey = `${sw.lat.toFixed(3)},${sw.lng.toFixed(3)},${ne.lat.toFixed(3)},${ne.lng.toFixed(3)}`;
        if (this._lastBreweryBounds === boundsKey) return;
        this._lastBreweryBounds = boundsKey;
        const bounds = `${sw.lat},${sw.lng},${ne.lat},${ne.lng}`;
        try {
            const res = DB.isDemo ? { data: [] } : await DB.getBreweriesMap(bounds);
            this.breweryData = (res && res.data) ? res.data : [];
            this.renderBreweryPins();
            this.updateVenueListSheet();
        } catch (err) {
            console.error('Breweries map load failed:', err);
        }
    },

    async _queryOverpass(query) {
        const endpoints = [
            'https://overpass-api.de/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter',
            'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
        ];

        for (const url of endpoints) {
            let timeoutId = null;
            try {
                const controller = new AbortController();
                timeoutId = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(url, {
                    method: 'POST',
                    body: 'data=' + encodeURIComponent(query),
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    signal: controller.signal
                });
                if (res.ok) {
                    return await res.json();
                }
                console.warn(`Overpass ${url} returned ${res.status}, trying next...`);
            } catch (err) {
                console.warn(`Overpass ${url} failed:`, err?.message || err);
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        }

        console.warn('All Overpass endpoints failed');
        return { elements: [] };
    },

    createVenueIcon(venueType) {
        const category = this.getVenueCategory(venueType);
        const { icon, color } = this.getVenuePinStyle(category);
        return L.divIcon({
            className: 'venue-pin',
            html: `<span class="venue-pin-circle" style="background-color:${color}">${icon}</span>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
    },

    renderBreweryPins() {
        if (this.breweryCluster) {
            this.map.removeLayer(this.breweryCluster);
            this.breweryCluster = null;
        }
        this._breweryMarkersById = {};
        const markers = [];
        this.breweryData.forEach((b) => {
            const category = this.getVenueCategory(b.brewery_type);
            if (!this.isBreweryTypeVisible(category)) return;
            const lat = b.latitude;
            const lng = b.longitude;
            if (lat == null || lng == null) return;
            const m = L.marker([lat, lng], { icon: this.createVenueIcon(b.brewery_type) });
            m.breweryId = b.id;
            m.brewerySummary = b;
            this._breweryMarkersById[String(b.id)] = m;
            m.on('click', () => {
                this.showVenueDetail(b.id, 'beerbook', { lat: b.latitude, lng: b.longitude });
            });
            const cityState = [b.city, b.state].filter(Boolean).join(', ');
            const typePill = this.venueTypePill(b.brewery_type);
            const locationHtml = cityState ? `<span class="venue-detail__location">${Utils.escapeHtml(cityState)}</span>` : '';
            m.bindPopup(`
                <div class="map-popup map-popup-brewery">
                    <strong>${Utils.escapeHtml(b.name)}</strong><br>
                    <div class="map-popup-type-row">${typePill}${locationHtml}</div>
                    <button type="button" class="btn btn-sm btn-primary map-popup-brewery-detail" data-brewery-id="${b.id}">View details</button>
                    <a href="#" class="brewery-rate-link" data-brewery-id="${Utils.escapeHtml(String(b.id || ''))}" data-venue-name="${Utils.escapeHtml(b.name || '')}" data-lat="${Utils.escapeHtml(String(b.latitude ?? lat))}" data-lng="${Utils.escapeHtml(String(b.longitude ?? lng))}">⭐ Rate a beer from here →</a>
                </div>
            `);
            m.on('popupopen', () => {
                const popupEl = m.getPopup().getElement();
                popupEl?.querySelector('.map-popup-brewery-detail')?.addEventListener('click', () => {
                    this.showVenueDetail(b.id, 'beerbook', { lat: b.latitude, lng: b.longitude });
                });
                popupEl?.querySelector('.brewery-rate-link')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    rateFromVenue(b.id, b.name || 'Selected Venue', b.latitude ?? lat, b.longitude ?? lng);
                });
            });
            markers.push(m);
        });
        this.breweryCluster = L.markerClusterGroup({
            iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount();
                return L.divIcon({
                    className: 'venue-cluster',
                    html: `<span class="venue-cluster-count">${count}</span>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });
            }
        });
        markers.forEach((m) => this.breweryCluster.addLayer(m));
        if (this.currentLayer === 'discover') {
            this.map.addLayer(this.breweryCluster);
        }
    },

    openBreweryDetail(breweryId, useBottomSheet) {
        if (useBottomSheet) {
            this.showBreweryBottomSheet(breweryId);
        } else {
            this.fetchAndShowBreweryPopup(breweryId);
        }
    },

    showVenueDetail(venueId, source = 'beerbook', coords = null) {
        const lat = Number(coords?.lat);
        const lng = Number(coords?.lng);
        this._ensureBottomSheet();

        if (this.currentLayer !== 'discover') {
            if (source === 'beerbook') this.openBreweryDetail(venueId, false);
            return;
        }

        if (this._bottomSheet) {
            this._bottomSheet.selectVenue({
                id: venueId,
                source,
                lat: Number.isFinite(lat) ? lat : undefined,
                lng: Number.isFinite(lng) ? lng : undefined
            });
            return;
        }

        if (source === 'beerbook') this.openBreweryDetail(venueId, false);
    },

    async showVenueSheetBreweryDetail(breweryId) {
        try {
            const b = await DB.getBrewery(breweryId);
            if (!b) {
                return '<p>Brewery not found.</p>';
            }
            return this.buildBreweryDetailHtml(b);
        } catch (_) {
            return '<p>Could not load brewery.</p>';
        }
    },

    async fetchAndShowBreweryPopup(breweryId) {
        try {
            const b = await DB.getBrewery(breweryId);
            if (!b) return;
            const html = this.buildBreweryDetailHtml(b);
            const popup = L.popup().setContent(html);
            const summary = this.breweryData.find((x) => x.id === breweryId);
            if (summary && summary.latitude != null && summary.longitude != null) {
                popup.setLatLng([summary.latitude, summary.longitude]).openOn(this.map);
            }
            this._bindBreweryDetailButtons(popup.getElement(), b);
        } catch (err) {
            console.error('Brewery detail failed:', err);
            if (typeof App !== 'undefined') App.toast('Could not load brewery', 'error');
        }
    },

    buildBreweryDetailHtml(b) {
        const cityState = [b.city, b.state].filter(Boolean).join(', ');
        const typePill = this.venueTypePill(b.brewery_type);
        const locationHtml = cityState ? `<span class="venue-detail__location">${Utils.escapeHtml(cityState)}</span>` : '';
        const websiteUrl = Utils.sanitizeUrl(b.website_url);
        const beers = b.beers || [];
        const beerList = beers.length === 0
            ? '<p>No beers cataloged yet — rate one to be the first!</p>'
            : beers.slice(0, 3).map((beer) =>
                `<li>${Utils.escapeHtml(beer.name)} (${Utils.escapeHtml(beer.style || '')}${beer.abv != null ? ', ' + beer.abv + '%' : ''})</li>`
            ).join('') + (beers.length > 3 ? `<li><a href="#" class="brewery-see-all" data-brewery-id="${b.id}">See all →</a></li>` : '');
        return `
            <div class="map-popup brewery-detail-popup">
                <strong>${Utils.escapeHtml(b.name)}</strong><br>
                <div class="map-popup-type-row">${typePill}${locationHtml}</div>
                ${b.phone ? `📞 ${Utils.escapeHtml(b.phone)}<br>` : ''}
                ${websiteUrl ? `<a href="${Utils.escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer" data-track-type="brewery" data-track-id="${Utils.escapeHtml(b.id || '')}" data-track-name="${Utils.escapeHtml(b.name || 'Unknown Brewery')}" data-track-source="brewery_detail">🌐 Visit Website →</a><br>` : ''}
                <p><strong>Beers in catalog:</strong> ${beers.length}</p>
                <ul>${beerList}</ul>
                <a href="#" class="brewery-rate-link" data-brewery-id="${Utils.escapeHtml(String(b.id || ''))}" data-venue-name="${Utils.escapeHtml(b.name || '')}" data-lat="${Utils.escapeHtml(String(b.latitude ?? ''))}" data-lng="${Utils.escapeHtml(String(b.longitude ?? ''))}">⭐ Rate a beer from here →</a>
            </div>
        `;
    },

    _bindBreweryDetailButtons(container, b) {
        if (!container) return;
        container.querySelector('.brewery-rate-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            const link = e.currentTarget;
            const latFromLink = parseFloat(link?.dataset?.lat || '');
            const lngFromLink = parseFloat(link?.dataset?.lng || '');
            const fallback = (this.breweryData || []).find((x) => String(x.id) === String(b.id));
            const lat = Number.isFinite(latFromLink) ? latFromLink : fallback?.latitude;
            const lng = Number.isFinite(lngFromLink) ? lngFromLink : fallback?.longitude;
            rateFromVenue(b.id, b.name || link?.dataset?.venueName || 'Selected Venue', lat, lng);
        });
    },

    async showBreweryBottomSheet(breweryId) {
        const sheet = document.getElementById('brewery-bottom-sheet');
        const body = document.getElementById('brewery-bottom-sheet-body');
        if (!sheet || !body) return;
        body.innerHTML = '<p class="brewery-sheet-loading">Loading…</p>';
        sheet.setAttribute('aria-hidden', 'false');
        sheet.classList.add('open');
        try {
            const b = await DB.getBrewery(breweryId);
            if (!b) {
                body.innerHTML = '<p>Brewery not found.</p>';
                return;
            }
            const cityState = [b.city, b.state].filter(Boolean).join(', ');
            const beers = b.beers || [];
            const beerList = beers.length === 0
                ? '<p>No beers cataloged yet — rate one to be the first!</p>'
                : '<ul>' + beers.slice(0, 3).map((beer) =>
                    `<li>${Utils.escapeHtml(beer.name)} (${Utils.escapeHtml(beer.style || '')}${beer.abv != null ? ', ' + beer.abv + '%' : ''})</li>`
                ).join('') + (beers.length > 3 ? '<li><a href="#" class="brewery-see-all">See all →</a></li>' : '') + '</ul>';
            const typePill = this.venueTypePill(b.brewery_type);
            const locationHtml = cityState ? `<span class="venue-detail__location">${Utils.escapeHtml(cityState)}</span>` : '';
            const websiteUrl = Utils.sanitizeUrl(b.website_url);
            body.innerHTML = `
                <h3>${Utils.escapeHtml(b.name)}</h3>
                <div class="map-popup-type-row">${typePill}${locationHtml}</div>
                ${b.phone ? `<p>📞 ${Utils.escapeHtml(b.phone)}</p>` : ''}
                ${websiteUrl ? `<p><a href="${Utils.escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer" data-track-type="brewery" data-track-id="${Utils.escapeHtml(b.id || '')}" data-track-name="${Utils.escapeHtml(b.name || 'Unknown Brewery')}" data-track-source="brewery_detail">🌐 Visit Website →</a></p>` : ''}
                <p><strong>Beers in catalog:</strong> ${beers.length}</p>
                ${beerList}
                <p><a href="#" class="brewery-rate-link" data-brewery-id="${Utils.escapeHtml(String(b.id || ''))}" data-venue-name="${Utils.escapeHtml(b.name || '')}" data-lat="${Utils.escapeHtml(String(b.latitude ?? ''))}" data-lng="${Utils.escapeHtml(String(b.longitude ?? ''))}">⭐ Rate a beer from here →</a></p>
            `;
            body.querySelector('.brewery-rate-link')?.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeBrewerySheet();
                const link = e.currentTarget;
                const latFromLink = parseFloat(link?.dataset?.lat || '');
                const lngFromLink = parseFloat(link?.dataset?.lng || '');
                const fallback = (this.breweryData || []).find((x) => String(x.id) === String(b.id));
                const lat = Number.isFinite(latFromLink) ? latFromLink : fallback?.latitude;
                const lng = Number.isFinite(lngFromLink) ? lngFromLink : fallback?.longitude;
                rateFromVenue(b.id, b.name || link?.dataset?.venueName || 'Selected Venue', lat, lng);
            });
        } catch (err) {
            body.innerHTML = '<p>Could not load brewery.</p>';
        }
    },

    closeBrewerySheet() {
        const sheet = document.getElementById('brewery-bottom-sheet');
        if (sheet) {
            sheet.classList.remove('open');
            sheet.setAttribute('aria-hidden', 'true');
        }
    },

    nearMeLocate() {
        if (!navigator.geolocation) {
            if (typeof App !== 'undefined') App.toast('Geolocation not supported', 'error');
            return;
        }
        const btn = document.getElementById('map-nearme-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Locating...';
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                this._userLat = lat;
                this._userLng = lng;
                this.map.setView([lat, lng], 13);
                if (this.userMarker) this.map.removeLayer(this.userMarker);
                this.userMarker = L.circleMarker([lat, lng], {
                    radius: 10,
                    fillColor: '#42a5f5',
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 0.9
                }).addTo(this.map);
                this.userMarker.bindPopup('You are here');
                if (this.currentLayer === 'discover') {
                    this.loadBreweriesInViewport();
                    this.loadOSMVenuesInViewport();
                }
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '📍 Near Me';
                }
            },
            () => {
                if (typeof App !== 'undefined') App.toast('Enable location to find nearby venues', 'info');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '📍 Near Me';
                }
            },
            { enableHighAccuracy: true, timeout: 15000 }
        );
    },

    locateForBreweries() {
        this.nearMeLocate();
    },

    _haversine(lat1, lon1, lat2, lon2) {
        const R = 3959;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    _formatDist(miles) {
        if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
        return `${miles.toFixed(1)} mi`;
    },

    getAllVenues() {
        let allVenues = [];

        (this.breweryData || []).forEach((b) => {
            if (b.latitude == null || b.longitude == null) return;
            const category = this.getVenueCategory(b.brewery_type);
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

        (this._osmVenues || []).forEach((v) => {
            const category = this.getVenueCategory(v.type);
            if (!this.isBreweryTypeVisible(category)) return;
            allVenues.push({
                id: 'osm_' + v.id,
                name: v.name,
                type: v.type,
                category: category,
                lat: v.lat,
                lng: v.lng,
                source: 'osm',
                phone: v.phone,
                website: v.website,
                city: null,
                state: null
            });
        });

        if (this._userLat != null && this._userLng != null) {
            allVenues.forEach((v) => {
                v.distance = this._haversine(this._userLat, this._userLng, v.lat, v.lng);
            });
            allVenues.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
        } else {
            allVenues.sort((a, b) => a.name.localeCompare(b.name));
        }
        return allVenues;
    },

    updateVenueListSheet() {
        if (this.currentLayer !== 'discover') return;
        this._ensureBottomSheet();
        this._bottomSheet?.updateVenues();
    },

    async loadOSMVenuesInViewport() {
        if (!this.map || this._osmLoading) return;
        if (this.currentLayer !== 'discover') return;
        const now = Date.now();
        if (now - this._osmLastQueryTime < 10000) return;
        this._osmLastQueryTime = now;
        if (this.map.getZoom() < 11) {
            this._osmVenues = [];
            this.renderOSMPins();
            this.updateVenueListSheet();
            return;
        }

        const b = this.map.getBounds();
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        const boundsKey = `${sw.lat.toFixed(3)},${sw.lng.toFixed(3)},${ne.lat.toFixed(3)},${ne.lng.toFixed(3)}`;
        if (this._osmLastBounds === boundsKey) return;

        this._osmLoading = true;
        this._osmLastBounds = boundsKey;
        const bbox = `${sw.lat},${sw.lng},${ne.lat},${ne.lng}`;
        const query = `
            [out:json][timeout:5];
            (
              node["amenity"="bar"](${bbox});
              node["amenity"="pub"](${bbox});
              node["amenity"="restaurant"]["cuisine"~"beer|brewery|gastropub"](${bbox});
              node["microbrewery"="yes"](${bbox});
              node["craft"="brewery"](${bbox});
              way["amenity"="bar"](${bbox});
              way["amenity"="pub"](${bbox});
            );
            out center 100;
        `;

        try {
            const data = await this._queryOverpass(query);
            const elements = data.elements || [];

            this._osmVenues = elements
                .filter((el) => el.tags && el.tags.name)
                .map((el) => {
                    const lat = el.lat || (el.center && el.center.lat);
                    const lng = el.lon || (el.center && el.center.lon);
                    if (lat == null || lng == null) return null;
                    const tags = el.tags || {};
                    let type = tags.amenity || 'bar';

                    if (tags.microbrewery === 'yes' || tags.craft === 'brewery') {
                        type = 'micro';
                    } else if (type === 'pub') {
                        type = 'pub';
                    } else if (type === 'bar') {
                        type = 'bar';
                    } else if (type === 'restaurant') {
                        type = 'restaurant';
                    }

                    return {
                        id: el.id,
                        name: tags.name,
                        type,
                        lat,
                        lng,
                        phone: tags.phone || tags['contact:phone'] || null,
                        website: tags.website || tags['contact:website'] || null,
                        hours: tags.opening_hours || null
                    };
                })
                .filter(Boolean);

            if (this.breweryData && this.breweryData.length > 0) {
                this._osmVenues = this._osmVenues.filter((osm) => {
                    return !this.breweryData.some((bItem) => {
                        if (bItem.latitude == null || bItem.longitude == null) return false;
                        const d = this._haversine(osm.lat, osm.lng, bItem.latitude, bItem.longitude);
                        return d < 0.03;
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

    renderOSMPins() {
        if (!this.map) return;
        if (this._osmCluster) {
            this.map.removeLayer(this._osmCluster);
            this._osmCluster = null;
        }
        this._osmMarkersById = {};
        if (!this._osmVenues || this._osmVenues.length === 0) return;

        const markers = [];
        this._osmVenues.forEach((v) => {
            const category = this.getVenueCategory(v.type);
            if (!this.isBreweryTypeVisible(category)) return;
            const icon = this.createVenueIcon(v.type);
            const m = L.marker([v.lat, v.lng], { icon });
            this._osmMarkersById[`osm_${v.id}`] = m;
            const typePill = this.venueTypePill(v.type);
            const hours = v.hours ? `<span class="venue-detail__location">${Utils.escapeHtml(v.hours)}</span>` : '';
            const websiteUrl = Utils.sanitizeUrl(v.website);
            m.bindPopup(`
                <div class="map-popup">
                    <strong>${Utils.escapeHtml(v.name)}</strong><br>
                    <div class="map-popup-type-row">${typePill}${hours}</div>
                    ${v.phone ? `📞 ${Utils.escapeHtml(v.phone)}<br>` : ''}
                    ${websiteUrl ? `<a href="${Utils.escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">🌐 Website →</a><br>` : ''}
                    <button type="button" class="btn btn-sm btn-primary map-popup-osm-detail" data-venue-id="osm_${v.id}">View details</button>
                    <a href="#" class="osm-rate-link" data-venue-id="osm_${Utils.escapeHtml(String(v.id))}" data-venue-name="${Utils.escapeHtml(v.name)}" data-lat="${Utils.escapeHtml(String(v.lat))}" data-lng="${Utils.escapeHtml(String(v.lng))}">⭐ Rate a beer from here →</a>
                </div>
            `);
            m.on('popupopen', () => {
                const popupEl = m.getPopup().getElement();
                popupEl?.querySelector('.map-popup-osm-detail')?.addEventListener('click', () => {
                    this.showVenueDetail(`osm_${v.id}`, 'osm', { lat: v.lat, lng: v.lng });
                });
                popupEl?.querySelector('.osm-rate-link')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    const link = e.currentTarget;
                    const venueId = link?.dataset?.venueId || '';
                    const venueName = link?.dataset?.venueName || v.name || 'Selected Venue';
                    const lat = parseFloat(link?.dataset?.lat || '');
                    const lng = parseFloat(link?.dataset?.lng || '');
                    rateFromVenue(venueId, venueName, lat, lng);
                });
            });
            markers.push(m);
        });

        this._osmCluster = L.markerClusterGroup({
            iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount();
                return L.divIcon({
                    className: 'venue-cluster',
                    html: `<span class="venue-cluster-count">${count}</span>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });
            }
        });
        markers.forEach((m) => this._osmCluster.addLayer(m));

        if (this.currentLayer === 'discover') {
            this.map.addLayer(this._osmCluster);
        }
    },

    focusVenueFromList({ id, source, lat, lng, skipDetail = false }) {
        const map = this.map || this._map;
        if (!map) return;

        const marker = source === 'beerbook'
            ? this._breweryMarkersById[String(id)]
            : this._osmMarkersById[String(id)];
        const cluster = source === 'beerbook' ? this.breweryCluster : this._osmCluster;
        const fallbackLatLng = marker?.getLatLng?.();
        const targetLat = Number.isFinite(Number(lat)) ? Number(lat) : fallbackLatLng?.lat;
        const targetLng = Number.isFinite(Number(lng)) ? Number(lng) : fallbackLatLng?.lng;
        if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return;
        const markerLatLng = L.latLng(targetLat, targetLng);
        const currentZoom = map.getZoom() || 0;
        const bounds = map.getBounds();
        const isVisible = bounds.contains(markerLatLng);

        const isClustered = marker ? this.isMarkerClustered(marker, cluster) : false;

        let targetZoom = currentZoom;
        if (isClustered) {
            targetZoom = Math.max(currentZoom, 15);
        } else if (!isVisible) {
            targetZoom = Math.max(currentZoom, 13);
        }
        targetZoom = Math.min(targetZoom, 17);

        const offsetLatLng = this.getOffsetCenter(markerLatLng, targetZoom);

        if (!marker) {
            map.flyTo(offsetLatLng, targetZoom, { duration: 0.5, easeLinearity: 0.5 });
            if (!skipDetail) this.showVenueDetail(id, source, { lat: targetLat, lng: targetLng });
            return;
        }

        if (cluster && typeof cluster.zoomToShowLayer === 'function') {
            map.flyTo(offsetLatLng, targetZoom, { duration: 0.5, easeLinearity: 0.5 });
            cluster.zoomToShowLayer(marker, () => {
                marker.openPopup();
                this.highlightVenueMarker(marker);
            });
        } else {
            map.flyTo(offsetLatLng, targetZoom, { duration: 0.5, easeLinearity: 0.5 });
            setTimeout(() => {
                if (marker.openPopup) marker.openPopup();
                this.highlightVenueMarker(marker);
            }, 550);
        }

        if (!skipDetail) this.showVenueDetail(id, source, { lat: targetLat, lng: targetLng });
    },

    isMarkerClustered(marker, cluster) {
        const group = cluster || this.breweryCluster;
        if (group && typeof group.getVisibleParent === 'function') {
            const parent = group.getVisibleParent(marker);
            return parent !== marker;
        }
        return false;
    },

    getSheetOffset() {
        if (this.currentLayer !== 'discover') return 60;
        this._ensureBottomSheet();
        const sheetVisibleHeight = this._bottomSheet?.getVisibleHeight?.() || 120;
        return Math.max(sheetVisibleHeight / 2, 60);
    },

    getOffsetCenter(latLng, zoom) {
        if (!this.map) return latLng;
        const offset = this.getSheetOffset();
        const point = this.map.project(latLng, zoom);
        const offsetPoint = L.point(point.x, point.y + offset);
        return this.map.unproject(offsetPoint, zoom);
    },

    findOSMVenueById(venueId) {
        const rawId = String(venueId).replace(/^osm_/, '');
        return (this._osmVenues || []).find((v) => String(v.id) === rawId);
    },

    showVenueSheetOSMDetail(venueId) {
        const venue = this.findOSMVenueById(venueId);
        if (!venue) return '<p>Venue not found.</p>';
        return this.buildOSMDetailHtml(venue);
    },

    buildOSMDetailHtml(venue) {
        const pill = venueTypePill(venue.type || '');
        const safeName = Utils.escapeHtml(venue.name || 'Unknown Venue');
        const safeVenueId = Utils.escapeHtml(`osm_${String(venue.id || '')}`);
        const safeVenueName = Utils.escapeHtml(venue.name || 'Selected Venue');
        const safeLat = Utils.escapeHtml(String(venue.lat ?? ''));
        const safeLng = Utils.escapeHtml(String(venue.lng ?? ''));
        const websiteUrl = Utils.sanitizeUrl(venue.website);

        return `
            <div class="venue-detail-header">
                <h3 class="venue-detail-name">${safeName}</h3>
                <div class="venue-detail-meta">
                    ${pill}
                    ${venue.hours ? `<span class="venue-detail__location">${Utils.escapeHtml(venue.hours)}</span>` : ''}
                </div>
            </div>
            ${venue.phone ? `<div class="venue-detail-row">📞 ${Utils.escapeHtml(venue.phone)}</div>` : ''}
            ${websiteUrl ? `<div class="venue-detail-row"><a href="${Utils.escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">🌐 Visit Website →</a></div>` : ''}
            <div class="venue-detail-actions" style="margin-top:12px;">
                <a href="#" class="btn btn-primary btn-sm osm-rate-link" data-venue-id="${safeVenueId}" data-venue-name="${safeVenueName}" data-lat="${safeLat}" data-lng="${safeLng}">
                    ⭐ Rate a beer from here
                </a>
            </div>
        `;
    },

    highlightVenueMarker(marker) {
        if (this._highlightTimeout) {
            clearTimeout(this._highlightTimeout);
            this._highlightTimeout = null;
        }

        if (this._highlightedMarker && this._highlightedMarker !== marker) {
            const prevEl = this._highlightedMarker.getElement?.();
            if (prevEl) prevEl.classList.remove('venue-pin-highlight');
        }

        this._highlightedMarker = marker;
        const el = marker?.getElement?.();
        if (!el) return;

        const alreadyHighlighted = el.classList.contains('venue-pin-highlight');
        if (!alreadyHighlighted) el.classList.add('venue-pin-highlight');

        this._highlightTimeout = setTimeout(() => {
            const activeEl = this._highlightedMarker?.getElement?.();
            if (activeEl) activeEl.classList.remove('venue-pin-highlight');
            this._highlightTimeout = null;
        }, 900);
    },

    async loadMap() {
        try {
            const [ratingsRes, venuesRes] = DB.isDemo
                ? [{ data: [] }, { data: [] }]
                : await Promise.all([DB.getMap(), DB.getMapVenues()]);
            this.mapData = (ratingsRes && ratingsRes.data) ? ratingsRes.data : [];
            this.mapVenueData = (venuesRes && venuesRes.data) ? venuesRes.data : [];
            this.buildStylesList();
            this.renderPins();
        } catch (err) {
            console.error('Map load failed:', err);
        }
    },

    buildStylesList() {
        const styles = new Set();
        this.mapData.forEach(r => { if (r.style) styles.add(r.style); });
        this.styles = [...styles].sort();
        const select = document.getElementById('map-filter-style');
        if (!select) return;
        const cur = select.value;
        select.innerHTML = '<option value="">All Styles</option>' + this.styles.map(s =>
            `<option value="${Utils.escapeHtml(s)}" ${s === cur ? 'selected' : ''}>${Utils.escapeHtml(s)}</option>`
        ).join('');
    },

    orphanGeotaggedRatings() {
        const styleFilter = document.getElementById('map-filter-style')?.value || '';
        return (this.mapData || []).filter((r) => {
            if (r.venue_id) return false;
            if (r.latitude == null || r.longitude == null) return false;
            if (styleFilter && r.style && r.style !== styleFilter) return false;
            return true;
        });
    },

    pinColorForActivity(ratingCount) {
        if ((ratingCount || 0) >= 5) return '#F6AD55'; // gold: active spot
        if ((ratingCount || 0) >= 2) return '#ED8936'; // amber: warming up
        return '#A0AEC0'; // gray: new discovery
    },

    renderPins() {
        if (this.markersCluster) {
            this.map.removeLayer(this.markersCluster);
            this.markersCluster = null;
        }
        if (this.orphanMarkersCluster) {
            this.map.removeLayer(this.orphanMarkersCluster);
            this.orphanMarkersCluster = null;
        }
        const venues = Array.isArray(this.mapVenueData) ? this.mapVenueData : [];
        const markers = [];
        const boundsPoints = [];
        venues.forEach(v => {
            if (v.latitude == null || v.longitude == null) return;
            const fillColor = this.pinColorForActivity(v.rating_count || 0);
            const avgText = v.avg_rating != null ? Number(v.avg_rating).toFixed(1) : '—';
            const lastCheckIn = v.last_rated_at
                ? (Utils.formatDate ? Utils.formatDate(v.last_rated_at) : new Date(v.last_rated_at).toLocaleDateString())
                : 'Never';
            const m = L.circleMarker([v.latitude, v.longitude], {
                radius: 10,
                weight: 2,
                color: '#fff',
                fillColor: fillColor,
                fillOpacity: 0.85
            });
            m.bindPopup(`
                <div class="map-popup">
                    <strong>${Utils.escapeHtml(v.name)}</strong><br>
                    ⭐ ${avgText} avg · ${v.rating_count || 0} ratings · ${v.unique_beers || 0} beers<br>
                    Last check-in: ${Utils.escapeHtml(lastCheckIn)}<br>
                    ${v.top_beer ? `Top beer: ${Utils.escapeHtml(v.top_beer)}<br>` : ''}
                    <button type="button" class="btn btn-sm btn-primary map-popup-venue" data-venue-id="${v.id || ''}" data-venue-name="${Utils.escapeHtml(v.name)}">View Venue Detail</button>
                    <a href="#" class="brewery-rate-link" data-brewery-id="${Utils.escapeHtml(String(v.id || ''))}" data-venue-name="${Utils.escapeHtml(v.name || '')}" data-lat="${Utils.escapeHtml(String(v.latitude ?? ''))}" data-lng="${Utils.escapeHtml(String(v.longitude ?? ''))}">⭐ Rate a beer from here →</a>
                </div>
            `);
            m.venueId = v.id;
            m.venueName = v.name;
            m.on('popupopen', () => {
                const popupEl = m.getPopup().getElement();
                popupEl?.querySelector('.brewery-rate-link')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    rateFromVenue(v.id, v.name || 'Selected Venue', v.latitude, v.longitude);
                });
            });
            markers.push(m);
            boundsPoints.push([v.latitude, v.longitude]);
        });
        this.markersCluster = L.markerClusterGroup();
        markers.forEach(m => this.markersCluster.addLayer(m));

        const orphanRatings = this.orphanGeotaggedRatings();
        const orphanMarkers = [];
        orphanRatings.forEach((r) => {
            const lat = Number(r.latitude);
            const lng = Number(r.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            const m = L.circleMarker([lat, lng], {
                radius: 7,
                weight: 2,
                color: '#fff',
                fillColor: '#6B7280',
                fillOpacity: 0.8,
            });
            m.bindPopup(`
                <div class="map-popup">
                    <strong>${Utils.escapeHtml(r.location_name || 'Tagged Location')}</strong><br>
                    ${Utils.escapeHtml(r.beer_name || 'Beer')} · ${r.rating || '—'}★<br>
                    <span style="opacity:0.8;">Legacy check-in (unlinked venue)</span>
                </div>
            `);
            orphanMarkers.push(m);
            boundsPoints.push([lat, lng]);
        });
        this.orphanMarkersCluster = L.markerClusterGroup();
        orphanMarkers.forEach((m) => this.orphanMarkersCluster.addLayer(m));

        if (this.currentLayer === 'mymap') {
            this.map.addLayer(this.markersCluster);
            this.map.addLayer(this.orphanMarkersCluster);
        }
        if (boundsPoints.length) {
            const bounds = L.latLngBounds(boundsPoints);
            this.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
        }
    },

    _onPopupVenueClick(e) {
        const btn = e.target.closest('.map-popup-venue');
        if (!btn) return;
        const id = btn.dataset.venueId;
        if (id && typeof Venues !== 'undefined' && Venues.openDetail) Venues.openDetail(id);
    },

    applyStyleFilter() {
        this.renderPins();
    },

    async bestNearMe() {
        const sidebar = document.getElementById('map-sidebar');
        if (!sidebar) return;
        if (!navigator.geolocation) {
            App.toast('Geolocation not supported', 'error');
            return;
        }
        const btn = document.getElementById('btn-near-me');
        if (btn) btn.disabled = true;
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                if (this.userMarker) this.map.removeLayer(this.userMarker);
                this.userMarker = L.circleMarker([lat, lng], {
                    radius: 10,
                    fillColor: '#42a5f5',
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 0.9
                }).addTo(this.map);
                this.userMarker.bindPopup('You are here');
                try {
                    const res = DB.isDemo ? { data: [] } : await DB.getDeals(lat, lng);
                    const deals = (res && res.data) ? res.data : [];
                    this.renderDealsSidebar(deals, lat, lng);
                    this.showDealsOnMap(deals);
                } catch (err) {
                    console.error('Deals failed:', err);
                    sidebar.innerHTML = '<p class="map-sidebar-empty">Could not load deals.</p>';
                }
                if (btn) btn.disabled = false;
            },
            () => {
                App.toast('Location permission denied or unavailable', 'info');
                if (btn) btn.disabled = false;
            },
            { enableHighAccuracy: false, timeout: 15000 }
        );
    },

    renderDealsSidebar(deals, userLat, userLng) {
        const sidebar = document.getElementById('map-sidebar');
        if (!sidebar) return;
        if (!deals.length) {
            sidebar.innerHTML = '<p class="map-sidebar-empty">No beer deals found nearby. Try expanding your radius or logging some prices!</p>';
            return;
        }
        const formatDist = (m) => m < 1000 ? `${m} m` : `${(m / 1609.34).toFixed(1)} mi`;
        sidebar.innerHTML = '<h3 class="map-sidebar-title">🍺 Best Beer Near Me</h3>' + deals.slice(0, 15).map((d, i) => {
            const dist = d.venue && d.venue.distance_m != null ? formatDist(d.venue.distance_m) : '';
            const price = d.price_cents ? `$${(d.price_cents / 100).toFixed(2)}` : '';
            const hh = d.is_happy_hour ? ` 🟢 Happy Hour!${d.happy_hour_ends_at ? ` Ends ${d.happy_hour_ends_at}` : ''}` : '';
            const ygPd = d.yg_per_dollar != null ? d.yg_per_dollar.toFixed(2) : '—';
            return `
                <div class="deal-card" data-venue-id="${d.venue?.id || ''}" data-lat="${d.venue?.lat || ''}" data-lng="${d.venue?.lng || ''}">
                    <div class="deal-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1)}</div>
                    <div class="deal-body">
                        <strong>${Utils.escapeHtml(d.beer_name || '')}</strong> — ${Utils.escapeHtml((d.venue && d.venue.name) || '')} ${dist ? `(${dist})` : ''}<br>
                        <span class="deal-meta">${price}${hh} · ${d.yg_rate != null ? d.yg_rate + ' YG' : '—'} · ${d.avg_stars != null ? d.avg_stars + '⭐' : ''} · ${ygPd} YG/$</span>
                    </div>
                </div>`;
        }).join('');
        sidebar.querySelectorAll('.deal-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.venueId;
                if (id && typeof Venues !== 'undefined' && Venues.openDetail) Venues.openDetail(id);
            });
        });
    },

    showDealsOnMap(deals) {
        this.dealsMarkers.forEach(m => { if (this.map.hasLayer(m)) this.map.removeLayer(m); });
        this.dealsMarkers = [];
        const venueCoords = {};
        (this.mapVenueData || []).forEach((v) => {
            if (v && v.id && v.latitude != null && v.longitude != null) {
                venueCoords[v.id] = [v.latitude, v.longitude];
            }
        });
        (this.mapData || []).forEach(r => {
            if (r.venue_id && r.latitude != null) venueCoords[r.venue_id] = [r.latitude, r.longitude];
        });
        deals.slice(0, 15).forEach((d) => {
            const vid = d.venue && d.venue.id;
            const latLng = vid && venueCoords[vid] ? venueCoords[vid] : null;
            if (!latLng) return;
            const m = L.circleMarker(latLng, {
                radius: 10,
                weight: 2,
                color: '#fff',
                fillColor: '#f59e0b',
                fillOpacity: 0.85
            }).addTo(this.map);
            m.bindPopup(`${d.beer_name} — ${(d.venue && d.venue.name) || ''}`);
            this.dealsMarkers.push(m);
        });
    },

    async showMyTrail() {
        if (this.trailLayer && this.map) {
            this.map.removeLayer(this.trailLayer);
            this.trailLayer = null;
        }
        this.trailMarkers.forEach((m) => {
            if (this.map && m && this.map.hasLayer(m)) this.map.removeLayer(m);
        });
        this.trailMarkers = [];

        if (!DB.currentUser || !DB.currentUser.id) return;
        try {
            const res = await DB.getMapUser(DB.currentUser.id);
            const list = (res && res.data) ? res.data : [];
            if (!list.length) {
                App.toast('No geotagged ratings for your trail.', 'info');
                return;
            }
            const latlngs = list.map(r => [r.latitude, r.longitude]).filter(([lat, lng]) => lat != null && lng != null);
            if (latlngs.length < 2) {
                App.toast('Need at least 2 locations for a trail.', 'info');
                return;
            }
            this.trailLayer = L.polyline(latlngs, { color: '#e6a817', weight: 4 }).addTo(this.map);
            this.map.fitBounds(this.trailLayer.getBounds(), { padding: [24, 24] });
            list.forEach((r) => {
                const m = L.circleMarker([r.latitude, r.longitude], {
                    radius: 10,
                    weight: 2,
                    color: '#fff',
                    fillColor: '#e6a817',
                    fillOpacity: 0.85
                }).addTo(this.map);
                m.bindPopup(`${Utils.escapeHtml(r.beer_name || '')} · ${r.rating || ''}★ ${r.yg_value != null ? r.yg_value + ' YG' : ''} · ${Utils.formatDate ? Utils.formatDate(r.created_at) : r.created_at}`);
                this.trailMarkers.push(m);
            });
        } catch (err) {
            console.error('Trail failed:', err);
            App.toast('Could not load trail', 'error');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof App !== 'undefined') MapView.bindEvents?.();
});
