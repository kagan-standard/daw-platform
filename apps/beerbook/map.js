/**
 * Beer Map view — Leaflet map, venue pins, beer trail, "Best Beer Near Me"
 * Bug fixes: eventsBound guard (Fix 1), formatDist miles (Fix 2), showMyTrail cleanup at top (Fix 4)
 */
const MapView = {
    eventsBound: false,
    map: null,
    trailLayer: null,
    trailMarkers: [],

    init() {
        const container = document.getElementById('beer-map');
        if (!container || typeof L === 'undefined') return;
        if (this.map) return;
        this.map = L.map(container).setView([39.95, -75.16], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map);
        this.bindEvents();
    },

    bindEvents() {
        if (this.eventsBound) return;
        this.eventsBound = true;

        document.getElementById('btn-near-me')?.addEventListener('click', () => this.findNearMe());
        document.getElementById('map-filter-style')?.addEventListener('change', () => this.applyFilter());

        const viewMap = document.getElementById('view-map');
        if (viewMap) {
            viewMap.querySelectorAll('[data-view="map"]').forEach(btn => {
                btn.addEventListener('click', () => this.onShow());
            });
        }
    },

    onShow() {
        this.bindEvents();
        if (this.map) this.map.invalidateSize();
        this.loadMapData();
    },

    loadMapData() {
        if (!DB || DB.isDemo) return;
        if (typeof DB.getMapData !== 'function') return;
        DB.getMapData().then((data) => {
            if (data && data.data) this.renderPins(data.data);
        }).catch(() => {});
    },

    renderPins(ratings) {
        if (!this.map || typeof L === 'undefined') return;
        // Stub: actual pin rendering would go here
    },

    findNearMe() {
        if (!navigator.geolocation) {
            if (typeof App !== 'undefined') App.toast('Geolocation not supported', 'error');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (this.map) this.map.setView([pos.coords.latitude, pos.coords.longitude], 14);
                if (DB && !DB.isDemo && typeof DB.getDeals === 'function') {
                    DB.getDeals(pos.coords.latitude, pos.coords.longitude).then((res) => {
                        if (res && res.data) this.renderDealsSidebar(res.data, pos.coords);
                    }).catch(() => {});
                }
            },
            () => { if (typeof App !== 'undefined') App.toast('Location permission denied', 'error'); }
        );
    },

    applyFilter() {
        this.loadMapData();
    },

    renderDealsSidebar(deals, coords) {
        const sidebar = document.getElementById('map-sidebar');
        if (!sidebar) return;
        sidebar.innerHTML = deals.slice(0, 10).map((d, i) => {
            const dist = coords && d.latitude != null && d.longitude != null
                ? this.formatDist(this._metersBetween(coords.latitude, coords.longitude, d.latitude, d.longitude))
                : '';
            return `<div class="deal-card" data-index="${i}">${(d.beer_name || '').trim()} — ${(d.venue_name || '').trim()} ${dist ? '(' + dist + ')' : ''}</div>`;
        }).join('');
    },

    _metersBetween(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    /** Fix 2: Use miles (1609.34 m per mile); was incorrectly dividing by 1000 but labeling "mi". */
    formatDist(meters) {
        if (meters == null || !Number.isFinite(meters)) return '';
        const miles = meters / 1609.34;
        return miles < 0.1 ? (meters / 1609.34 * 5280).toFixed(0) + ' ft' : miles.toFixed(1) + ' mi';
    },

    /** Fix 4: Clear trail markers and layer at TOP before any early return. */
    showMyTrail(points) {
        if (this.trailLayer && this.map) {
            this.map.removeLayer(this.trailLayer);
            this.trailLayer = null;
        }
        this.trailMarkers.forEach((m) => {
            if (this.map && m) this.map.removeLayer(m);
        });
        this.trailMarkers = [];

        if (!points || points.length < 2) return;

        if (typeof L === 'undefined') return;
        const latlngs = points.map((p) => [p.latitude, p.longitude]);
        this.trailLayer = L.polyline(latlngs, { color: '#e6a817', weight: 4 }).addTo(this.map);
        points.forEach((p, i) => {
            const marker = L.marker([p.latitude, p.longitude])
                .bindPopup(`${p.beer_name || 'Beer'} · ${p.rating || ''} ★`)
                .addTo(this.map);
            this.trailMarkers.push(marker);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => MapView.init());
