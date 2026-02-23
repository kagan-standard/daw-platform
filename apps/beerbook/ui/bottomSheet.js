(function () {
    const STATE_ORDER = ['MIN', 'DETAIL', 'LIST'];
    const SWIPE_THRESHOLD = 40;
    const RUBBER_BAND = 30;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function toNum(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function haversineMiles(lat1, lon1, lat2, lon2) {
        const R = 3959;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    class BottomSheetController {
        constructor(options) {
            this.options = options || {};
            this.root = document.getElementById('bb-sheet-root');
            this.sheet = document.getElementById('bb-sheet');
            this.backdrop = document.getElementById('bb-sheet-backdrop');
            this.chrome = document.getElementById('bb-sheet-chrome');
            this.titleEl = document.getElementById('bb-sheet-title');
            this.subtitleEl = document.getElementById('bb-sheet-subtitle');
            this.previewEl = document.getElementById('bb-sheet-min-preview');
            this.scrollEl = document.getElementById('bb-sheet-scroll');
            this.detailEl = document.getElementById('bb-sheet-detail');
            this.detailBodyEl = document.getElementById('bb-sheet-detail-body');
            this.backBtn = document.getElementById('bb-sheet-back');

            this.state = 'MIN';
            this.selection = null;
            this.venues = [];
            this._snap = { MIN: 0, DETAIL: 0, LIST: 0 };
            this._drag = null;
            this._scrollTouch = null;
            this._isDestroyed = false;

            this._onResize = this._onResize.bind(this);
            this._onBackdropClick = this._onBackdropClick.bind(this);
            this._onBackClick = this._onBackClick.bind(this);
            this._onCardClick = this._onCardClick.bind(this);

            this._init();
        }

        _init() {
            if (!this.root || !this.sheet) return;

            this._computeSnapPoints();
            this._applyY(this._snap.MIN);
            this._setState('MIN');
            this._bindEvents();
            this.updateVenues();
        }

        _bindEvents() {
            this.backdrop?.addEventListener('click', this._onBackdropClick);
            this.backBtn?.addEventListener('click', this._onBackClick);
            this.previewEl?.addEventListener('click', this._onCardClick);
            this.scrollEl?.addEventListener('click', this._onCardClick);
            this.detailBodyEl?.addEventListener('click', (e) => this._onDetailActionClick(e));

            this._bindChromeDrag();
            this._bindScrollHandoff();
            window.addEventListener('resize', this._onResize);
            window.addEventListener('orientationchange', this._onResize);
        }

        _bindChromeDrag() {
            if (!this.chrome || !this.sheet) return;

            const onPointerMove = (e) => {
                if (!this._drag) return;
                const dy = e.clientY - this._drag.startY;
                this._drag.deltaY = dy;
                const minY = this._snap.LIST;
                const maxY = this._snap.MIN + RUBBER_BAND;
                const nextY = clamp(this._drag.startSheetY + dy, minY, maxY);
                this._applyY(nextY);
            };

            const onPointerUp = () => {
                if (!this._drag) return;
                this.sheet.classList.remove('dragging');
                const dy = this._drag.deltaY || 0;
                this._drag = null;

                if (dy <= -SWIPE_THRESHOLD) {
                    this.snapTo(this._nextHigherState());
                } else if (dy >= SWIPE_THRESHOLD) {
                    this.snapTo(this._nextLowerState());
                } else {
                    this.snapTo(this.state);
                }

                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                window.removeEventListener('pointercancel', onPointerUp);
            };

            this.chrome.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                this._drag = {
                    startY: e.clientY,
                    startSheetY: this._stateToY(this.state),
                    deltaY: 0
                };
                this.sheet.classList.add('dragging');
                if (this.chrome.setPointerCapture) this.chrome.setPointerCapture(e.pointerId);
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
                window.addEventListener('pointercancel', onPointerUp);
            });
        }

        _bindScrollHandoff() {
            if (!this.scrollEl) return;

            this.scrollEl.addEventListener('touchstart', (e) => {
                if (this.state !== 'LIST') return;
                if (!e.touches || !e.touches[0]) return;
                this._scrollTouch = {
                    startY: e.touches[0].clientY,
                    snapped: false
                };
            }, { passive: true });

            this.scrollEl.addEventListener('touchmove', (e) => {
                if (this.state !== 'LIST' || !this._scrollTouch || this._scrollTouch.snapped) return;
                if (!e.touches || !e.touches[0]) return;
                const currentY = e.touches[0].clientY;
                const deltaY = currentY - this._scrollTouch.startY;
                if (this.scrollEl.scrollTop <= 0 && deltaY > SWIPE_THRESHOLD) {
                    this._scrollTouch.snapped = true;
                    e.preventDefault();
                    this.snapTo(this.selection ? 'DETAIL' : 'MIN');
                }
            }, { passive: false });

            this.scrollEl.addEventListener('touchend', () => {
                this._scrollTouch = null;
            }, { passive: true });
        }

        _onResize() {
            this._computeSnapPoints();
            this._applyY(this._stateToY(this.state));
        }

        _computeSnapPoints() {
            const vh = window.innerHeight || document.documentElement.clientHeight || 800;
            const minVisible = 110;
            const detailVisible = Math.round(vh * 0.52);
            const listVisible = Math.round(vh * 0.90);

            this._snap.MIN = vh - minVisible;
            this._snap.DETAIL = vh - detailVisible;
            this._snap.LIST = vh - listVisible;
        }

        _stateToY(state) {
            return this._snap[state] ?? this._snap.MIN;
        }

        _setState(state) {
            if (!STATE_ORDER.includes(state)) return;
            this.state = state;
            if (this.root) this.root.dataset.state = state;
            this._updateHeader();
            this._updateBackdrop();
        }

        _updateHeader() {
            if (!this.titleEl || !this.subtitleEl) return;
            if (this.state === 'DETAIL' && this.selection?.name) {
                this.titleEl.textContent = this.selection.name;
                this.subtitleEl.textContent = 'Venue detail';
                return;
            }
            const count = this.venues.length;
            this.titleEl.textContent = count ? `${count} Venue${count === 1 ? '' : 's'} Nearby` : 'Nearby';
            this.subtitleEl.textContent = this._hasMapCenter() ? 'Sorted by distance' : 'Based on current map view';
        }

        _updateBackdrop() {
            if (!this.backdrop) return;
            this.backdrop.style.setProperty('--sheet-backdrop', this.state === 'LIST' ? '1' : '0');
        }

        _applyY(y) {
            if (!this.sheet) return;
            const value = `${Math.round(y)}px`;
            this.sheet.style.setProperty('--sheet-y', value);
            if (this.root) this.root.style.setProperty('--sheet-y', value);
        }

        _onBackdropClick() {
            if (this.state === 'LIST') {
                this.snapTo(this.selection ? 'DETAIL' : 'MIN');
            } else if (this.state === 'DETAIL') {
                this.snapTo('MIN');
            }
        }

        _onBackClick() {
            this.snapTo('LIST');
        }

        _onCardClick(event) {
            const card = event.target?.closest('.venue-list-card');
            if (!card) return;
            const id = card.dataset.venueId;
            const source = card.dataset.source;
            const lat = toNum(card.dataset.lat, null);
            const lng = toNum(card.dataset.lng, null);
            this.selectVenue({ id, source, lat, lng });
        }

        _onDetailActionClick(event) {
            const rateLink = event.target.closest('.brewery-rate-link, .osm-rate-link');
            if (!rateLink) return;
            event.preventDefault();
            const venueId = rateLink.dataset.venueId || rateLink.dataset.breweryId || '';
            const venueName = rateLink.dataset.venueName || this.selection?.name || 'Selected Venue';
            const lat = toNum(rateLink.dataset.lat, null);
            const lng = toNum(rateLink.dataset.lng, null);
            if (typeof window.rateFromVenue === 'function') {
                window.rateFromVenue(venueId, venueName, lat, lng);
            }
        }

        _nextHigherState() {
            if (this.state === 'MIN') return this.selection ? 'DETAIL' : 'LIST';
            if (this.state === 'DETAIL') return 'LIST';
            return 'LIST';
        }

        _nextLowerState() {
            if (this.state === 'LIST') return this.selection ? 'DETAIL' : 'MIN';
            if (this.state === 'DETAIL') return 'MIN';
            return 'MIN';
        }

        _venueBorderColor(venue) {
            const mapView = window.MapView;
            if (!mapView || !mapView.getVenueCategory || !mapView.getVenuePinStyle) return '#F6AD55';
            const category = mapView.getVenueCategory(venue.type);
            const style = mapView.getVenuePinStyle(category);
            return style?.color || '#F6AD55';
        }

        _venueMeta(venue) {
            const mapView = window.MapView;
            const location = [venue.city, venue.state].filter(Boolean).join(', ');
            const typePill = mapView?.venueTypePill ? mapView.venueTypePill(venue.type) : '';
            return `${typePill}${location ? `<span class="venue-detail__location">${window.Utils?.escapeHtml(location) || location}</span>` : ''}`;
        }

        _formatDistance(distance) {
            if (!Number.isFinite(distance)) return '';
            if (distance < 0.1) return `${Math.round(distance * 5280)} ft`;
            return `${distance.toFixed(1)} mi`;
        }

        _renderCard(venue) {
            const border = this._venueBorderColor(venue);
            const dist = this._formatDistance(venue.distance);
            const name = window.Utils?.escapeHtml(venue.name || 'Unknown Venue') || 'Unknown Venue';
            const meta = this._venueMeta(venue);
            return `
                <div class="venue-list-card" data-venue-id="${venue.id}" data-source="${venue.source}" data-lat="${venue.lat}" data-lng="${venue.lng}" style="border-left: 3px solid ${border}">
                    <div class="venue-list-card-info">
                        <div class="venue-list-card-name">${name}</div>
                        <div class="venue-list-card-meta">${meta}</div>
                    </div>
                    ${dist ? `<div class="venue-list-card-distance">${dist}</div>` : ''}
                </div>
            `;
        }

        _hasMapCenter() {
            return !!(window.MapView && window.MapView.map && window.MapView.map.getCenter);
        }

        _sortForDisplay(venues) {
            const list = Array.isArray(venues) ? [...venues] : [];
            const mapCenter = this._hasMapCenter() ? window.MapView.map.getCenter() : null;
            if (mapCenter) {
                list.forEach((venue) => {
                    venue.distance = haversineMiles(mapCenter.lat, mapCenter.lng, venue.lat, venue.lng);
                });
                list.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
                return list;
            }
            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return list;
        }

        _renderMinPreview() {
            if (!this.previewEl) return;
            if (!this.venues.length) {
                this.previewEl.innerHTML = '<p class="map-sidebar-empty">Loading nearby venues…</p>';
                return;
            }
            const preview = this._sortForDisplay(this.venues).slice(0, 2);
            this.previewEl.innerHTML = preview.map((venue) => this._renderCard(venue)).join('');
        }

        _renderList() {
            if (!this.scrollEl) return;
            if (!this.venues.length) {
                this.scrollEl.innerHTML = '<p class="map-sidebar-empty">No venues in this area yet.</p>';
                return;
            }
            const list = this._sortForDisplay(this.venues).slice(0, 50);
            this.scrollEl.innerHTML = list.map((venue) => this._renderCard(venue)).join('');
        }

        async _renderDetail() {
            if (!this.detailBodyEl || !this.selection) return false;
            const render = this.options.renderDetail;
            if (typeof render !== 'function') return false;
            this.detailBodyEl.innerHTML = '<p class="brewery-sheet-loading">Loading…</p>';
            try {
                const html = await render(this.selection.id, this.selection.source);
                if (!this.selection) return false;
                if (!html) {
                    this.detailBodyEl.innerHTML = '';
                    return false;
                }
                this.detailBodyEl.innerHTML = html;
                return true;
            } catch (_) {
                this.detailBodyEl.innerHTML = '';
                return false;
            }
        }

        snapTo(state) {
            const target = STATE_ORDER.includes(state) ? state : this.state;
            this._setState(target);
            this._applyY(this._stateToY(target));
        }

        async selectVenue(venue) {
            if (!venue || !venue.id) return;
            const picked = { ...venue };
            if (!picked.name) {
                const match = (this.venues || []).find((v) => String(v.id) === String(picked.id) && String(v.source) === String(picked.source));
                if (match) picked.name = match.name;
            }
            this.selection = picked;
            const onSelect = this.options.onSelectVenue;
            if (typeof onSelect === 'function') {
                onSelect(picked);
            }
            const ok = await this._renderDetail();
            if (!ok) {
                this.clearSelection();
                this.snapTo('MIN');
                return;
            }
            this.snapTo('DETAIL');
        }

        clearSelection() {
            this.selection = null;
            if (this.detailBodyEl) this.detailBodyEl.innerHTML = '';
            if (this.state === 'DETAIL') this.snapTo('MIN');
            this._updateHeader();
        }

        getState() {
            return this.state;
        }

        getVisibleHeight() {
            if (!this.sheet) return 0;
            const rect = this.sheet.getBoundingClientRect();
            return Math.max(0, window.innerHeight - rect.top);
        }

        updateVenues() {
            const getter = this.options.getVenues;
            const venues = typeof getter === 'function' ? getter() : [];
            this.venues = Array.isArray(venues) ? venues : [];
            this._renderMinPreview();
            this._renderList();
            this._updateHeader();
        }

        show() {
            if (this.root) this.root.style.display = '';
        }

        hide() {
            if (this.root) this.root.style.display = 'none';
        }

        destroy() {
            if (this._isDestroyed) return;
            this._isDestroyed = true;
            window.removeEventListener('resize', this._onResize);
            window.removeEventListener('orientationchange', this._onResize);
            this.backdrop?.removeEventListener('click', this._onBackdropClick);
            this.backBtn?.removeEventListener('click', this._onBackClick);
            this.previewEl?.removeEventListener('click', this._onCardClick);
            this.scrollEl?.removeEventListener('click', this._onCardClick);
        }
    }

    window.BottomSheet = {
        create(options) {
            return new BottomSheetController(options);
        }
    };
})();
