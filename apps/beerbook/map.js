/* ============================================
   BeerBook — Beer Map (Leaflet)
   Phase 3.9: Brewery pins, clustering, layer toggle
   ============================================ */

const MapView = {
    map: null,
    markersCluster: null,
    venueLayer: null,
    userMarker: null,
    trailLayer: null,
    dealsMarkers: [],
    mapData: [],
    styles: [],
    initDone: false,
    trailMarkers: [],
    eventsBound: false,
    breweryCluster: null,
    _osmCluster: null,
    breweryData: [],
    _osmVenues: [],
    _osmLoading: false,
    _osmLastBounds: null,
    _userLat: null,
    _userLng: null,
    currentLayer: 'discover',
    moveEndDebounce: null,
    BREWERY_CATEGORIES: {
        brewery: { types: ['micro', 'nano', 'regional', 'large', 'contract', 'proprietor'], icon: '🏭', color: '#F6AD55' },
        brewpub: { types: ['brewpub'], icon: '🍽️', color: '#ED8936' },
        bar: { types: ['bar', 'taproom', 'beergarden'], icon: '🍺', color: '#48BB78' },
        other: { types: ['cidery', 'location'], icon: '📍', color: '#A0AEC0' }
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
        this.restoreFilterState();
        const viewMap = document.getElementById('view-map');
        if (viewMap) viewMap.classList.toggle('map-mode-mymap', this.currentLayer === 'mymap');
        const nearMeBtn = document.getElementById('map-nearme-btn');
        if (nearMeBtn) nearMeBtn.style.display = this.currentLayer === 'discover' ? 'inline-flex' : 'none';
        await this.loadMap();
        const venueSheet = document.getElementById('venue-list-sheet');
        if (this.currentLayer === 'discover') {
            this.showVenueListMode();
            this.loadBreweriesInViewport();
            this.loadOSMVenuesInViewport();
            if (venueSheet) {
                venueSheet.classList.remove('hidden');
                venueSheet.setAttribute('aria-hidden', 'false');
            }
        } else if (venueSheet) {
            venueSheet.classList.add('hidden');
            venueSheet.setAttribute('aria-hidden', 'true');
        }
        this.updateLayerVisibility();
        const filtersEl = document.getElementById('map-filters');
        if (filtersEl) filtersEl.style.display = this.currentLayer === 'discover' ? 'flex' : 'none';
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
        document.querySelectorAll('.map-filters .filter-chip').forEach((chip) => {
            chip.addEventListener('click', () => this.toggleBreweryFilter(chip));
        });
        document.querySelector('.brewery-bottom-sheet-backdrop')?.addEventListener('click', () => this.closeBrewerySheet());
        document.getElementById('venue-sheet-back')?.addEventListener('click', () => this.showVenueListMode());
        this._initSheetDrag();
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
        const filtersEl = document.getElementById('map-filters');
        if (filtersEl) filtersEl.style.display = layer === 'discover' ? 'flex' : 'none';
        const viewMap = document.getElementById('view-map');
        if (viewMap) {
            viewMap.classList.toggle('map-mode-mymap', layer === 'mymap');
        }
        const nearMeBtn = document.getElementById('map-nearme-btn');
        if (nearMeBtn) nearMeBtn.style.display = layer === 'discover' ? 'inline-flex' : 'none';
        this.updateLayerVisibility();
        const venueSheet = document.getElementById('venue-list-sheet');
        if (layer === 'discover') {
            if (venueSheet) {
                venueSheet.classList.remove('hidden');
                venueSheet.setAttribute('aria-hidden', 'false');
            }
            this.showVenueListMode();
            if (this.breweryData.length === 0) {
                this.loadBreweriesInViewport();
            } else {
                this.updateVenueListSheet();
            }
            this.loadOSMVenuesInViewport();
        } else if (venueSheet) {
            venueSheet.classList.add('hidden');
            venueSheet.setAttribute('aria-hidden', 'true');
        }
    },

    updateLayerVisibility() {
        const showRatings = this.currentLayer === 'mymap';
        const showBreweries = this.currentLayer === 'discover';
        if (this.markersCluster) {
            if (showRatings) this.map.addLayer(this.markersCluster);
            else this.map.removeLayer(this.markersCluster);
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

    toggleBreweryFilter(chip) {
        chip.classList.toggle('active');
        chip.setAttribute('aria-pressed', chip.classList.contains('active'));
        this.persistFilterState();
        this.renderBreweryPins();
        this.renderOSMPins();
        this.updateVenueListSheet();
    },

    persistFilterState() {
        try {
            const types = [];
            document.querySelectorAll('.map-filters .filter-chip.active').forEach((c) => types.push(c.dataset.type));
            sessionStorage.setItem('beerbook_map_brewery_filters', JSON.stringify(types));
        } catch (_) {}
    },

    restoreFilterState() {
        try {
            const raw = sessionStorage.getItem('beerbook_map_brewery_filters');
            if (!raw) return;
            const types = JSON.parse(raw);
            document.querySelectorAll('.map-filters .filter-chip').forEach((chip) => {
                const active = types.length === 0 || types.includes(chip.dataset.type);
                chip.classList.toggle('active', active);
                chip.setAttribute('aria-pressed', active);
            });
        } catch (_) {}
    },

    getBreweryCategory(breweryType) {
        const t = (breweryType || '').toLowerCase();
        for (const [cat, { types }] of Object.entries(this.BREWERY_CATEGORIES)) {
            if (types.includes(t)) return cat;
        }
        return 'other';
    },

    getBreweryPinStyle(category) {
        const c = this.BREWERY_CATEGORIES[category] || this.BREWERY_CATEGORIES.other;
        return { icon: c.icon, color: c.color };
    },

    isBreweryTypeVisible(category) {
        const active = document.querySelectorAll('.map-filters .filter-chip.active');
        if (active.length === 0) return true;
        if (category === 'other') return true;
        return Array.from(active).some((c) => c.dataset.type === category);
    },

    _onMapMoveEnd() {
        console.log('MapView: moveend fired', this.currentLayer);
        if (this.moveEndDebounce) clearTimeout(this.moveEndDebounce);
        this.moveEndDebounce = setTimeout(() => {
            this.moveEndDebounce = null;
            if (this.currentLayer === 'discover') {
                this.loadBreweriesInViewport();
                this.loadOSMVenuesInViewport();
            }
        }, 500);
    },

    async loadBreweriesInViewport() {
        if (!this.map) return;
        const b = this.map.getBounds();
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
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

    createBreweryIcon(b) {
        const category = this.getBreweryCategory(b.brewery_type);
        const { icon, color } = this.getBreweryPinStyle(category);
        return L.divIcon({
            className: 'brewery-pin',
            html: `<span class="brewery-pin-circle" style="background-color:${color}">${icon}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });
    },

    renderBreweryPins() {
        if (this.breweryCluster) {
            this.map.removeLayer(this.breweryCluster);
            this.breweryCluster = null;
        }
        const markers = [];
        this.breweryData.forEach((b) => {
            const category = this.getBreweryCategory(b.brewery_type);
            if (!this.isBreweryTypeVisible(category)) return;
            const lat = b.latitude;
            const lng = b.longitude;
            if (lat == null || lng == null) return;
            const m = L.marker([lat, lng], { icon: this.createBreweryIcon(b) });
            m.breweryId = b.id;
            m.brewerySummary = b;
            const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
            m.on('click', () => {
                this.showVenueSheetBreweryDetail(b.id);
                this.openBreweryDetail(b.id, isMobile);
            });
            const cityState = [b.city, b.state].filter(Boolean).join(', ');
            m.bindPopup(`
                <div class="map-popup map-popup-brewery">
                    <strong>${Utils.escapeHtml(b.name)}</strong><br>
                    Type: ${Utils.escapeHtml(b.brewery_type || '')} | ${Utils.escapeHtml(cityState || '')}<br>
                    <button type="button" class="btn btn-sm btn-primary map-popup-brewery-detail" data-brewery-id="${b.id}">View details</button>
                </div>
            `);
            m.on('popupopen', () => {
                m.getPopup().getElement().querySelector('.map-popup-brewery-detail')?.addEventListener('click', () => {
                    this.openBreweryDetail(b.id, window.matchMedia('(max-width: 768px)').matches);
                });
            });
            markers.push(m);
        });
        this.breweryCluster = L.markerClusterGroup({
            iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount();
                return L.divIcon({
                    className: 'brewery-cluster',
                    html: `<span class="brewery-cluster-count">${count}</span>`,
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

    _initSheetDrag() {
        const handle = document.getElementById('venue-sheet-handle');
        const sheet = document.getElementById('venue-list-sheet');
        if (!handle || !sheet) return;

        handle.addEventListener('click', () => {
            sheet.classList.toggle('expanded');
            sheet.classList.toggle('collapsed', !sheet.classList.contains('expanded'));
        });

        let startY = 0;
        handle.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
        }, { passive: true });
        handle.addEventListener('touchend', (e) => {
            const endY = e.changedTouches[0].clientY;
            const diff = startY - endY;
            if (diff > 30) {
                sheet.classList.add('expanded');
                sheet.classList.remove('collapsed');
            } else if (diff < -30) {
                sheet.classList.remove('expanded');
                sheet.classList.add('collapsed');
            }
        }, { passive: true });
    },

    showVenueListMode() {
        const list = document.getElementById('venue-sheet-list');
        const detail = document.getElementById('venue-sheet-detail');
        if (list) list.style.display = '';
        if (detail) detail.style.display = 'none';
    },

    async showVenueSheetBreweryDetail(breweryId) {
        const list = document.getElementById('venue-sheet-list');
        const detail = document.getElementById('venue-sheet-detail');
        const body = document.getElementById('venue-sheet-detail-body');
        const sheet = document.getElementById('venue-list-sheet');
        if (!list || !detail || !body || !sheet) return;
        if (this.currentLayer !== 'discover') return;

        body.innerHTML = '<p class="brewery-sheet-loading">Loading…</p>';
        list.style.display = 'none';
        detail.style.display = '';
        sheet.classList.add('expanded');
        sheet.classList.remove('collapsed');

        try {
            const b = await DB.getBrewery(breweryId);
            if (!b) {
                body.innerHTML = '<p>Brewery not found.</p>';
                return;
            }
            body.innerHTML = this.buildBreweryDetailHtml(b);
            this._bindBreweryDetailButtons(body, b);
        } catch (_) {
            body.innerHTML = '<p>Could not load brewery.</p>';
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
        const typeLabel = b.brewery_type || 'Brewery';
        const beers = b.beers || [];
        const beerList = beers.length === 0
            ? '<p>No beers cataloged yet — rate one to be the first!</p>'
            : beers.slice(0, 3).map((beer) =>
                `<li>${Utils.escapeHtml(beer.name)} (${Utils.escapeHtml(beer.style || '')}${beer.abv != null ? ', ' + beer.abv + '%' : ''})</li>`
            ).join('') + (beers.length > 3 ? `<li><a href="#" class="brewery-see-all" data-brewery-id="${b.id}">See all →</a></li>` : '');
        return `
            <div class="map-popup brewery-detail-popup">
                <strong>${Utils.escapeHtml(b.name)}</strong><br>
                Type: ${Utils.escapeHtml(typeLabel)} | ${Utils.escapeHtml(cityState)}<br>
                ${b.phone ? `📞 ${Utils.escapeHtml(b.phone)}<br>` : ''}
                ${b.website_url ? `<a href="${Utils.escapeHtml(b.website_url)}" target="_blank" rel="noopener" data-track-type="brewery" data-track-id="${Utils.escapeHtml(b.id || '')}" data-track-name="${Utils.escapeHtml(b.name || 'Unknown Brewery')}" data-track-source="brewery_detail">🌐 Visit Website →</a><br>` : ''}
                <p><strong>Beers in catalog:</strong> ${beers.length}</p>
                <ul>${beerList}</ul>
                <a href="#" class="brewery-rate-link" data-brewery-id="${b.id}">⭐ Rate a beer from here →</a>
            </div>
        `;
    },

    _bindBreweryDetailButtons(container, b) {
        if (!container) return;
        container.querySelector('.brewery-rate-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            try { sessionStorage.setItem('beerbook_rate_brewery_name', b.name || ''); } catch (_) {}
            if (typeof App !== 'undefined' && App.navigate) App.navigate('rate');
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
            body.innerHTML = `
                <h3>${Utils.escapeHtml(b.name)}</h3>
                <p>Type: ${Utils.escapeHtml(b.brewery_type || '')} | ${cityState}</p>
                ${b.phone ? `<p>📞 ${Utils.escapeHtml(b.phone)}</p>` : ''}
                ${b.website_url ? `<p><a href="${Utils.escapeHtml(b.website_url)}" target="_blank" rel="noopener" data-track-type="brewery" data-track-id="${Utils.escapeHtml(b.id || '')}" data-track-name="${Utils.escapeHtml(b.name || 'Unknown Brewery')}" data-track-source="brewery_detail">🌐 Visit Website →</a></p>` : ''}
                <p><strong>Beers in catalog:</strong> ${beers.length}</p>
                ${beerList}
                <p><a href="#" class="brewery-rate-link">⭐ Rate a beer from here →</a></p>
            `;
            body.querySelector('.brewery-rate-link')?.addEventListener('click', (e) => {
                e.preventDefault();
                try { sessionStorage.setItem('beerbook_rate_brewery_name', b.name || ''); } catch (_) {}
                this.closeBrewerySheet();
                if (typeof App !== 'undefined' && App.navigate) App.navigate('rate');
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

    _venueIcon(v) {
        if (v.category === 'bar' || v.type === 'pub' || v.type === 'bar') return '🍺';
        if (v.category === 'brewpub' || v.type === 'brewpub') return '🍽️';
        if (v.type === 'restaurant') return '🍴';
        return '🏭';
    },

    updateVenueListSheet() {
        const listEl = document.getElementById('venue-sheet-list');
        const titleEl = document.getElementById('venue-sheet-title');
        const subtitleEl = document.getElementById('venue-sheet-subtitle');
        const sheet = document.getElementById('venue-list-sheet');
        if (!listEl || !sheet) return;
        if (this.currentLayer !== 'discover') return;

        let allVenues = [];

        (this.breweryData || []).forEach((b) => {
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

        (this._osmVenues || []).forEach((v) => {
            if (!this.isBreweryTypeVisible(v.category)) return;
            allVenues.push({
                id: 'osm_' + v.id,
                name: v.name,
                type: v.type,
                category: v.category,
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

        const count = allVenues.length;
        if (titleEl) titleEl.textContent = `${count} Venue${count !== 1 ? 's' : ''} Near You`;
        if (subtitleEl) subtitleEl.textContent = this._userLat != null ? 'Sorted by distance' : 'Based on current map view';

        const display = allVenues.slice(0, 50);
        listEl.innerHTML = display.map((v) => {
            const icon = this._venueIcon(v);
            const distText = v.distance != null ? this._formatDist(v.distance) : '';
            const meta = [v.type, v.city, v.state].filter(Boolean).join(' · ');
            const sourceTag = v.source === 'osm' ? '<span class="venue-osm-tag">OSM</span>' : '';
            return `
                <div class="venue-list-card" data-venue-id="${v.id}" data-lat="${v.lat}" data-lng="${v.lng}" data-source="${v.source}">
                    <div class="venue-list-card-icon">${icon}</div>
                    <div class="venue-list-card-info">
                        <div class="venue-list-card-name">${Utils.escapeHtml(v.name || 'Unknown Venue')} ${sourceTag}</div>
                        <div class="venue-list-card-meta">${Utils.escapeHtml(meta)}</div>
                    </div>
                    ${distText ? `<div class="venue-list-card-distance">${distText}</div>` : ''}
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.venue-list-card').forEach((card) => {
            card.addEventListener('click', () => {
                const lat = parseFloat(card.dataset.lat);
                const lng = parseFloat(card.dataset.lng);
                const id = card.dataset.venueId;
                const source = card.dataset.source;
                this.map.setView([lat, lng], 15);
                if (source === 'beerbook' && !id.startsWith('osm_')) {
                    this.showVenueSheetBreweryDetail(id);
                }
            });
        });

        sheet.classList.remove('hidden');
        sheet.setAttribute('aria-hidden', 'false');
    },

    async loadOSMVenuesInViewport() {
        if (!this.map || this._osmLoading) return;
        if (this.currentLayer !== 'discover') return;
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
                .filter((el) => el.tags && el.tags.name)
                .map((el) => {
                    const lat = el.lat || (el.center && el.center.lat);
                    const lng = el.lon || (el.center && el.center.lon);
                    if (lat == null || lng == null) return null;
                    const tags = el.tags || {};
                    let type = tags.amenity || 'bar';
                    let category = 'bar';
                    if (tags.microbrewery === 'yes' || tags.craft === 'brewery') {
                        type = 'brewery';
                        category = 'brewery';
                    }
                    if (type === 'restaurant') category = 'bar';
                    return {
                        id: el.id,
                        name: tags.name,
                        type,
                        category,
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
        if (!this._osmVenues || this._osmVenues.length === 0) return;

        const markers = [];
        this._osmVenues.forEach((v) => {
            if (!this.isBreweryTypeVisible(v.category)) return;
            const icon = L.divIcon({
                className: 'osm-venue-pin',
                html: `<span class="osm-pin-circle">${v.type === 'restaurant' ? '🍴' : '🍺'}</span>`,
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
                    try { sessionStorage.setItem('beerbook_rate_venue_name', v.name); } catch (_) {}
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
        markers.forEach((m) => this._osmCluster.addLayer(m));

        if (this.currentLayer === 'discover') {
            this.map.addLayer(this._osmCluster);
        }
    },

    async loadMap() {
        try {
            const res = DB.isDemo ? { data: [] } : await DB.getMap();
            const list = (res && res.data) ? res.data : [];
            this.mapData = list;
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

    venuesFromRatings() {
        const byVenue = {};
        this.mapData.forEach(r => {
            const styleFilter = document.getElementById('map-filter-style')?.value || '';
            if (styleFilter && r.style !== styleFilter) return;
            const key = r.venue_id || `pin_${r.latitude}_${r.longitude}`;
            if (!byVenue[key]) {
                byVenue[key] = {
                    id: r.venue_id,
                    name: r.venue?.name || r.location_name || 'Unknown',
                    address: r.venue?.address || null,
                    latitude: r.latitude,
                    longitude: r.longitude,
                    ratings: [],
                    venue: r.venue
                };
            }
            byVenue[key].ratings.push(r);
        });
        return Object.values(byVenue).map(v => {
            const avg = v.ratings.reduce((s, r) => s + (r.rating || 0), 0) / v.ratings.length;
            const withYg = v.ratings.filter(r => r.yg_value != null).sort((a, b) => (b.yg_value || 0) - (a.yg_value || 0))[0];
            return {
                ...v,
                avgRating: avg,
                topBeer: withYg ? withYg.beer_name : (v.ratings[0]?.beer_name),
                topYg: withYg ? withYg.yg_value : null,
                count: v.ratings.length
            };
        });
    },

    pinColor(avgRating) {
        if (avgRating == null || avgRating === undefined) return '#6b7280';
        if (avgRating >= 4) return '#22c55e';
        if (avgRating >= 3) return '#f59e0b';
        if (avgRating >= 2) return '#ef4444';
        return '#6b7280';
    },

    renderPins() {
        if (this.markersCluster) {
            this.map.removeLayer(this.markersCluster);
            this.markersCluster = null;
        }
        const venues = this.venuesFromRatings();
        const markers = [];
        venues.forEach(v => {
            const fillColor = this.pinColor(v.avgRating);
            const m = L.circleMarker([v.latitude, v.longitude], {
                radius: 10,
                weight: 2,
                color: '#fff',
                fillColor: fillColor,
                fillOpacity: 0.85
            });
            const happyHourText = ''; // could be from venue.happy_hours if we had it
            m.bindPopup(`
                <div class="map-popup">
                    <strong>${Utils.escapeHtml(v.name)}</strong><br>
                    ⭐ ${v.avgRating.toFixed(1)} avg · ${v.count} beers rated<br>
                    ${happyHourText ? '🟢 Happy Hour NOW<br>' : ''}
                    ${v.topBeer ? `Top beer: ${Utils.escapeHtml(v.topBeer)}${v.topYg != null ? ` (${v.topYg} YG)` : ''}<br>` : ''}
                    <button type="button" class="btn btn-sm btn-primary map-popup-venue" data-venue-id="${v.id || ''}" data-venue-name="${Utils.escapeHtml(v.name)}">View Venue Detail</button>
                </div>
            `);
            m.venueId = v.id;
            m.venueName = v.name;
            markers.push(m);
        });
        this.markersCluster = L.markerClusterGroup();
        markers.forEach(m => this.markersCluster.addLayer(m));
        this.map.addLayer(this.markersCluster);
        if (venues.length) {
            const bounds = L.latLngBounds(venues.map(v => [v.latitude, v.longitude]));
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
