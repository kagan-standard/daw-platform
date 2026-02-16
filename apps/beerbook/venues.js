/* ============================================
   BeerBook — Venue detail modal
   ============================================ */

const Venues = {
    currentVenueId: null,
    venueData: null,
    priceLogs: [],

    DAYS: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],

    init() {
        document.getElementById('venue-modal-close')?.addEventListener('click', () => this.close());
        document.getElementById('venue-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'venue-modal') this.close();
        });
        document.getElementById('app')?.addEventListener('click', (e) => {
            if (e.target.closest('.venue-confirm-price')) {
                e.preventDefault();
                this.confirmPrice(e.target.dataset.venueId, e.target.dataset.priceId);
            }
            if (e.target.closest('.venue-confirm-hh')) {
                e.preventDefault();
                this.confirmHappyHour(e.target.dataset.venueId, e.target.dataset.hhId);
            }
            if (e.target.closest('#venue-log-price-submit')) {
                e.preventDefault();
                this.submitLogPrice(e);
            }
            if (e.target.closest('#venue-add-hh-submit')) {
                e.preventDefault();
                this.submitAddHappyHour(e);
            }
        });
    },

    async openDetail(venueId) {
        if (!venueId) return;
        this.currentVenueId = venueId;
        const modal = document.getElementById('venue-modal');
        const body = document.getElementById('venue-modal-body');
        if (!modal || !body) return;
        body.innerHTML = '<p class="venue-loading">Loading…</p>';
        modal.style.display = 'flex';
        try {
            const [venue, pricesRes] = await Promise.all([
                DB.getVenue(venueId),
                DB.isDemo ? { data: [] } : DB.getVenuePrices(venueId)
            ]);
            if (!venue) {
                body.innerHTML = '<p>Venue not found.</p>';
                return;
            }
            this.venueData = venue;
            this.priceLogs = (pricesRes && pricesRes.data) ? pricesRes.data : (venue.prices || []);
            this.render(body);
        } catch (err) {
            console.error('Venue load failed:', err);
            body.innerHTML = '<p>Failed to load venue.</p>';
        }
    },

    close() {
        document.getElementById('venue-modal').style.display = 'none';
        this.currentVenueId = null;
        this.venueData = null;
    },

    staleText(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        const now = new Date();
        const days = Math.floor((now - d) / (24 * 60 * 60 * 1000));
        if (days < 90) return null;
        if (days < 365) return `${Math.floor(days / 30)} months ago`;
        return `${Math.floor(days / 365)} years ago`;
    },

    render(body) {
        const v = this.venueData;
        const prices = this.priceLogs;
        const hhList = (v.happy_hours || []).slice();
        const ratings = (v.ratings || []).slice();
        const lastPriceStale = prices.length ? this.staleText(prices[0].logged_at) : null;
        const lastHHStale = hhList.length ? this.staleText(hhList[0].last_confirmed_at || hhList[0].reported_at) : null;

        let html = `
            <h2 id="venue-modal-title" class="venue-modal-name">${Utils.escapeHtml(v.name || 'Venue')}</h2>
            ${v.address ? `<p class="venue-address">📍 ${Utils.escapeHtml(v.address)}</p>` : ''}
            <div class="venue-section">
                <h3>🍺 Beer Menu</h3>
                <ul class="venue-menu-list">`;
        const seenBeer = {};
        (prices || []).forEach(p => {
            const key = (p.beer_name || '').toLowerCase();
            if (seenBeer[key]) return;
            seenBeer[key] = true;
            const priceStr = p.price_cents ? `$${(p.price_cents / 100).toFixed(2)}` : '—';
            const hhBadge = p.is_happy_hour ? ' 🟢' : '';
            const confirmBtn = p.id && !DB.isDemo ? `<button type="button" class="btn btn-sm btn-ghost venue-confirm-price" data-venue-id="${v.id}" data-price-id="${p.id}">✓ Confirm</button>` : '';
            html += `<li class="venue-menu-row">
                <span class="venue-menu-beer">${Utils.escapeHtml(p.beer_name || '')}</span>
                <span class="venue-menu-price">${priceStr}${hhBadge}</span>
                ${confirmBtn}
            </li>`;
        });
        html += `
                </ul>
                <div class="venue-log-price-form">
                    <button type="button" class="btn btn-ghost btn-sm" id="venue-log-price-toggle">+ Log a Price</button>
                    <div id="venue-log-price-fields" class="venue-form-fields" style="display:none;">
                        <input type="text" id="venue-log-beer" placeholder="Beer name" class="form-group">
                        <input type="text" id="venue-log-amount" placeholder="$6.50" class="form-group">
                        <label><input type="checkbox" id="venue-log-hh"> Happy hour</label>
                        <button type="button" id="venue-log-price-submit" class="btn btn-primary btn-sm">Submit</button>
                    </div>
                </div>
            </div>
            <div class="venue-section">
                <h3>🕐 Happy Hours</h3>
                ${lastHHStale ? `<p class="venue-stale-warning">⚠️ Last confirmed ${lastHHStale}</p>` : ''}
                <ul class="venue-hh-list">`;
        hhList.forEach(hh => {
            const day = this.DAYS[Number(hh.day_of_week)] || '';
            const time = [hh.start_time, hh.end_time].filter(Boolean).join('–');
            const confirmBtn = hh.id && !DB.isDemo ? `<button type="button" class="btn btn-sm btn-ghost venue-confirm-hh" data-venue-id="${v.id}" data-hh-id="${hh.id}">✓ Confirm</button>` : '';
            html += `<li>${day}: ${Utils.escapeHtml(time)} ${hh.description ? `"${Utils.escapeHtml(hh.description)}"` : ''} ${confirmBtn}</li>`;
        });
        html += `
                </ul>
                <button type="button" class="btn btn-ghost btn-sm" id="venue-add-hh-toggle">+ Add Happy Hour</button>
                <div id="venue-add-hh-fields" class="venue-form-fields" style="display:none;">
                    <select id="venue-hh-day"><option value="0">Sun</option><option value="1">Mon</option><option value="2">Tue</option><option value="3">Wed</option><option value="4">Thu</option><option value="5">Fri</option><option value="6">Sat</option></select>
                    <input type="text" id="venue-hh-start" placeholder="16:00">
                    <input type="text" id="venue-hh-end" placeholder="18:00">
                    <input type="text" id="venue-hh-desc" placeholder="Description">
                    <button type="button" id="venue-add-hh-submit" class="btn btn-primary btn-sm">Add</button>
                </div>
            </div>
            <div class="venue-section">
                <h3>⭐ Ratings Here (${ratings.length} total)</h3>
                <div class="venue-ratings-list">`;
        ratings.slice(0, 10).forEach(r => {
            const ygBadge = (r.yg_value != null && r.yg_value > 0) ? ` <span class="yg-badge-pill">${r.yg_value} YG</span>` : '';
            html += `<div class="venue-rating-card">
                <strong>${Utils.escapeHtml(r.beer_name || '')}</strong> ${Utils.stars(r.rating || 0)}${ygBadge}
                <span class="venue-rating-meta">${Utils.escapeHtml(r.user_name || '')} · ${Utils.timeAgo(r.created_at)}</span>
            </div>`;
        });
        html += `</div></div>`;

        body.innerHTML = html;
        document.getElementById('venue-log-price-toggle')?.addEventListener('click', () => {
            const el = document.getElementById('venue-log-price-fields');
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        });
        document.getElementById('venue-add-hh-toggle')?.addEventListener('click', () => {
            const el = document.getElementById('venue-add-hh-fields');
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        });
    },

    async confirmPrice(venueId, priceId) {
        if (!DB.currentUser) { App.toast('Please sign in to confirm', 'info'); return; }
        try {
            await DB.confirmVenuePrice(venueId, priceId);
            App.toast('Confirmed! Thanks for keeping the data fresh.', 'success');
            const row = this.priceLogs.find(p => p.id === priceId);
            if (row) row.confirmed_count = (row.confirmed_count || 0) + 1;
            this.render(document.getElementById('venue-modal-body'));
        } catch (err) {
            App.toast('Confirm failed: ' + err.message, 'error');
        }
    },

    async confirmHappyHour(venueId, hhId) {
        if (!DB.currentUser) { App.toast('Please sign in to confirm', 'info'); return; }
        try {
            await DB.confirmVenueHappyHour(venueId, hhId);
            App.toast('Confirmed! Thanks for keeping the data fresh.', 'success');
            const hh = (this.venueData.happy_hours || []).find(h => h.id === hhId);
            if (hh) hh.confirmed_count = (hh.confirmed_count || 0) + 1;
            this.render(document.getElementById('venue-modal-body'));
        } catch (err) {
            App.toast('Confirm failed: ' + err.message, 'error');
        }
    },

    async submitLogPrice(e) {
        if (!DB.currentUser) { App.toast('Please sign in to log a price', 'info'); return; }
        const venueId = this.currentVenueId;
        const beer = document.getElementById('venue-log-beer')?.value?.trim();
        const amount = document.getElementById('venue-log-amount')?.value?.trim();
        const isHH = document.getElementById('venue-log-hh')?.checked;
        if (!beer || !amount) { App.toast('Beer name and price required', 'error'); return; }
        const cents = Math.round(parseFloat(amount.replace(/[^0-9.]/g, '')) * 100);
        if (cents < 1) { App.toast('Enter a valid price', 'error'); return; }
        try {
            await DB.addVenuePrice(venueId, { beer_name: beer, price_cents: cents, is_happy_hour: !!isHH });
            App.toast('Price logged', 'success');
            const res = await DB.getVenuePrices(venueId);
            this.priceLogs = (res && res.data) ? res.data : this.priceLogs;
            this.render(document.getElementById('venue-modal-body'));
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    },

    async submitAddHappyHour(e) {
        if (!DB.currentUser) { App.toast('Please sign in to add happy hour', 'info'); return; }
        const venueId = this.currentVenueId;
        const day = parseInt(document.getElementById('venue-hh-day')?.value, 10);
        const start = document.getElementById('venue-hh-start')?.value?.trim();
        const end = document.getElementById('venue-hh-end')?.value?.trim();
        const desc = document.getElementById('venue-hh-desc')?.value?.trim() || '';
        if (day == null || day < 0 || day > 6 || !start || !end) {
            App.toast('Day, start time, and end time required', 'error');
            return;
        }
        try {
            await DB.addVenueHappyHour(venueId, { day_of_week: day, start_time: start, end_time: end, description: desc });
            App.toast('Happy hour added', 'success');
            const venue = await DB.getVenue(venueId);
            if (venue) this.venueData = venue;
            this.render(document.getElementById('venue-modal-body'));
        } catch (err) {
            App.toast('Failed: ' + err.message, 'error');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Venues.init());
