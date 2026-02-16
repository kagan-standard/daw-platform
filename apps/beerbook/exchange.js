/**
 * YG Exchange view — rate table, cross-rate calculator, portfolio
 * Bug fix: isLoading guard to prevent concurrent load (Fix 3); no redundant animationend listener.
 */
const Exchange = {
    isLoading: false,
    data: null,

    init() {
        this.bindEvents();
    },

    bindEvents() {
        document.querySelectorAll('.nav-btn[data-view="exchange"], .mobile-nav-item[data-view="exchange"]').forEach(btn => {
            btn.addEventListener('click', () => this.onShow());
        });
        // Fix 3: Do NOT add animationend listener — load is triggered by navigate() and click only, once per show.
    },

    onShow() {
        this.load();
    },

    /** Fix 3: Guard against concurrent calls from click, navigate(), and (removed) animationend. */
    async load() {
        if (this.isLoading) return;
        this.isLoading = true;

        const container = document.getElementById('exchange-table-body');
        if (container) container.innerHTML = '<tr><td colspan="5" class="empty-state">Loading…</td></tr>';

        try {
            if (DB && !DB.isDemo) {
                const res = await DB.getExchangeRates();
                this.data = (res && res.data) ? res.data : [];
            } else {
                this.data = [];
            }
            this.render();
        } catch (err) {
            if (typeof App !== 'undefined') App.toast('Failed to load exchange data', 'error');
            this.data = [];
            this.render();
        } finally {
            this.isLoading = false;
        }
    },

    render() {
        const container = document.getElementById('exchange-table-body');
        if (!container) return;
        if (!this.data || !this.data.length) {
            container.innerHTML = '<tr><td colspan="5" class="empty-state">📈 Rate some beers with YG values to see the exchange.</td></tr>';
            return;
        }
        container.innerHTML = this.data.slice(0, 50).map((row) => `
            <tr>
                <td>${typeof Utils !== 'undefined' ? Utils.escapeHtml(row.beer_name || '') : (row.beer_name || '')}</td>
                <td>${Number(row.yg_rate) != null ? Number(row.yg_rate).toFixed(1) : '—'} YG</td>
                <td>${row.avg_rating != null ? Number(row.avg_rating).toFixed(1) : '—'}</td>
                <td>—</td>
                <td>${row.rating_count != null ? row.rating_count : '—'}</td>
            </tr>
        `).join('');
    }
};

document.addEventListener('DOMContentLoaded', () => Exchange.init());
