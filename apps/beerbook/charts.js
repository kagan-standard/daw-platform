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
        if (!canvas) return;

        const dist = [0, 0, 0, 0, 0];
        ratings.forEach(r => {
            if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1]++;
        });

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

    // ========== RENDER ALL DASHBOARD CHARTS ==========

    renderDashboard(ratings) {
        this.renderTopBeers(ratings);
        this.renderStylesChart(ratings);
        this.renderDistribution(ratings);
        this.renderActivity(ratings);
    }
};
