/* ============================================
   BeerBook — Main Application (Keycloak SSO)
   ============================================ */

const App = {
    currentView: 'dashboard',
    allRatings: [],

    // ========== INIT ==========
    async init() {
        Charts.init();
        await DB.init();

        // Show config screen if not configured and not demo
        if (!DB.hasConfig()) {
            document.getElementById('setup-config').style.display = 'block';
            document.getElementById('login-card').style.display = 'none';
        }

        // Check session (handles OIDC callback too)
        const user = await DB.getSession();
        if (user) {
            this.enterApp();
        }

        this.bindEvents();
    },

    // ========== EVENT BINDING ==========
    bindEvents() {
        // Config form
        document.getElementById('config-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const kcAuthority = document.getElementById('kc-authority').value.trim();
            const kcClientId = document.getElementById('kc-client-id').value.trim() || 'beerbook';
            const sbUrl = document.getElementById('sb-url').value.trim();
            const sbKey = document.getElementById('sb-key').value.trim();

            if (!kcAuthority) {
                Utils.toast('Keycloak Realm URL is required', 'error');
                return;
            }

            DB.saveConfig(sbUrl, sbKey, kcAuthority, kcClientId);
            await DB.init();

            document.getElementById('setup-config').style.display = 'none';
            document.getElementById('login-card').style.display = 'block';
            Utils.toast('Configuration saved!', 'success');
        });

        document.getElementById('skip-config')?.addEventListener('click', () => {
            DB.isDemo = true;
            document.getElementById('setup-config').style.display = 'none';
            document.getElementById('login-card').style.display = 'block';
        });

        document.getElementById('show-config')?.addEventListener('click', () => {
            document.getElementById('login-card').style.display = 'none';
            document.getElementById('setup-config').style.display = 'block';
        });

        // SSO buttons
        document.getElementById('sso-login')?.addEventListener('click', () => {
            DB.startLogin();
        });

        document.getElementById('sso-register')?.addEventListener('click', () => {
            DB.startRegistration();
        });

        // Demo login
        document.getElementById('demo-login')?.addEventListener('click', () => {
            DB.enterDemoMode();
            Utils.toast('Welcome to Demo Mode! Data saved locally.', 'info');
            this.enterApp();
        });

        // Logout
        document.getElementById('logout-btn')?.addEventListener('click', async () => {
            await DB.signOut();
            // If signOut didn't redirect (demo mode), show auth screen
            document.getElementById('app').style.display = 'none';
            document.getElementById('auth-screen').style.display = 'flex';
        });

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.navigate(btn.dataset.view));
        });

        // Star rating
        const starContainer = document.getElementById('star-rating');
        if (starContainer) {
            starContainer.querySelectorAll('.star').forEach(star => {
                star.addEventListener('click', () => {
                    const val = parseInt(star.dataset.value);
                    document.getElementById('beer-rating').value = val;
                    document.getElementById('rating-label').textContent = Utils.ratingLabel(val);
                    starContainer.querySelectorAll('.star').forEach(s => {
                        s.classList.toggle('active', parseInt(s.dataset.value) <= val);
                    });
                });
                star.addEventListener('mouseenter', () => {
                    const val = parseInt(star.dataset.value);
                    starContainer.querySelectorAll('.star').forEach(s => {
                        s.classList.toggle('hover', parseInt(s.dataset.value) <= val);
                    });
                });
                star.addEventListener('mouseleave', () => {
                    starContainer.querySelectorAll('.star').forEach(s => s.classList.remove('hover'));
                });
            });
        }

        // Flavor sliders
        ['hoppy', 'malty', 'bitter', 'sweet', 'fruity'].forEach(flavor => {
            const slider = document.getElementById(`flavor-${flavor}`);
            const display = document.getElementById(`val-${flavor}`);
            if (slider && display) {
                slider.addEventListener('input', () => { display.textContent = slider.value; });
            }
        });

        // Rating form submit
        document.getElementById('rating-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ratingVal = parseInt(document.getElementById('beer-rating').value);
            if (!ratingVal) { Utils.toast('Please select a star rating', 'error'); return; }

            const rating = {
                beerName: document.getElementById('beer-name').value.trim(),
                brewery: document.getElementById('beer-brewery').value.trim(),
                style: document.getElementById('beer-style').value,
                abv: parseFloat(document.getElementById('beer-abv').value) || null,
                rating: ratingVal,
                flavors: {
                    hoppy: parseInt(document.getElementById('flavor-hoppy').value),
                    malty: parseInt(document.getElementById('flavor-malty').value),
                    bitter: parseInt(document.getElementById('flavor-bitter').value),
                    sweet: parseInt(document.getElementById('flavor-sweet').value),
                    fruity: parseInt(document.getElementById('flavor-fruity').value),
                },
                notes: document.getElementById('beer-notes').value.trim()
            };

            try {
                this.setLoading(e.target, true);
                await DB.addRating(rating);
                Utils.toast(`Rated "${rating.beerName}" ${Utils.stars(ratingVal)}`, 'success');
                e.target.reset();
                document.getElementById('beer-rating').value = '';
                document.getElementById('rating-label').textContent = 'Select a rating';
                document.querySelectorAll('#star-rating .star').forEach(s => s.classList.remove('active'));
                ['hoppy', 'malty', 'bitter', 'sweet', 'fruity'].forEach(f => {
                    document.getElementById(`val-${f}`).textContent = '0';
                });
                this.loadAllData();
            } catch (err) {
                Utils.toast('Failed to save: ' + err.message, 'error');
            } finally {
                this.setLoading(e.target, false);
            }
        });

        // Search & filters
        document.getElementById('search-input')?.addEventListener('input',
            Utils.debounce(() => this.renderBrowse(), 200));
        document.getElementById('filter-style')?.addEventListener('change', () => this.renderBrowse());
        document.getElementById('sort-by')?.addEventListener('change', () => this.renderBrowse());

        // Real-time
        DB.subscribeToRatings(() => this.loadAllData());
    },

    // ========== APP ENTRY ==========
    async enterApp() {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';

        const greeting = document.getElementById('user-greeting');
        if (greeting && DB.currentUser) {
            greeting.textContent = `Hey, ${DB.currentUser.display_name}!`;
        }

        await this.loadAllData();
        this.navigate('dashboard');
    },

    // ========== DATA LOADING ==========
    async loadAllData() {
        try {
            const stats = await DB.getStats();
            this.allRatings = stats.ratings;

            document.getElementById('stat-beers').textContent = stats.totalBeers;
            document.getElementById('stat-avg').textContent = stats.avgRating;
            document.getElementById('stat-users').textContent = stats.totalUsers;
            document.getElementById('stat-reviews').textContent = stats.totalReviews;

            Charts.renderDashboard(this.allRatings);
            this.renderRecentReviews();
            this.renderBrowse();
            this.renderLeaderboard();
            this.renderProfile();
            this.populateStyleFilter();
        } catch (err) {
            console.error('Failed to load data:', err);
            Utils.toast('Failed to load data', 'error');
        }
    },

    // ========== NAVIGATION ==========
    navigate(viewId) {
        this.currentView = viewId;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        const view = document.getElementById(`view-${viewId}`);
        const btn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);

        if (view) { view.classList.add('active'); view.style.animation = 'none'; view.offsetHeight; view.style.animation = ''; }
        if (btn) btn.classList.add('active');

        if (viewId === 'dashboard' || viewId === 'profile') {
            setTimeout(() => { Object.values(Charts.instances).forEach(c => c.resize()); }, 100);
        }
    },

    // ========== RENDERS ==========
    renderRecentReviews() {
        const container = document.getElementById('recent-reviews');
        const recent = this.allRatings.slice(0, 5);
        if (!recent.length) {
            container.innerHTML = '<p class="empty-state">No reviews yet. Be the first to rate a beer!</p>';
            return;
        }
        container.innerHTML = recent.map(r => `
            <div class="review-card">
                <div class="review-rating">${this.ratingEmoji(r.rating)}</div>
                <div class="review-content">
                    <div class="review-beer-name">${Utils.escapeHtml(r.beer_name)}</div>
                    <div class="review-meta">${Utils.escapeHtml(r.brewery || '')}${r.brewery && r.style ? ' · ' : ''}${Utils.escapeHtml(r.style || '')}${r.abv ? ` · ${r.abv}%` : ''}</div>
                    <div class="review-stars">${Utils.stars(r.rating)}</div>
                    ${r.notes ? `<div class="review-notes">${Utils.escapeHtml(Utils.truncate(r.notes, 150))}</div>` : ''}
                    <div class="review-user">— ${Utils.escapeHtml(r.user_name || 'Anonymous')} · ${Utils.timeAgo(r.created_at)}</div>
                </div>
            </div>
        `).join('');
    },

    renderBrowse() {
        const container = document.getElementById('beer-grid');
        const search = (document.getElementById('search-input')?.value || '').toLowerCase();
        const styleFilter = document.getElementById('filter-style')?.value || '';
        const sortBy = document.getElementById('sort-by')?.value || 'recent';

        let filtered = [...this.allRatings];
        if (search) filtered = filtered.filter(r =>
            r.beer_name.toLowerCase().includes(search) || (r.brewery || '').toLowerCase().includes(search) ||
            (r.style || '').toLowerCase().includes(search) || (r.notes || '').toLowerCase().includes(search));
        if (styleFilter) filtered = filtered.filter(r => r.style === styleFilter);

        switch (sortBy) {
            case 'highest': filtered.sort((a, b) => b.rating - a.rating); break;
            case 'lowest': filtered.sort((a, b) => a.rating - b.rating); break;
            case 'name': filtered.sort((a, b) => a.beer_name.localeCompare(b.beer_name)); break;
            default: filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        if (!filtered.length) { container.innerHTML = '<p class="empty-state">No beers match your search.</p>'; return; }

        container.innerHTML = filtered.map(r => `
            <div class="beer-card">
                <div class="beer-card-header">
                    <div class="beer-card-name">${Utils.escapeHtml(r.beer_name)}</div>
                    <div class="beer-card-rating">${r.rating.toFixed(1)}</div>
                </div>
                ${r.brewery ? `<div class="beer-card-brewery">${Utils.escapeHtml(r.brewery)}</div>` : ''}
                <div class="beer-card-details">
                    ${r.style ? `<span class="beer-card-tag">${Utils.escapeHtml(r.style)}</span>` : ''}
                    ${r.abv ? `<span class="beer-card-tag">${r.abv}% ABV</span>` : ''}
                </div>
                <div class="beer-card-stars">${Utils.stars(r.rating)}</div>
                ${r.notes ? `<div class="beer-card-notes">${Utils.escapeHtml(r.notes)}</div>` : ''}
                <div class="beer-card-footer">
                    <span>${Utils.escapeHtml(r.user_name || 'Anonymous')}</span>
                    <span>${Utils.timeAgo(r.created_at)}</span>
                </div>
            </div>
        `).join('');
    },

    renderLeaderboard() {
        const userCounts = Utils.countBy(this.allRatings, 'user_name');
        const topReviewers = Object.entries(userCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        document.getElementById('lb-reviewers').innerHTML = topReviewers.length
            ? topReviewers.map(([name, count], i) => `<div class="lb-row"><span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : (i+1)}</span><span class="lb-name">${Utils.escapeHtml(name)}</span><span class="lb-value">${count} reviews</span></div>`).join('')
            : '<p class="empty-state">No data yet</p>';

        const beerMap = {};
        this.allRatings.forEach(r => { const k = r.beer_name; if (!beerMap[k]) beerMap[k] = { sum: 0, count: 0 }; beerMap[k].sum += r.rating; beerMap[k].count++; });

        const topBeers = Object.entries(beerMap).map(([name, { sum, count }]) => ({ name, avg: sum / count, count })).sort((a, b) => b.avg - a.avg || b.count - a.count).slice(0, 10);
        document.getElementById('lb-beers').innerHTML = topBeers.length
            ? topBeers.map((b, i) => `<div class="lb-row"><span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : (i+1)}</span><span class="lb-name">${Utils.escapeHtml(b.name)}</span><span class="lb-value">${b.avg.toFixed(1)} ★</span></div>`).join('')
            : '<p class="empty-state">No data yet</p>';

        const styleMap = {};
        this.allRatings.forEach(r => { if (!r.style) return; if (!styleMap[r.style]) styleMap[r.style] = { sum: 0, count: 0 }; styleMap[r.style].sum += r.rating; styleMap[r.style].count++; });
        const topStyles = Object.entries(styleMap).map(([style, { sum, count }]) => ({ style, avg: sum / count, count })).sort((a, b) => b.avg - a.avg).slice(0, 10);
        document.getElementById('lb-styles').innerHTML = topStyles.length
            ? topStyles.map((s, i) => `<div class="lb-row"><span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : (i+1)}</span><span class="lb-name">${Utils.escapeHtml(s.style)}</span><span class="lb-value">${s.avg.toFixed(1)} ★ (${s.count})</span></div>`).join('')
            : '<p class="empty-state">No data yet</p>';

        const mostReviewed = Object.entries(beerMap).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
        document.getElementById('lb-popular').innerHTML = mostReviewed.length
            ? mostReviewed.map(([name, { count }], i) => `<div class="lb-row"><span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : (i+1)}</span><span class="lb-name">${Utils.escapeHtml(name)}</span><span class="lb-value">${count} reviews</span></div>`).join('')
            : '<p class="empty-state">No data yet</p>';
    },

    async renderProfile() {
        if (!DB.currentUser) return;
        document.getElementById('profile-name').textContent = DB.currentUser.display_name;
        document.getElementById('profile-email').textContent = DB.currentUser.email;
        document.getElementById('profile-avatar').textContent = Utils.initials(DB.currentUser.display_name) || '🍺';

        const myRatings = this.allRatings.filter(r => r.user_id === DB.currentUser.id);
        document.getElementById('pstat-total').textContent = myRatings.length;
        document.getElementById('badge-count').textContent = `${myRatings.length} reviews`;

        if (myRatings.length) {
            document.getElementById('pstat-avg').textContent = Utils.average(myRatings.map(r => r.rating)).toFixed(1);
            const styleCounts = Utils.countBy(myRatings, 'style');
            const favStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0];
            document.getElementById('pstat-fav').textContent = favStyle ? favStyle[0] : '—';
            Charts.renderMyRatings(myRatings);
        }

        const container = document.getElementById('my-reviews');
        if (!myRatings.length) {
            container.innerHTML = '<p class="empty-state">You haven\'t rated any beers yet!</p>';
            return;
        }
        container.innerHTML = myRatings.map(r => `
            <div class="review-card">
                <div class="review-rating">${this.ratingEmoji(r.rating)}</div>
                <div class="review-content">
                    <div class="review-beer-name">${Utils.escapeHtml(r.beer_name)}</div>
                    <div class="review-meta">${Utils.escapeHtml(r.brewery || '')}${r.brewery && r.style ? ' · ' : ''}${Utils.escapeHtml(r.style || '')}</div>
                    <div class="review-stars">${Utils.stars(r.rating)}</div>
                    ${r.notes ? `<div class="review-notes">${Utils.escapeHtml(r.notes)}</div>` : ''}
                    <div class="review-user">${Utils.timeAgo(r.created_at)}</div>
                </div>
            </div>
        `).join('');
    },

    // ========== HELPERS ==========
    populateStyleFilter() {
        const select = document.getElementById('filter-style');
        if (!select) return;
        const styles = [...new Set(this.allRatings.map(r => r.style).filter(Boolean))].sort();
        const current = select.value;
        select.innerHTML = '<option value="">All Styles</option>' +
            styles.map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join('');
    },

    ratingEmoji(rating) {
        if (rating >= 5) return '🤩';
        if (rating >= 4) return '😍';
        if (rating >= 3) return '😊';
        if (rating >= 2) return '😐';
        return '😞';
    },

    setLoading(form, loading) {
        const btn = form.querySelector('button[type="submit"]');
        if (!btn) return;
        const text = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.btn-loader');
        if (text) text.style.display = loading ? 'none' : '';
        if (loader) loader.style.display = loading ? '' : 'none';
        btn.disabled = loading;
    }
};

// ========== BOOT ==========
document.addEventListener('DOMContentLoaded', () => App.init());
