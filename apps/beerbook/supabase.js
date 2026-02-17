/* ============================================
   BeerBook — Keycloak (auth) + beerbook-api (data)
   Auth: Keycloak OIDC Authorization Code + PKCE
   Data: fetch() to api.beerbook.drinksafterwork.net (no direct Supabase)
   Demo: localStorage fallback
   ============================================ */

const _cache = new Map();
function cachedFetch(key, ttlMs, fetchFn) {
    const cached = _cache.get(key);
    if (cached && Date.now() - cached.time < ttlMs) return Promise.resolve(cached.data);
    return fetchFn().then((data) => {
        _cache.set(key, { data, time: Date.now() });
        return data;
    });
}
function invalidateCache(prefix) {
    if (!prefix) { _cache.clear(); return; }
    for (const k of _cache.keys()) {
        if (k.startsWith(prefix)) _cache.delete(k);
    }
}

const CACHE_TTL = { stats: 60000, leaderboard: 60000, exchange: 60000, beerSearch: 30000, userProfile: 120000, map: 120000, activity: 60000 };

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
        
        // Check token expiry BEFORE making the request (with 60s buffer)
        let tokens = Utils.storage.get('oidc_tokens');
        if (tokens?.expires_at && Date.now() > tokens.expires_at - 60000) {
            await this._refreshToken();
            tokens = Utils.storage.get('oidc_tokens'); // Get fresh tokens after refresh
        }
        
        const token = this._getAccessToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        let res = await fetch(url, { method, headers, ...opts });
        
        // If 401, try refreshing token once and retry (only retry once to avoid infinite loops)
        if (res.status === 401 && tokens?.refresh_token) {
            const refreshed = await this._refreshToken();
            if (refreshed) {
                const newToken = this._getAccessToken();
                if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
                res = await fetch(url, { method, headers, ...opts });
            } else {
                // Refresh failed - clear tokens and prompt re-login
                Utils.storage.remove('oidc_tokens');
                this.currentUser = null;
                // Consume response body to avoid leaving stream open
                await res.text().catch(() => null);
                throw new Error('Session expired. Please sign in again.');
            }
        }
        
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
            if (error === 'login_required' || error === 'interaction_required') {
                // Silent SSO check found no session — this is expected, not an error
                window.history.replaceState({}, '', this.oidc.redirectUri);
                return null;
            }
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
            sessionStorage.removeItem('oidc_silent_checked'); // Clear silent check flag on successful login
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
        if (!tokens) {
            // Silent SSO check — if user has an active Keycloak session, authenticate without showing login
            const alreadyTriedSilent = sessionStorage.getItem('oidc_silent_checked');
            if (!alreadyTriedSilent && this.oidc.authEndpoint) {
                sessionStorage.setItem('oidc_silent_checked', '1');
                const { verifier, challenge } = await this._generatePKCE();
                const state = Utils.uid();
                Utils.storage.set('oidc_verifier', verifier);
                Utils.storage.set('oidc_state', state);
                const params = new URLSearchParams({
                    response_type: 'code',
                    client_id: this.oidc.clientId,
                    redirect_uri: this.oidc.redirectUri,
                    scope: this.oidc.scopes,
                    state,
                    code_challenge: challenge,
                    code_challenge_method: 'S256',
                    prompt: 'none',
                });
                window.location.href = `${this.oidc.authEndpoint}?${params}`;
                return new Promise(() => {}); // Never resolves — page is navigating
            }
            return null;
        }
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

    cacheInvalidate(prefix) { invalidateCache(prefix || ''); },

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
        // Polling disabled - data only refreshes on user actions (submit/delete)
        // This prevents excessive API calls and page flickering
        if (this.isDemo) return;
        // Removed: setInterval polling that was causing constant refreshes
        // Data now only reloads when:
        // 1. User first enters app (enterApp())
        // 2. User submits a rating
        // 3. User deletes a rating
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
        const key = `beerSearch:${q.toLowerCase().trim()}`;
        return cachedFetch(key, CACHE_TTL.beerSearch, async () => {
            const out = await this._api('GET', `/api/beers/search?q=${encodeURIComponent(q)}`);
            return (out && out.data) ? out.data : [];
        });
    },

    async searchBeersExternal(q) {
        if (!q || q.length < 3) return [];
        try {
            const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&categories_tags_en=beers&json=1&page_size=10&fields=product_name,brands,categories_tags_en`;
            const res = await fetch(url, {
                headers: { 'User-Agent': 'BeerBook/1.0 (drinksafterwork.net)' }
            });
            if (!res.ok) return [];
            const data = await res.json();
            if (!data.products) return [];
            return data.products
                .filter(p => p.product_name)
                .map(p => ({
                    beer_name: p.product_name,
                    brewery: p.brands || '',
                    style: this._extractBeerStyle(p.categories_tags_en),
                    source: 'openfoodfacts'
                }));
        } catch (e) {
            console.warn('OpenFoodFacts search failed:', e.message);
            return [];
        }
    },

    _extractBeerStyle(tags) {
        if (!Array.isArray(tags)) return '';
        const beerTags = tags.filter(t => t !== 'beers' && t !== 'alcoholic-beverages');
        if (!beerTags.length) return '';
        const best = beerTags[beerTags.length - 1]; // most specific
        return best.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },

    async searchBreweries(q) {
        if (!q || q.length < 2) return [];
        try {
            const url = `https://api.openbrewerydb.org/v1/breweries/autocomplete?query=${encodeURIComponent(q)}`;
            const res = await fetch(url);
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.warn('Open Brewery DB search failed:', e.message);
            return [];
        }
    },

    async searchNearbyVenues(lat, lng, radius = 200) {
        try {
            const query = `[out:json][timeout:10];(node["amenity"~"bar|pub|restaurant|biergarten|cafe"](around:${radius},${lat},${lng});node["craft"="brewery"](around:${radius},${lat},${lng});way["amenity"~"bar|pub|restaurant|biergarten|cafe"](around:${radius},${lat},${lng});way["craft"="brewery"](around:${radius},${lat},${lng}););out center tags;`;
            const res = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'data=' + encodeURIComponent(query)
            });
            if (!res.ok) return [];
            const data = await res.json();
            if (!data.elements) return [];
            return data.elements
                .filter(e => e.tags && e.tags.name)
                .map(e => ({
                    osm_id: e.id,
                    name: e.tags.name,
                    type: e.tags.amenity || e.tags.craft || 'venue',
                    latitude: e.lat || e.center?.lat,
                    longitude: e.lon || e.center?.lon,
                    address: [e.tags['addr:street'], e.tags['addr:city'], e.tags['addr:state']].filter(Boolean).join(', '),
                    source: 'overpass'
                }));
        } catch (e) {
            console.warn('Overpass API search failed:', e.message);
            return [];
        }
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

    async getExchange() {
        if (this.isDemo) return { data: [], pagination: { limit: 50, offset: 0, total: 0 } };
        return await cachedFetch('exchange:rates', CACHE_TTL.exchange, () => this._api('GET', '/api/exchange?limit=100&offset=0'));
    },

    async getBeerDetail(beerName) {
        if (this.isDemo) return null;
        try {
            return await cachedFetch(`beer:${encodeURIComponent(beerName)}`, CACHE_TTL.beerSearch, () => this._api('GET', `/api/beers/${encodeURIComponent(beerName)}`));
        } catch { return null; }
    },

    async getBeerCrossRates(beerName) {
        if (this.isDemo) return null;
        try {
            return await this._api('GET', `/api/exchange/${encodeURIComponent(beerName)}`);
        } catch { return null; }
    },

    async getRatingCheers(ratingId) {
        if (this.isDemo) return { count: 0, users: [] };
        try {
            const out = await this._api('GET', `/api/ratings/${encodeURIComponent(ratingId)}/cheers`);
            return { count: out.count ?? 0, users: out.users ?? [] };
        } catch { return { count: 0, users: [] }; }
    },

    async toggleCheers(ratingId) {
        if (this.isDemo) {
            const key = 'beerbook_demo_cheers';
            const raw = Utils.storage.get(key) || {};
            const entry = raw[ratingId] || { count: 0, userIds: [] };
            const uid = this.currentUser && this.currentUser.id;
            const userIds = entry.userIds || [];
            const idx = userIds.indexOf(uid);
            if (idx >= 0) {
                userIds.splice(idx, 1);
                entry.count = Math.max(0, (entry.count || 1) - 1);
                entry.userIds = userIds;
                raw[ratingId] = entry;
                Utils.storage.set(key, raw);
                return { action: 'removed', count: entry.count };
            } else {
                userIds.push(uid);
                entry.count = (entry.count || 0) + 1;
                entry.userIds = userIds;
                raw[ratingId] = entry;
                Utils.storage.set(key, raw);
                return { action: 'added', count: entry.count };
            }
        }
        const out = await this._api('POST', `/api/ratings/${encodeURIComponent(ratingId)}/cheers`);
        invalidateCache('activity');
        invalidateCache('leaderboard');
        return out;
    },

    async getMap() {
        if (this.isDemo) return { data: [] };
        return await this._api('GET', '/api/map');
    },

    async getMapUser(userId) {
        if (this.isDemo) return { data: [] };
        return await this._api('GET', `/api/map/user/${encodeURIComponent(userId)}`);
    },

    async getDeals(lat, lng, radius = 5000) {
        if (this.isDemo) return { data: [] };
        return await this._api('GET', `/api/deals?lat=${lat}&lng=${lng}&radius=${radius}`);
    },

    async getVenue(venueId) {
        if (this.isDemo) return null;
        return await this._api('GET', `/api/venues/${encodeURIComponent(venueId)}`);
    },

    async getVenuePrices(venueId) {
        if (this.isDemo) return { data: [] };
        return await this._api('GET', `/api/venues/${encodeURIComponent(venueId)}/prices?limit=100`);
    },

    async confirmVenuePrice(venueId, priceId) {
        if (this.isDemo) return { ok: true };
        return await this._api('POST', `/api/venues/${encodeURIComponent(venueId)}/prices/${encodeURIComponent(priceId)}/confirm`);
    },

    async confirmVenueHappyHour(venueId, hhId) {
        if (this.isDemo) return { ok: true };
        return await this._api('POST', `/api/venues/${encodeURIComponent(venueId)}/happy-hours/${encodeURIComponent(hhId)}/confirm`);
    },

    async addVenueHappyHour(venueId, payload) {
        if (this.isDemo) return {};
        return await this._api('POST', `/api/venues/${encodeURIComponent(venueId)}/happy-hours`, { body: JSON.stringify(payload) });
    }
};
