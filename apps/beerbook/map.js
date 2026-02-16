/* ============================================
   BeerBook — Beer Map (Leaflet)
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

    async onShow() {
        const container = document.getElementById('beer-map');
        if (!container) return;
        if (!this.map) {
            this.map = L.map('beer-map').setView([39.5, -98], 4);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(this.map);
        }
        if (!this.initDone) {
            this.initDone = true;
            this.bindEvents();
        }
        await this.loadMap();
        this.map.invalidateSize();
    },

    bindEvents() {
        document.getElementById('btn-near-me')?.addEventListener('click', () => this.bestNearMe());
        document.getElementById('btn-my-trail')?.addEventListener('click', () => this.showMyTrail());
        document.getElementById('map-filter-style')?.addEventListener('change', () => this.applyStyleFilter());
        document.getElementById('beer-map')?.addEventListener('click', (e) => this._onPopupVenueClick(e));
        if (DB.currentUser && DB.currentUser.id) {
            const trailBtn = document.getElementById('btn-my-trail');
            if (trailBtn) trailBtn.style.display = 'inline-flex';
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
        if (avgRating >= 4) return '#e6a817';
        if (avgRating >= 3) return '#c98b0a';
        return '#6b4a24';
    },

    renderPins() {
        if (this.markersCluster) {
            this.map.removeLayer(this.markersCluster);
            this.markersCluster = null;
        }
        const venues = this.venuesFromRatings();
        const markers = [];
        venues.forEach(v => {
            const color = this.pinColor(v.avgRating);
            const icon = L.divIcon({
                className: 'beer-pin',
                html: `<span class="pin-dot" style="background:${color}"></span>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            const m = L.marker([v.latitude, v.longitude], { icon });
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
        const formatDist = (m) => m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} mi`;
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
        deals.slice(0, 15).forEach((d, i) => {
            const vid = d.venue && d.venue.id;
            const latLng = vid && venueCoords[vid] ? venueCoords[vid] : null;
            if (!latLng) return;
            const icon = L.divIcon({
                className: 'deal-number-pin',
                html: `<span>${i + 1}</span>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });
            const m = L.marker(latLng, { icon }).addTo(this.map);
            m.bindPopup(`${d.beer_name} — ${(d.venue && d.venue.name) || ''}`);
            this.dealsMarkers.push(m);
        });
    },

    async showMyTrail() {
        if (!DB.currentUser || !DB.currentUser.id) return;
        try {
            const res = await DB.getMapUser(DB.currentUser.id);
            const list = (res && res.data) ? res.data : [];
            if (this.trailLayer) this.map.removeLayer(this.trailLayer);
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
            this.trailMarkers.forEach(m => { if (this.map.hasLayer(m)) this.map.removeLayer(m); });
            this.trailMarkers = [];
            list.forEach((r, i) => {
                const icon = L.divIcon({
                    className: 'deal-number-pin',
                    html: `<span>${i + 1}</span>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });
                const m = L.marker([r.latitude, r.longitude], { icon }).addTo(this.map);
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
