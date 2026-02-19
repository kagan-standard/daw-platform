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
    breweryData: [],
    currentLayer: 'breweries',
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
        await this.loadMap();
        if (this.currentLayer === 'breweries' || this.currentLayer === 'both') {
            this.loadBreweriesInViewport();
        }
        this.updateLayerVisibility();
        const filtersEl = document.getElementById('map-filters');
        if (filtersEl) filtersEl.style.display = (this.currentLayer === 'breweries' || this.currentLayer === 'both') ? 'flex' : 'none';
        this.map.invalidateSize();
    },

    bindEvents() {
        if (this.eventsBound) return;
        this.eventsBound = true;
        document.getElementById('btn-near-me')?.addEventListener('click', () => this.bestNearMe());
        document.getElementById('btn-my-trail')?.addEventListener('click', () => this.showMyTrail());
        document.getElementById('map-locate-btn')?.addEventListener('click', () => this.locateForBreweries());
        document.getElementById('map-filter-style')?.addEventListener('change', () => this.applyStyleFilter());
        document.getElementById('beer-map')?.addEventListener('click', (e) => this._onPopupVenueClick(e));
        document.querySelectorAll('.map-layer-btn').forEach((btn) => {
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
        if (DB.currentUser && DB.currentUser.id) {
            const trailBtn = document.getElementById('btn-my-trail');
            if (trailBtn) trailBtn.style.display = 'inline-flex';
        }
    },

    setLayer(layer) {
        this.currentLayer = layer;
        document.querySelectorAll('.map-layer-btn').forEach((btn) => {
            const active = btn.dataset.layer === layer;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active);
        });
        const filtersEl = document.getElementById('map-filters');
        if (filtersEl) filtersEl.style.display = (layer === 'breweries' || layer === 'both') ? 'flex' : 'none';
        this.updateLayerVisibility();
        if ((layer === 'breweries' || layer === 'both') && this.breweryData.length === 0) {
            this.loadBreweriesInViewport();
        }
    },

    updateLayerVisibility() {
        const showRatings = this.currentLayer === 'ratings' || this.currentLayer === 'both';
        const showBreweries = this.currentLayer === 'breweries' || this.currentLayer === 'both';
        if (this.markersCluster) {
            if (showRatings) this.map.addLayer(this.markersCluster);
            else this.map.removeLayer(this.markersCluster);
        }
        if (this.breweryCluster) {
            if (showBreweries) this.map.addLayer(this.breweryCluster);
            else this.map.removeLayer(this.breweryCluster);
        }
    },

    toggleBreweryFilter(chip) {
        chip.classList.toggle('active');
        chip.setAttribute('aria-pressed', chip.classList.contains('active'));
        this.persistFilterState();
        this.renderBreweryPins();
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
            if (this.currentLayer === 'breweries' || this.currentLayer === 'both') {
                this.loadBreweriesInViewport();
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
            m.on('click', () => this.openBreweryDetail(b.id, isMobile));
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
        if (this.currentLayer === 'breweries' || this.currentLayer === 'both') {
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
                ${b.website_url ? `<a href="${Utils.escapeHtml(b.website_url)}" target="_blank" rel="noopener">🌐 Visit Website →</a><br>` : ''}
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
                ${b.website_url ? `<p><a href="${Utils.escapeHtml(b.website_url)}" target="_blank" rel="noopener">🌐 Visit Website →</a></p>` : ''}
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

    locateForBreweries() {
        if (!navigator.geolocation) {
            if (typeof App !== 'undefined') App.toast('Geolocation not supported', 'error');
            return;
        }
        const btn = document.getElementById('map-locate-btn');
        if (btn) btn.disabled = true;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
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
                if (this.currentLayer === 'breweries' || this.currentLayer === 'both') {
                    this.loadBreweriesInViewport();
                }
                if (btn) btn.disabled = false;
            },
            () => {
                if (typeof App !== 'undefined') App.toast('Enable location to find nearby breweries', 'info');
                if (btn) btn.disabled = false;
            },
            { enableHighAccuracy: false, timeout: 15000 }
        );
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
