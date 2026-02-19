/* ============================================
   BeerBook — Charts (Chart.js)
   ============================================ */

const Charts = {
    instances: {},

    // Chart.js global defaults
    init() {
        Chart.defaults.color = '#c98b0a';
        Chart.defaults.borderColor = 'rgba(61,42,20,0.6)';
        Chart.defaults.font.family = "'Source Sans 3', sans-serif";
        Chart.defaults.font.size = 12;
        Chart.defaults.plugins.legend.labels.boxWidth = 12;
        Chart.defaults.plugins.legend.labels.padding = 16;
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(26,16,6,0.95)';
        Chart.defaults.plugins.tooltip.borderColor = 'rgba(201,139,10,0.3)';
        Chart.defaults.plugins.tooltip.borderWidth = 1;
        Chart.defaults.plugins.tooltip.padding = 10;
        Chart.defaults.plugins.tooltip.cornerRadius = 8;
        Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
    },

    // Amber color palette for charts
    palette: [
        'rgba(230,168,23,0.85)',
        'rgba(201,139,10,0.85)',
        'rgba(184,115,51,0.85)',
        'rgba(124,179,66,0.85)',
        'rgba(160,108,8,0.85)',
        'rgba(244,195,90,0.85)',
        'rgba(122,81,6,0.85)',
        'rgba(85,139,47,0.85)',
        'rgba(253,240,213,0.85)',
        'rgba(80,53,5,0.85)',
    ],

    paletteSolid: [
        '#e6a817', '#c98b0a', '#b87333', '#7cb342', '#a06c08',
        '#f4c35a', '#7a5106', '#558b2f', '#fdf0d5', '#503505'
    ],

    // Destroy existing chart instance
    destroy(id) {
        if (this.instances[id]) {
            this.instances[id].destroy();
            delete this.instances[id];
        }
    },

    // ========== DASHBOARD CHARTS ==========

    renderTopBeers(ratings) {
        this.destroy('topBeers');
        const canvas = document.getElementById('chart-top-beers');
        if (!canvas) return;

        // Aggregate: avg rating per beer
        const beerMap = {};
        ratings.forEach(r => {
            const key = r.beer_name;
            if (!beerMap[key]) beerMap[key] = { sum: 0, count: 0 };
            beerMap[key].sum += r.rating;
            beerMap[key].count++;
        });

        const sorted = Object.entries(beerMap)
            .map(([name, { sum, count }]) => ({ name, avg: sum / count, count }))
            .filter(b => b.count >= 1)
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 8);

        this.instances['topBeers'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: sorted.map(b => b.name.length > 18 ? b.name.slice(0, 16) + '…' : b.name),
                datasets: [{
                    label: 'Avg Rating',
                    data: sorted.map(b => +b.avg.toFixed(2)),
                    backgroundColor: this.palette.slice(0, sorted.length),
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 40
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            afterLabel: (ctx) => `${sorted[ctx.dataIndex].count} review(s)`
                        }
                    }
                },
                scales: {
                    x: { min: 0, max: 5, grid: { display: false } },
                    y: { grid: { display: false } }
                }
            }
        });
    },

    renderStylesChart(ratings) {
        this.destroy('styles');
        const canvas = document.getElementById('chart-styles');
        if (!canvas) return;

        const styleCounts = Utils.countBy(ratings, 'style');
        const sorted = Object.entries(styleCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

        this.instances['styles'] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: sorted.map(s => s[0]),
                datasets: [{
                    data: sorted.map(s => s[1]),
                    backgroundColor: this.palette.slice(0, sorted.length),
                    borderColor: '#2a1c0d',
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { padding: 12, font: { size: 11 } }
                    }
                }
            }
        });
    },

    renderDistribution(ratings) {
        this.destroy('distribution');
        const canvas = document.getElementById('chart-distribution');
        const wrapper = canvas && canvas.closest('.chart-wrapper');
        const emptyEl = document.getElementById('chart-distribution-empty');
        if (!canvas) return;

        const dist = [0, 0, 0, 0, 0];
        (ratings || []).forEach(r => {
            if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1]++;
        });
        const hasAny = dist.some(d => d > 0);
        if (!hasAny && wrapper && emptyEl) {
            wrapper.classList.add('empty');
            emptyEl.style.display = 'flex';
            return;
        }
        if (wrapper) wrapper.classList.remove('empty');
        if (emptyEl) emptyEl.style.display = 'none';

        this.instances['distribution'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: ['1 ★', '2 ★', '3 ★', '4 ★', '5 ★'],
                datasets: [{
                    label: 'Reviews',
                    data: dist,
                    backgroundColor: [
                        'rgba(239,83,80,0.7)',
                        'rgba(255,167,38,0.7)',
                        'rgba(255,238,88,0.7)',
                        'rgba(124,179,66,0.7)',
                        'rgba(230,168,23,0.9)'
                    ],
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 50
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        grid: { color: 'rgba(61,42,20,0.3)' }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    renderActivity(ratings) {
        this.destroy('activity');
        const canvas = document.getElementById('chart-activity');
        if (!canvas) return;

        // Group by day for last 14 days
        const now = new Date();
        const days = [];
        const counts = [];

        for (let i = 13; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            days.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            counts.push(ratings.filter(r => r.created_at && r.created_at.startsWith(key)).length);
        }

        this.instances['activity'] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: days,
                datasets: [{
                    label: 'Reviews',
                    data: counts,
                    borderColor: '#e6a817',
                    backgroundColor: 'rgba(230,168,23,0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#e6a817',
                    pointBorderColor: '#1a1006',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        grid: { color: 'rgba(61,42,20,0.3)' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { maxTicksLimit: 7 }
                    }
                }
            }
        });
    },

    // ========== PROFILE CHART ==========

    renderMyRatings(ratings) {
        this.destroy('myRatings');
        const canvas = document.getElementById('chart-my-ratings');
        if (!canvas) return;

        const sorted = [...ratings].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const labels = sorted.map(r => r.beer_name.length > 12 ? r.beer_name.slice(0, 10) + '…' : r.beer_name);
        const data = sorted.map(r => r.rating);

        this.instances['myRatings'] = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'My Rating',
                    data,
                    borderColor: '#e6a817',
                    backgroundColor: 'rgba(230,168,23,0.15)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#e6a817',
                    pointBorderColor: '#1a1006',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => sorted[items[0].dataIndex]?.beer_name || '',
                            afterLabel: (ctx) => sorted[ctx.dataIndex]?.style || ''
                        }
                    }
                },
                scales: {
                    y: { min: 0, max: 5, ticks: { stepSize: 1 }, grid: { color: 'rgba(61,42,20,0.3)' } },
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }
                }
            }
        });
    },

    renderMonthly(ratings) {
        this.destroy('monthly');
        const canvas = document.getElementById('chart-monthly');
        const wrapper = canvas && canvas.closest('.chart-wrapper');
        const emptyEl = document.getElementById('chart-monthly-empty');
        if (!canvas) return;
        const byMonth = {};
        (ratings || []).forEach(r => {
            if (!r.created_at) return;
            const key = r.created_at.slice(0, 7);
            byMonth[key] = (byMonth[key] || 0) + 1;
        });
        const sorted = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
        if (sorted.length < 2) {
            if (wrapper) wrapper.classList.add('empty');
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }
        if (wrapper) wrapper.classList.remove('empty');
        if (emptyEl) emptyEl.style.display = 'none';
        this.instances['monthly'] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: sorted.map(s => s[0]),
                datasets: [{
                    label: 'Ratings',
                    data: sorted.map(s => s[1]),
                    borderColor: '#e6a817',
                    backgroundColor: 'rgba(230,168,23,0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(61,42,20,0.3)' } },
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }
                }
            }
        });
    },

    renderYgDistribution(ratings) {
        this.destroy('ygDist');
        const canvas = document.getElementById('chart-yg');
        const wrapper = canvas && canvas.closest('.chart-wrapper');
        const emptyEl = document.getElementById('chart-yg-empty');
        if (!canvas) return;
        const ygValues = (ratings || []).map(r => r.yg_value).filter(v => v != null && Number.isFinite(v));
        if (ygValues.length === 0) {
            if (wrapper) wrapper.classList.add('empty');
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }
        const buckets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const counts = buckets.map(() => 0);
        ygValues.forEach(v => {
            const i = Math.max(0, Math.min(12, Math.round(Number(v))));
            counts[i]++;
        });
        if (wrapper) wrapper.classList.remove('empty');
        if (emptyEl) emptyEl.style.display = 'none';
        this.instances['ygDist'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: buckets.map(b => b + ' YG'),
                datasets: [{
                    label: 'Ratings',
                    data: counts,
                    backgroundColor: this.palette.slice(0, counts.length),
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 36
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(61,42,20,0.3)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    // ========== DASHBOARD: SUMMARIES + LAZY RENDER ==========

    // Summary element IDs (chart card id -> summary paragraph id)
    _dashboardSummaryIds: {
        activity: 'chart-summary-activity',
        topBeers: 'chart-summary-top-beers',
        styles: 'chart-summary-styles',
        distribution: 'chart-summary-distribution',
        ygDist: 'chart-summary-yg',
        monthly: 'chart-summary-monthly'
    },

    setDashboardSummaries(ratings) {
        const r = ratings || [];
        const set = (chartId, text, isEmpty) => {
            const id = this._dashboardSummaryIds[chartId];
            const el = id ? document.getElementById(id) : null;
            const card = document.querySelector(`[data-chart-id="${chartId}"]`);
            if (el) el.textContent = text;
            if (card) {
                if (isEmpty) card.classList.add('chart-card--empty');
                else card.classList.remove('chart-card--empty');
            }
        };

        // Recent Activity (14 days)
        const now = new Date();
        let activityCount = 0;
        for (let i = 0; i < 14; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            activityCount += r.filter(x => x.created_at && x.created_at.startsWith(key)).length;
        }
        set('activity', activityCount ? `${activityCount} rating${activityCount === 1 ? '' : 's'} in the last 14 days` : 'Rate more beers to see this chart', !activityCount);

        // Top Rated Beers
        const beerMap = {};
        r.forEach(x => { beerMap[x.beer_name] = (beerMap[x.beer_name] || 0) + 1; });
        const topCount = Object.keys(beerMap).length;
        set('topBeers', topCount ? `Top ${Math.min(8, topCount)} by avg rating` : 'Rate more beers to see this chart', !topCount);

        // Ratings by Style
        const styleCounts = Utils.countBy(r, 'style');
        const topStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0];
        set('styles', topStyle ? `Most rated: ${topStyle[0]}` : 'Rate more beers to see this chart', !topStyle);

        // Rating Distribution
        const distCount = r.filter(x => x.rating >= 1 && x.rating <= 5).length;
        set('distribution', distCount ? 'Spread across 1–5 stars' : 'Rate more beers to see this chart', !distCount);

        // YG Distribution
        const ygVals = r.map(x => x.yg_value).filter(v => v != null && Number.isFinite(v));
        set('ygDist', ygVals.length ? `${ygVals.length} rating${ygVals.length === 1 ? '' : 's'} with YG values` : 'Rate more beers to see this chart', !ygVals.length);

        // Monthly Activity
        const byMonth = {};
        r.forEach(x => { if (x.created_at) byMonth[x.created_at.slice(0, 7)] = (byMonth[x.created_at.slice(0, 7)] || 0) + 1; });
        const monthCount = Object.keys(byMonth).length;
        set('monthly', monthCount >= 2 ? `${monthCount} months of data` : 'Rate more beers to see this chart', monthCount < 2);
    },

    renderChartIfNeeded(chartId, ratings) {
        if (this.instances[chartId]) return;
        const r = ratings || [];
        switch (chartId) {
            case 'activity': this.renderActivity(r); break;
            case 'topBeers': this.renderTopBeers(r); break;
            case 'styles': this.renderStylesChart(r); break;
            case 'distribution': this.renderDistribution(r); break;
            case 'monthly': this.renderMonthly(r); break;
            case 'ygDist': this.renderYgDistribution(r); break;
            default: break;
        }
    },

    renderDashboard(ratings) {
        this.setDashboardSummaries(ratings);
    },

    // ========== PROFILE MODAL CHARTS (scoped to user ratings) ==========

    renderProfileDistribution(ratings, canvasId) {
        this.destroy('profileDist');
        const canvas = document.getElementById(canvasId);
        if (!canvas || !ratings || ratings.length < 3) return;
        const dist = [0, 0, 0, 0, 0];
        ratings.forEach((r) => {
            if (r.rating >= 1 && r.rating <= 5) dist[Math.round(r.rating) - 1]++;
        });
        this.instances['profileDist'] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: ['1 ★', '2 ★', '3 ★', '4 ★', '5 ★'],
                datasets: [{
                    label: 'Reviews',
                    data: dist,
                    backgroundColor: ['rgba(239,83,80,0.7)', 'rgba(255,167,38,0.7)', 'rgba(255,238,88,0.7)', 'rgba(124,179,66,0.7)', 'rgba(230,168,23,0.9)'],
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(61,42,20,0.3)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    renderProfileStyleDoughnut(ratings, canvasId) {
        this.destroy('profileStyle');
        const canvas = document.getElementById(canvasId);
        if (!canvas || !ratings || ratings.length < 3) return;
        const styleCounts = Utils.countBy(ratings, 'style');
        const sorted = Object.entries(styleCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
        this.instances['profileStyle'] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: sorted.map((s) => s[0]),
                datasets: [{
                    data: sorted.map((s) => s[1]),
                    backgroundColor: this.palette.slice(0, sorted.length),
                    borderColor: '#2a1c0d',
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: { legend: { position: 'right', labels: { padding: 8, font: { size: 10 } } } }
            }
        });
    },

    renderProfileMonthly(ratings, canvasId) {
        this.destroy('profileMonthly');
        const canvas = document.getElementById(canvasId);
        if (!canvas || !ratings || ratings.length < 2) return;
        const byMonth = {};
        ratings.forEach((r) => {
            if (!r.created_at) return;
            const key = r.created_at.slice(0, 7);
            byMonth[key] = (byMonth[key] || 0) + 1;
        });
        const sorted = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
        this.instances['profileMonthly'] = new Chart(canvas, {
            type: 'line',
            data: {
                labels: sorted.map((s) => s[0]),
                datasets: [{
                    label: 'Ratings',
                    data: sorted.map((s) => s[1]),
                    borderColor: '#e6a817',
                    backgroundColor: 'rgba(230,168,23,0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(61,42,20,0.3)' } },
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }
                }
            }
        });
    },

    renderProfileFlavorRadar(ratings, canvasId) {
        this.destroy('profileFlavor');
        const canvas = document.getElementById(canvasId);
        if (!canvas || !ratings || ratings.length < 1) return;
        const labels = ['Hoppy', 'Malty', 'Bitter', 'Sweet', 'Fruity'];
        const keys = ['flavor_hoppy', 'flavor_malty', 'flavor_bitter', 'flavor_sweet', 'flavor_fruity'];
        const sums = [0, 0, 0, 0, 0];
        ratings.forEach((r) => {
            keys.forEach((k, i) => { sums[i] += (Number(r[k]) || 0); });
        });
        const data = sums.map((s) => (ratings.length ? Math.round((s / ratings.length) * 100) / 100 : 0));
        this.instances['profileFlavor'] = new Chart(canvas, {
            type: 'radar',
            data: {
                labels,
                datasets: [{
                    label: 'Avg flavor',
                    data,
                    borderColor: '#e6a817',
                    backgroundColor: 'rgba(230,168,23,0.2)',
                    pointBackgroundColor: '#e6a817',
                    pointBorderColor: '#1a1006',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: { min: 0, max: 5, ticks: { stepSize: 1 } }
                },
                plugins: { legend: { display: false } }
            }
        });
    },
};
