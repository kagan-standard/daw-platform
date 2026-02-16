/* ============================================
   BeerBook — YG Exchange view
   ============================================ */

const Exchange = {
    data: [],
    sortCol: 'yg_rate',
    sortDir: 'desc',
    YUG_BEER_NAME: 'Yuengling Golden Pilsner',
    isLoading: false,

    async init() {
        document.querySelectorAll('.nav-btn, .mobile-nav-item').forEach(btn => {
            if (btn.dataset.view === 'exchange') {
                btn.addEventListener('click', () => this.load());
            }
        });
        document.querySelectorAll('#exchange-table th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.sort(th.dataset.sort));
        });
        document.getElementById('cross-beer-a')?.addEventListener('change', () => this.updateCrossRate());
        document.getElementById('cross-beer-b')?.addEventListener('change', () => this.updateCrossRate());
    },

    async load() {
        if (this.isLoading) return;
        this.isLoading = true;

        const wrap = document.getElementById('exchange-table-wrap');
        const skeleton = document.getElementById('exchange-skeleton');
        const emptyEl = document.getElementById('exchange-empty');
        const table = document.getElementById('exchange-table');
        const tbody = document.getElementById('exchange-tbody');
        if (!wrap || !tbody) {
            this.isLoading = false;
            return;
        }

        if (skeleton) skeleton.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';
        table?.setAttribute('aria-hidden', 'true');

        try {
            const res = DB.isDemo ? { data: [], pagination: { total: 0 } } : await DB.getExchange();
            this.data = (res && res.data) ? res.data : [];
            const total = (res && res.pagination && res.pagination.total != null) ? res.pagination.total : this.data.length;

            if (skeleton) skeleton.style.display = 'none';

            if (!this.data.length || total === 0) {
                if (emptyEl) {
                    emptyEl.innerHTML = '<p class="exchange-empty-title">📈 The Exchange is quiet.</p><p>Rate some beers with YG values to see the market come alive!</p><p class="exchange-empty-hint">YG = Yuengling Golden Pilsner. It\'s the baseline. Rate how many YGs each beer is worth.</p>';
                    emptyEl.style.display = 'block';
                }
                table?.setAttribute('aria-hidden', 'true');
                this.renderCrossRateDropdowns([]);
                document.getElementById('exchange-parity-text').textContent = 'Add beer prices to unlock the YG Parity Index!';
                return;
            }

            table?.setAttribute('aria-hidden', 'false');
            this.applySort();
            this.renderTable();
            this.renderCrossRateDropdowns(this.data);
            this.updateCrossRate();
            this.renderParity();
        } catch (err) {
            console.error('Exchange load failed:', err);
            if (skeleton) skeleton.style.display = 'none';
            if (emptyEl) {
                emptyEl.innerHTML = '<p>Failed to load exchange data.</p>';
                emptyEl.style.display = 'block';
            }
        } finally {
            this.isLoading = false;
        }
    },

    sort(col) {
        if (this.sortCol === col) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        else { this.sortCol = col; this.sortDir = col === 'beer_name' ? 'asc' : 'desc'; }
        this.applySort();
        this.renderTable();
    },

    applySort() {
        const dir = this.sortDir === 'asc' ? 1 : -1;
        this.data.sort((a, b) => {
            if (this.sortCol === 'beer_name') {
                return dir * (a.beer_name || '').localeCompare(b.beer_name || '');
            }
            if (this.sortCol === 'yg_rate') {
                return dir * ((Number(a.yg_rate) || 0) - (Number(b.yg_rate) || 0));
            }
            if (this.sortCol === 'avg_stars') {
                return dir * ((Number(a.avg_stars) || 0) - (Number(b.avg_stars) || 0));
            }
            if (this.sortCol === 'rating_count') {
                return dir * ((Number(a.rating_count) || 0) - (Number(b.rating_count) || 0));
            }
            return 0;
        });
    },

    trendSymbol(row) {
        const name = (row.beer_name || '').trim();
        if (name.toLowerCase() === this.YUG_BEER_NAME.toLowerCase()) return { sym: '🔒', cls: 'trend-lock' };
        return { sym: '—', cls: 'trend-neutral' };
    },

    renderTable() {
        const tbody = document.getElementById('exchange-tbody');
        if (!tbody) return;
        tbody.innerHTML = this.data.map(row => {
            const name = (row.beer_name || '').trim();
            const isYug = name.toLowerCase() === this.YUG_BEER_NAME.toLowerCase();
            const ygRate = isYug ? '1.0' : (Number(row.yg_rate) != null ? Number(row.yg_rate).toFixed(1) : '—');
            const stars = isYug ? '🔒' : (row.avg_stars != null ? Number(row.avg_stars).toFixed(1) : '—');
            const trend = this.trendSymbol(row);
            const count = isYug ? '—' : (row.rating_count != null ? row.rating_count : '—');
            return `<tr>
                <td class="exchange-beer">${Utils.escapeHtml(name)}</td>
                <td class="exchange-num">${ygRate} YG</td>
                <td class="exchange-num">${stars}</td>
                <td class="exchange-trend ${trend.cls}">${trend.sym}</td>
                <td class="exchange-num">${count}</td>
            </tr>`;
        }).join('');
    },

    renderCrossRateDropdowns(rows) {
        const opt = '<option value="">Select beer…</option>' + rows.map(r => {
            const name = (r.beer_name || '').trim();
            return `<option value="${Utils.escapeHtml(name)}">${Utils.escapeHtml(name)}</option>`;
        }).join('');
        const a = document.getElementById('cross-beer-a');
        const b = document.getElementById('cross-beer-b');
        if (a) { a.innerHTML = opt; }
        if (b) { b.innerHTML = opt; }
    },

    updateCrossRate() {
        const aSelect = document.getElementById('cross-beer-a');
        const bSelect = document.getElementById('cross-beer-b');
        const valueEl = document.getElementById('cross-rate-value');
        const reverseEl = document.getElementById('cross-rate-reverse');
        if (!aSelect || !bSelect || !valueEl) return;
        const beerA = aSelect.value;
        const beerB = bSelect.value;
        if (!beerA || !beerB) {
            valueEl.textContent = '—';
            if (reverseEl) reverseEl.textContent = '';
            return;
        }
        const rowA = this.data.find(r => (r.beer_name || '').trim() === beerA);
        const rowB = this.data.find(r => (r.beer_name || '').trim() === beerB);
        const ygA = rowA ? Number(rowA.yg_rate) : 0;
        const ygB = rowB ? Number(rowB.yg_rate) : 0;
        if (ygB === 0) {
            valueEl.textContent = '—';
            if (reverseEl) reverseEl.textContent = '';
            return;
        }
        const rate = ygA / ygB;
        valueEl.textContent = `1 ${beerA} = ${rate.toFixed(2)} ${beerB}`;
        if (reverseEl) {
            const rev = ygB / ygA;
            reverseEl.textContent = ygA > 0 ? `1 ${beerB} = ${rev.toFixed(2)} ${beerA}` : '';
        }
    },

    renderParity() {
        const el = document.getElementById('exchange-parity-text');
        if (!el) return;
        el.textContent = 'Add beer prices to unlock the YG Parity Index!';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof App !== 'undefined' && App.currentView) {
        Exchange.init();
    } else {
        document.addEventListener('app-ready', () => Exchange.init());
    }
});
