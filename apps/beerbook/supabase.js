/* ============================================
   BeerBook — Keycloak (auth) + beerbook-api (data)
   Auth: Keycloak OIDC Authorization Code + PKCE
   Data: fetch() to api.beerbook.drinksafterwork.net (no direct Supabase)
   Demo: localStorage fallback
   ============================================ */

// In-memory cache for GET responses (key -> { data, time })
const _cache = new Map();
const CACHE_TTL = {
    stats: 60 * 1000,
    leaderboard: 60 * 1000,
    exchange: 60 * 1000,
    beerSearch: 30 * 1000,
    userProfile: 120 * 1000,
    map: 120 * 1000,
    activity: 60 * 1000,
};

function cachedFetch(key, ttlMs, fetchFn) {
    const cached = _cache.get(key);
    if (cached && Date.now() - cached.time < ttlMs) return Promise.resolve(cached.data);
    return fetchFn().then((data) => {
        _cache.set(key, { data, time: Date.now() });
        return data;
    });
}

function invalidateCache(prefix) {
    if (!prefix) {
        _cache.clear();
        return;
    }
    for (const k of _cache.keys()) {
        if (k.startsWith(prefix)) _cache.delete(k);
    }
}

const DB = {
    client: null,
    isDemo: false,
    currentUser: null,
    subscriptions: [],
    apiBaseUrl: '',

    oidc: {
        authority: '',
        clientId: 'beerbook',
        redirectUri: '',
        scopes: 'openid profile email',
        authEndpoint: '',
        tokenEndpoint: '',
        userinfoEndpoint: '',
        endSessionEndpoint: '',
    },

    async init() {
        this.oidc.redirectUri = window.location.origin + window.location.pathname;
        const baked = window.BEERBOOK_CONFIG;
        const kcConfig = Utils.storage.get('keycloak_config');

        if (baked?.keycloak) {
            this.oidc.authority = (baked.keycloak.authority || '').replace(/\/+$/, '');
            this.oidc.clientId = baked.keycloak.clientId || 'beerbook';
            this.apiBaseUrl = (baked.apiBaseUrl || '').replace(/\/+$/, '');
        }
        if (!this.oidc.authority && kcConfig?.authority) {
            this.oidc.authority = kcConfig.authority.replace(/\/+$/, '');
            this.oidc.clientId = kcConfig.clientId || 'beerbook';
        }
        if (baked?.apiBaseUrl) {
            this.apiBaseUrl = baked.apiBaseUrl.replace(/\/+$/, '');
        }

        if (this.oidc.authority) {
            await this._discoverOIDC();
        }

        if (!this.apiBaseUrl) {
            this.isDemo = true;
        }
    },

    async _discoverOIDC() {
        try {
            const res = await fetch(`${this.oidc.authority}/.well-known/openid-configuration`);
            if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
            const cfg = await res.json();
            this.oidc.authEndpoint = cfg.authorization_endpoint;
            this.oidc.tokenEndpoint = cfg.token_endpoint;
            this.oidc.userinfoEndpoint = cfg.userinfo_endpoint;
            this.oidc.endSessionEndpoint = cfg.end_session_endpoint;
            return true;
        } catch (e) {
            console.warn('OIDC discovery failed:', e.message);
            return false;
        }
    },

    saveConfig(sbUrl, sbKey, kcAuthority, kcClientId) {
        if (kcAuthority) {
            Utils.storage.set('keycloak_config', {
                authority: kcAuthority.replace(/\/+$/, ''),
                clientId: kcClientId || 'beerbook'
            });
        }
    },
    hasConfig() {
        return !!(this.oidc.authority || Utils.storage.get('keycloak_config')?.authority);
    },
    hasDataConfig() {
        return !!this.apiBaseUrl;
    },
    clearConfig() {
        Utils.storage.remove('keycloak_config');
    },

    _getAccessToken() {
        const tokens = Utils.storage.get('oidc_tokens');
        return tokens?.access_token || null;
    },

    async _api(method, path, opts = {}) {
        const url = `${this.apiBaseUrl}${path}`;
        const headers = { 'Content-Type': 'application/json', ...opts.headers };
        const token = this._getAccessToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(url, { method, headers, ...opts });
        const text = await res.text();
        let body;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        if (!res.ok) throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
        return body;
    },

    async _generatePKCE() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        const verifier = this._b64url(array);
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        const challenge = this._b64url(new Uint8Array(hash));
        return { verifier, challenge };
    },
    _b64url(buf) {
        return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },

    async startLogin() {
        if (!this.oidc.authEndpoint && !(await this._discoverOIDC())) {
            Utils.toast('Cannot connect to Keycloak.', 'error'); return;
        }
        const { verifier, challenge } = await this._generatePKCE();
        const state = Utils.uid();
        Utils.storage.set('oidc_verifier', verifier);
        Utils.storage.set('oidc_state', state);
        const params = new URLSearchParams({
            response_type: 'code', client_id: this.oidc.clientId,
            redirect_uri: this.oidc.redirectUri, scope: this.oidc.scopes,
            state, code_challenge: challenge, code_challenge_method: 'S256',
        });
        window.location.href = `${this.oidc.authEndpoint}?${params}`;
    },

    async startRegistration() {
        if (!this.oidc.authEndpoint && !(await this._discoverOIDC())) {
            Utils.toast('Cannot connect to Keycloak.', 'error'); return;
        }
        const { verifier, challenge } = await this._generatePKCE();
        const state = Utils.uid();
        Utils.storage.set('oidc_verifier', verifier);
        Utils.storage.set('oidc_state', state);
        const params = new URLSearchParams({
            response_type: 'code', client_id: this.oidc.clientId,
            redirect_uri: this.oidc.redirectUri, scope: this.oidc.scopes,
            state, code_challenge: challenge, code_challenge_method: 'S256',
        });
        window.location.href = `${this.oidc.authEndpoint}?${params}&kc_action=register`;
    },

    async handleOIDCCallback() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');
        if (error) {
            Utils.toast(`Login error: ${params.get('error_description') || error}`, 'error');
            window.history.replaceState({}, '', this.oidc.redirectUri);
            return null;
        }
        if (!code) return null;
        const savedState = Utils.storage.get('oidc_state');
        const verifier = Utils.storage.get('oidc_verifier');
        if (state !== savedState) {
            Utils.toast('Invalid auth state. Try again.', 'error');
            window.history.replaceState({}, '', this.oidc.redirectUri);
            return null;
        }
        try {
            if (!this.oidc.tokenEndpoint) await this._discoverOIDC();
            const tokenRes = await fetch(this.oidc.tokenEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'authorization_code', code,
                    redirect_uri: this.oidc.redirectUri,
                    client_id: this.oidc.clientId,
                    code_verifier: verifier,
                }).toString()
            });
            if (!tokenRes.ok) {
                const err = await tokenRes.json().catch(() => ({}));
                throw new Error(err.error_description || err.error || 'Token exchange failed');
            }
            const tokens = await tokenRes.json();
            Utils.storage.set('oidc_tokens', {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                id_token: tokens.id_token,
                expires_at: Date.now() + (tokens.expires_in * 1000)
            });
            const user = await this._getUserInfo(tokens.access_token);
            window.history.replaceState({}, '', this.oidc.redirectUri);
            Utils.storage.remove('oidc_verifier');
            Utils.storage.remove('oidc_state');
            this.currentUser = user;
            return user;
        } catch (e) {
            console.error('Token exchange failed:', e);
            Utils.toast('Auth failed: ' + e.message, 'error');
            window.history.replaceState({}, '', this.oidc.redirectUri);
            return null;
        }
    },

    async _getUserInfo(accessToken) {
        if (!this.oidc.userinfoEndpoint) await this._discoverOIDC();
        const res = await fetch(this.oidc.userinfoEndpoint, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!res.ok) throw new Error('Failed to fetch user info');
        const info = await res.json();
        return {
            id: info.sub,
            email: info.email || '',
            display_name: info.preferred_username || info.name || info.email?.split('@')[0] || 'Beer Lover',
            name: info.name || '',
            picture: info.picture || null,
        };
    },

    async _refreshToken() {
        const tokens = Utils.storage.get('oidc_tokens');
        if (!tokens?.refresh_token) return false;
        try {
            if (!this.oidc.tokenEndpoint) await this._discoverOIDC();
            const res = await fetch(this.oidc.tokenEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: tokens.refresh_token,
                    client_id: this.oidc.clientId,
                }).toString()
            });
            if (!res.ok) return false;
            const t = await res.json();
            Utils.storage.set('oidc_tokens', {
                access_token: t.access_token,
                refresh_token: t.refresh_token || tokens.refresh_token,
                id_token: t.id_token,
                expires_at: Date.now() + (t.expires_in * 1000)
            });
            return true;
        } catch { return false; }
    },

    async getSession() {
        if (this.isDemo || !this.hasConfig()) {
            const demo = Utils.storage.get('demo_user');
            if (demo) { this.currentUser = demo; this.isDemo = true; return demo; }
            return null;
        }
        const cbUser = await this.handleOIDCCallback();
        if (cbUser) return cbUser;
        const tokens = Utils.storage.get('oidc_tokens');
        if (!tokens) return null;
        if (tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
            if (!(await this._refreshToken())) { Utils.storage.remove('oidc_tokens'); return null; }
            const t = Utils.storage.get('oidc_tokens');
            this.currentUser = await this._getUserInfo(t.access_token);
            return this.currentUser;
        }
        try {
            this.currentUser = await this._getUserInfo(tokens.access_token);
            return this.currentUser;
        } catch {
            if (await this._refreshToken()) {
                const t = Utils.storage.get('oidc_tokens');
                this.currentUser = await this._getUserInfo(t.access_token);
                return this.currentUser;
            }
            Utils.storage.remove('oidc_tokens');
            return null;
        }
    },

    async signOut() {
        this.subscriptions.forEach(s => { if (s && typeof s === 'number') clearInterval(s); });
        this.subscriptions = [];
        const tokens = Utils.storage.get('oidc_tokens');
        this.currentUser = null;
        Utils.storage.remove('oidc_tokens');
        Utils.storage.remove('oidc_verifier');
        Utils.storage.remove('oidc_state');
        Utils.storage.remove('demo_user');
        if (this.oidc.endSessionEndpoint && tokens?.id_token) {
            const params = new URLSearchParams({
                id_token_hint: tokens.id_token,
                post_logout_redirect_uri: this.oidc.redirectUri,
            });
            window.location.href = `${this.oidc.endSessionEndpoint}?${params}`;
            return;
        }
    },

    enterDemoMode() {
        const user = {
            id: 'demo_' + Utils.uid(), email: 'tester@drinksafterwork.net',
            display_name: 'Beer Tester', name: 'Beer Tester',
        };
        this.currentUser = user; this.isDemo = true;
        Utils.storage.set('demo_user', user);
        return user;
    },

    async addRating(rating) {
        const record = {
            beerName: rating.beerName,
            brewery: rating.brewery || '',
            style: rating.style,
            abv: rating.abv || null,
            rating: rating.rating,
            flavors: rating.flavors || {},
            notes: rating.notes || '',
            yg_value: rating.yg_value ?? null,
            latitude: rating.latitude ?? null,
            longitude: rating.longitude ?? null,
            location_name: rating.location_name ?? null,
            venue_id: rating.venue_id ?? null,
            photo_url: rating.photo_url ?? null,
        };
        if (this.isDemo) {
            const rev = {
                id: Utils.uid(), user_id: this.currentUser.id, user_name: this.currentUser.display_name,
                beer_name: record.beerName, brewery: record.brewery, style: record.style,
                abv: record.abv, rating: record.rating,
                flavor_hoppy: record.flavors?.hoppy || 0, flavor_malty: record.flavors?.malty || 0,
                flavor_bitter: record.flavors?.bitter || 0, flavor_sweet: record.flavors?.sweet || 0,
                flavor_fruity: record.flavors?.fruity || 0,
                notes: record.notes || '', created_at: new Date().toISOString(),
                yg_value: record.yg_value, latitude: record.latitude, longitude: record.longitude,
                location_name: record.location_name, venue_id: record.venue_id, photo_url: record.photo_url
            };
            const reviews = Utils.storage.get('reviews', []);
            reviews.unshift(rev);
            Utils.storage.set('reviews', reviews);
            return rev;
        }
        const body = {
            beer_name: record.beerName,
            brewery: record.brewery,
            style: record.style,
            abv: record.abv,
            rating: record.rating,
            flavor_hoppy: record.flavor_hoppy ?? record.flavors?.hoppy ?? 0,
            flavor_malty: record.flavor_malty ?? record.flavors?.malty ?? 0,
            flavor_bitter: record.flavor_bitter ?? record.flavors?.bitter ?? 0,
            flavor_sweet: record.flavor_sweet ?? record.flavors?.sweet ?? 0,
            flavor_fruity: record.flavor_fruity ?? record.flavors?.fruity ?? 0,
            notes: record.notes,
            yg_value: record.yg_value,
            latitude: record.latitude,
            longitude: record.longitude,
            location_name: record.location_name,
            venue_id: record.venue_id,
            photo_url: record.photo_url,
        };
        const data = await this._api('POST', '/api/ratings', { body: JSON.stringify(body) });
        invalidateCache('');
        return data;
    },

    cacheInvalidate(prefix) {
        invalidateCache(prefix || '');
    },

    async getAllRatings() {
        if (this.isDemo) return Utils.storage.get('reviews', []);
        const out = await this._api('GET', '/api/ratings?limit=100&order=desc');
        return (out && out.data) ? out.data : [];
    },

    async getUserRatings(userId) {
        if (this.isDemo) return Utils.storage.get('reviews', []).filter(r => r.user_id === userId);
        const out = await this._api('GET', `/api/ratings/user/${encodeURIComponent(userId)}?limit=100&order=desc`);
        return (out && out.data) ? out.data : [];
    },

    async deleteRating(id) {
        if (this.isDemo) {
            const r = Utils.storage.get('reviews', []);
            Utils.storage.set('reviews', r.filter(x => x.id !== id));
            return true;
        }
        await this._api('DELETE', `/api/ratings/${encodeURIComponent(id)}`);
        invalidateCache('');
        return true;
    },

    async getStats() {
        if (this.isDemo) {
            const ratings = Utils.storage.get('reviews', []);
            const users = new Set(ratings.map(r => r.user_id));
            return {
                totalBeers: new Set(ratings.map(r => r.beer_name.toLowerCase())).size,
                totalReviews: ratings.length,
                totalUsers: users.size,
                avgRating: ratings.length ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1) : '0.0',
                ratings
            };
        }
        return cachedFetch('stats', CACHE_TTL.stats, async () => {
            const [statsRes, ratingsRes] = await Promise.all([
                this._api('GET', '/api/stats?limit=100'),
                this._api('GET', '/api/ratings?limit=100&order=desc')
            ]);
            const ratings = (ratingsRes && ratingsRes.data) ? ratingsRes.data : [];
            const summary = (statsRes && statsRes.summary) ? statsRes.summary : {};
            return {
                totalBeers: summary.totalBeers ?? new Set(ratings.map(r => r.beer_name?.toLowerCase())).size,
                totalReviews: summary.totalReviews ?? ratings.length,
                totalUsers: summary.totalUsers ?? new Set(ratings.map(r => r.user_id)).size,
                avgRating: summary.avgRating ?? (ratings.length ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1) : '0.0'),
                ratings
            };
        });
    },

    subscribeToRatings(callback) {
        if (this.isDemo) return;
        const interval = setInterval(callback, 5000);
        this.subscriptions.push(interval);
    },

    async getAllProfiles() {
        if (this.isDemo) {
            const reviews = Utils.storage.get('reviews', []);
            const m = {};
            reviews.forEach(r => {
                if (!m[r.user_id]) m[r.user_id] = { id: r.user_id, display_name: r.user_name, review_count: 0 };
                m[r.user_id].review_count++;
            });
            return Object.values(m);
        }
        const out = await this._api('GET', '/api/ratings?limit=500');
        const list = (out && out.data) ? out.data : [];
        const m = {};
        list.forEach(r => {
            if (!m[r.user_id]) m[r.user_id] = { id: r.user_id, display_name: r.user_name, review_count: 0 };
            m[r.user_id].review_count++;
        });
        return Object.values(m);
    },

    async searchBeers(q) {
        if (this.isDemo) return [];
        if (!q || q.length < 2) return [];
        const cacheKey = `beerSearch:${q.toLowerCase().trim()}`;
        return cachedFetch(cacheKey, CACHE_TTL.beerSearch, async () => {
            const out = await this._api('GET', `/api/beers/search?q=${encodeURIComponent(q)}`);
            return (out && out.data) ? out.data : [];
        });
    },

    async getVenuesCount() {
        if (this.isDemo) return 0;
        try {
            const out = await this._api('GET', '/api/venues?limit=1&offset=0');
            const total = (out && out.pagination && out.pagination.total != null) ? out.pagination.total : ((out && out.data) ? out.data.length : 0);
            return total;
        } catch { return 0; }
    },

    async getActivity() {
        if (this.isDemo) return { data: [] };
        try {
            return await cachedFetch('activity', CACHE_TTL.activity, () => this._api('GET', '/api/activity'));
        } catch { return { data: [] }; }
    },

    async getLeaderboard(period = 'alltime') {
        if (this.isDemo) return { top_reviewers: [], top_beers: [], top_yg_values: [], most_venues: [] };
        try {
            return await cachedFetch(`leaderboard:${period}`, CACHE_TTL.leaderboard, async () => {
                const out = await this._api('GET', `/api/leaderboard?period=${encodeURIComponent(period)}`);
                return out || { top_reviewers: [], top_beers: [], top_yg_values: [], most_venues: [] };
            });
        } catch { return { top_reviewers: [], top_beers: [], top_yg_values: [], most_venues: [] }; }
    },

    async getBeerOfTheWeek() {
        if (this.isDemo) return null;
        try {
            const out = await this._api('GET', '/api/highlights/beer-of-the-week');
            return (out && out.beer_name) ? out : null;
        } catch { return null; }
    },

    async uploadPhoto(file) {
        if (this.isDemo) return { url: null };
        const formData = new FormData();
        formData.append('file', file);
        const url = `${this.apiBaseUrl}/api/upload`;
        const headers = {};
        const token = this._getAccessToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(url, { method: 'POST', headers, body: formData });
        const text = await res.text();
        let body;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        if (!res.ok) throw new Error(body?.error || body?.message || `Upload failed: ${res.status}`);
        return body;
    },

    async createVenue(venue) {
        if (this.isDemo) return { id: 'demo_venue_' + Utils.uid(), name: venue.name };
        const out = await this._api('POST', '/api/venues', { body: JSON.stringify(venue) });
        return out;
    },

    async addVenuePrice(venueId, payload) {
        if (this.isDemo) return {};
        await this._api('POST', `/api/venues/${encodeURIComponent(venueId)}/prices`, { body: JSON.stringify(payload) });
        return {};
    },

    async getUserProfile(userId) {
        if (this.isDemo) return null;
        try {
            return await cachedFetch(`user:${userId}`, CACHE_TTL.userProfile, () => this._api('GET', `/api/users/${encodeURIComponent(userId)}`));
        } catch { return null; }
    },

    async getUserStats(userId) {
        if (this.isDemo) return null;
        try {
            return await cachedFetch(`userStats:${userId}`, CACHE_TTL.userProfile, () => this._api('GET', `/api/users/${encodeURIComponent(userId)}/stats`));
        } catch { return null; }
    },

    async getBeerDetail(beerName) {
        if (this.isDemo) return null;
        try {
            const key = `beer:${encodeURIComponent(beerName)}`;
            return await cachedFetch(key, CACHE_TTL.beerSearch, () => this._api('GET', `/api/beers/${encodeURIComponent(beerName)}`));
        } catch { return null; }
    },

    async getBeerCrossRates(beerName) {
        if (this.isDemo) return null;
        try {
            const out = await this._api('GET', `/api/exchange/${encodeURIComponent(beerName)}`);
            return out;
        } catch { return null; }
    },

    async getExchangeRates() {
        if (this.isDemo) return { data: [] };
        try {
            return await cachedFetch('exchange:rates', CACHE_TTL.exchange, () => this._api('GET', '/api/exchange?limit=50'));
        } catch { return { data: [] }; }
    },

    async getRatingCheers(ratingId) {
        if (this.isDemo) return { count: 0, users: [] };
        try {
            const out = await this._api('GET', `/api/ratings/${encodeURIComponent(ratingId)}/cheers`);
            return { count: out.count ?? 0, users: out.users ?? [] };
        } catch { return { count: 0, users: [] }; }
    },

    async toggleCheers(ratingId) {
        if (this.isDemo) return { action: 'added', count: 0 };
        const out = await this._api('POST', `/api/ratings/${encodeURIComponent(ratingId)}/cheers`);
        invalidateCache('activity');
        invalidateCache('leaderboard');
        return out;
    },

    async getMapUser(userId) {
        if (this.isDemo) return [];
        try {
            return await cachedFetch(`map:${userId}`, CACHE_TTL.map, async () => {
                const out = await this._api('GET', `/api/map/user/${encodeURIComponent(userId)}`);
                return (out && out.data) ? out.data : [];
            });
        } catch { return []; }
    },

    async getExchangePortfolio(userId) {
        if (this.isDemo) return { ratings: [], total_portfolio_value: 0 };
        try {
            return await cachedFetch(`portfolio:${userId}`, CACHE_TTL.exchange, async () => {
                const out = await this._api('GET', `/api/exchange/portfolio/${encodeURIComponent(userId)}`);
                return { ratings: (out && out.ratings) ? out.ratings : [], total_portfolio_value: out && out.total_portfolio_value != null ? out.total_portfolio_value : 0 };
            });
        } catch { return { ratings: [], total_portfolio_value: 0 }; }
    }
};
