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

function createApiError(message, meta = {}) {
    const err = new Error(message);
    Object.assign(err, meta);
    return err;
}

const CACHE_TTL = {
    stats: 60000,
    leaderboard: 60000,
    exchange: 60000,
    beerSearch: 30000,
    userProfile: 120000,
    map: 120000,
    activity: 60000,
    follows: 120000,
    crews: 120000,
    crewDetail: 60000
};

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

    getAccessToken() {
        return this._getAccessToken();
    },

    getTokenClaims() {
        const token = this._getAccessToken();
        if (!token) return null;
        try {
            const payloadPart = token.split('.')[1];
            if (!payloadPart) return null;
            const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
            return JSON.parse(atob(padded));
        } catch (_) {
            return null;
        }
    },

    isAdmin() {
        if (this.currentUser && typeof this.currentUser.isAdmin === 'boolean') {
            return this.currentUser.isAdmin;
        }
        const claims = this.getTokenClaims();
        const roles = claims?.realm_access?.roles || [];
        return Array.isArray(roles) && roles.includes('beerbook_admin');
    },

    async getProfile() {
        if (this.isDemo) {
            return this.currentUser || null;
        }
        return await this._api('GET', '/api/profile/me');
    },

    async hydrateCurrentUserProfile() {
        if (!this.currentUser || this.isDemo) return this.currentUser;
        try {
            const profileData = await this.getProfile();
            this.currentUser = {
                ...this.currentUser,
                ...profileData,
                isAdmin: !!(profileData && profileData.is_admin),
            };
        } catch (err) {
            console.warn('Failed to hydrate profile from API:', err?.message || err);
            this.currentUser.isAdmin = this.isAdmin();
        }
        return this.currentUser;
    },

    async _api(method, path, opts = {}) {
        const url = `${this.apiBaseUrl}${path}`;
        const headers = { 'Content-Type': 'application/json', ...opts.headers };
        const buildError = (res, body, fallbackMessage) => {
            const retryAfterRaw = res?.headers?.get('Retry-After');
            const retryAfter = retryAfterRaw != null ? Number(retryAfterRaw) : null;
            return createApiError(
                body?.error || body?.message || fallbackMessage || `HTTP ${res?.status || 0}`,
                {
                    status: res?.status || 0,
                    method,
                    path,
                    errorCode: body?.error_code || null,
                    requestId: res?.headers?.get('x-request-id') || body?.request_id || null,
                    retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
                    details: body || null,
                }
            );
        };

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
                const expiredText = await res.text().catch(() => null);
                let expiredBody = null;
                try { expiredBody = expiredText ? JSON.parse(expiredText) : null; } catch { expiredBody = null; }
                throw buildError(res, expiredBody, 'Session expired. Please sign in again.');
            }
        }
        
        const text = await res.text();
        let body;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        if (!res.ok) throw buildError(res, body, `HTTP ${res.status}`);
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
        Utils.storage.remove('sso_silent_attempted');
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
        Utils.storage.remove('sso_silent_attempted');
        const { verifier, challenge } = await this._generatePKCE();
        const state = Utils.uid();
        Utils.storage.set('oidc_verifier', verifier);
        Utils.storage.set('oidc_state', state);
        const params = new URLSearchParams({
            response_type: 'code', client_id: this.oidc.clientId,
            redirect_uri: this.oidc.redirectUri, scope: this.oidc.scopes,
            state, code_challenge: challenge, code_challenge_method: 'S256',
        });
        // Use Keycloak's registrations endpoint so user lands on Create Account form, not Sign In tab
        const registrationUrl = this.oidc.authEndpoint.replace(
            '/protocol/openid-connect/auth',
            '/protocol/openid-connect/registrations'
        );
        window.location.href = `${registrationUrl}?${params}`;
    },

    async handleOIDCCallback() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');
        if (error) {
            window.history.replaceState({}, '', this.oidc.redirectUri);
            if (error === 'login_required' || error === 'interaction_required') {
                Utils.storage.remove('oidc_verifier');
                Utils.storage.remove('oidc_state');
                return null;
            }
            Utils.toast(`Login error: ${params.get('error_description') || error}`, 'error');
            return null;
        }
        if (!code) return null;
        const savedState = Utils.storage.get('oidc_state');
        const verifier = Utils.storage.get('oidc_verifier');
        if (!state || !savedState || state !== savedState || !verifier) {
            Utils.storage.remove('oidc_verifier');
            Utils.storage.remove('oidc_state');
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
            Utils.storage.remove('sso_silent_attempted');
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

        // Clean up stale OIDC state if there's no code in the URL (e.g. email verification redirect)
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.get('code') && !urlParams.get('error')) {
            Utils.storage.remove('oidc_verifier');
            Utils.storage.remove('oidc_state');
        }

        const cbUser = await this.handleOIDCCallback();
        if (cbUser) return cbUser;

        const tokens = Utils.storage.get('oidc_tokens');
        if (tokens) {
            if (tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
                const refreshed = await this._refreshToken();
                if (!refreshed) {
                    Utils.storage.remove('oidc_tokens');
                    // Fall through to silent SSO check
                } else {
                    const updatedTokens = Utils.storage.get('oidc_tokens');
                    const user = await this._getUserInfo(updatedTokens.access_token);
                    this.currentUser = user;
                    return user;
                }
            } else {
                try {
                    const user = await this._getUserInfo(tokens.access_token);
                    this.currentUser = user;
                    return user;
                } catch {
                    if (await this._refreshToken()) {
                        const t = Utils.storage.get('oidc_tokens');
                        this.currentUser = await this._getUserInfo(t.access_token);
                        return this.currentUser;
                    }
                    Utils.storage.remove('oidc_tokens');
                    // Fall through to silent SSO check
                }
            }
        }

        return await this._silentSSOCheck();
    },

    async _silentSSOCheck() {
        if (Utils.storage.get('sso_silent_attempted')) return null;
        Utils.storage.set('sso_silent_attempted', true);

        try {
            if (!this.oidc.authEndpoint && !(await this._discoverOIDC())) return null;

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
            return null;
        } catch (e) {
            console.warn('Silent SSO check failed:', e.message);
            return null;
        }
    },

    async signOut() {
        this.subscriptions.forEach(s => { if (s && typeof s === 'number') clearInterval(s); });
        this.subscriptions = [];
        const tokens = Utils.storage.get('oidc_tokens');

        // Clear ALL local auth state FIRST
        Utils.storage.remove('oidc_tokens');
        Utils.storage.remove('oidc_verifier');
        Utils.storage.remove('oidc_state');
        Utils.storage.remove('sso_silent_attempted');
        Utils.storage.remove('demo_user');
        this.currentUser = null;

        // If we have Keycloak endpoints and an id_token, do a proper Keycloak logout
        if (this.oidc.endSessionEndpoint && tokens?.id_token) {
            const params = new URLSearchParams({
                id_token_hint: tokens.id_token,
                post_logout_redirect_uri: this.oidc.redirectUri,
            });
            window.location.href = `${this.oidc.endSessionEndpoint}?${params}`;
            return;
        }

        // Fallback: just show auth screen (no Keycloak logout)
        const appEl = document.getElementById('app');
        const authEl = document.getElementById('auth-screen');
        if (appEl) appEl.style.display = 'none';
        if (authEl) authEl.style.display = 'flex';
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
            is_new_beer: rating.is_new_beer === true,
            flavors: rating.flavors || {},
            notes: rating.notes || '',
            yg_value: rating.yg_value ?? null,
            latitude: rating.latitude ?? null,
            longitude: rating.longitude ?? null,
            location_name: rating.location_name ?? null,
            venue_id: rating.venue_id ?? null,
            photo_url: rating.photo_url ?? null,
            beer_id: rating.beer_id ?? null,
            serve_type: rating.serve_type ?? null,
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
                location_name: record.location_name, venue_id: record.venue_id, photo_url: record.photo_url,
                beer_id: record.beer_id || null, serve_type: record.serve_type ?? null
            };
            const reviews = Utils.storage.get('reviews', []);
            reviews.unshift(rev);
            Utils.storage.set('reviews', reviews);
            return { data: rev, updated: false };
        }
        const body = {
            beer_name: record.beerName,
            brewery: record.brewery,
            style: record.style,
            abv: record.abv,
            rating: record.rating,
            is_new_beer: record.is_new_beer,
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
            venue_type: rating.venue_type ?? null,
            photo_url: record.photo_url,
            beer_id: record.beer_id,
            serve_type: record.serve_type ?? null,
        };
        const response = await this._api('POST', '/api/ratings', { body: JSON.stringify(body) });
        invalidateCache('');
        if (response && response.data !== undefined) return response;
        return { data: response || null, updated: false };
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

    async getUserProfile(userId) {
        if (!userId) return null;
        if (this.isDemo) {
            const ratings = Utils.storage.get('reviews', []);
            const match = ratings.find((r) => r.user_id === userId);
            return {
                id: userId,
                display_name: match?.user_name || 'Beer Lover',
                created_at: new Date().toISOString()
            };
        }
        return await cachedFetch(`userProfile:${userId}`, CACHE_TTL.userProfile, async () => {
            return await this._api('GET', `/api/users/${encodeURIComponent(userId)}`);
        });
    },

    async getUserStats(userId) {
        if (!userId) return null;
        if (this.isDemo) {
            const ratings = Utils.storage.get('reviews', []).filter((r) => r.user_id === userId);
            const styleCounts = Utils.countBy(ratings, 'style');
            const mostRated = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
            return {
                total_ratings: ratings.length,
                total_styles: new Set(ratings.map((r) => r.style).filter(Boolean)).size,
                avg_rating: ratings.length ? ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / ratings.length : 0,
                avg_yg_value: 0,
                total_yg_portfolio: 0,
                most_rated_style: mostRated,
                follower_count: this._demoGetFollowers(userId).length,
                following_count: this._demoGetFollowing(userId).length,
                crew_count: this._demoGetCrewsForUser(userId).length
            };
        }
        return await this._api('GET', `/api/users/${encodeURIComponent(userId)}/stats`);
    },

    async getExchangePortfolio(userId) {
        const ratings = await this.getUserRatings(userId);
        const withYg = ratings.filter((r) => r.yg_value != null);
        return {
            ratings: withYg,
            total_portfolio_value: withYg.reduce((s, r) => s + (Number(r.yg_value) || 0), 0)
        };
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
        try {
            const out = await this._api('GET', `/api/beers/search?q=${encodeURIComponent(q)}`);
            return (out && Array.isArray(out.data)) ? out.data : [];
        } catch (err) {
            console.warn('searchBeers failed:', err.message);
            return [];
        }
    },

    async validateNewBeer(name, brewery) {
        if (this.isDemo) return { matches: [] };
        try {
            const out = await this._api(
                'GET',
                `/api/catalog/validate-new?name=${encodeURIComponent(String(name || '').trim())}&brewery=${encodeURIComponent(String(brewery || '').trim())}`
            );
            return { matches: (out && Array.isArray(out.data)) ? out.data : [] };
        } catch (err) {
            console.warn('validateNewBeer failed:', err.message);
            return { matches: [] };
        }
    },

    async browseCatalog(opts = {}) {
        if (this.isDemo) return { data: [], pagination: { limit: 30, offset: 0, total: 0 } };
        const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 100);
        const offset = Math.max(Number(opts.offset) || 0, 0);
        const sort = (opts.sort || 'name');
        const order = (opts.order === 'desc') ? 'desc' : 'asc';
        const style = (opts.style || '').trim();
        const q = (opts.q || '').trim();
        let path = `/api/catalog/browse?limit=${limit}&offset=${offset}&sort=${encodeURIComponent(sort)}&order=${order}`;
        if (style) path += `&style=${encodeURIComponent(style)}`;
        if (q) path += `&q=${encodeURIComponent(q)}`;
        const out = await this._api('GET', path);
        return out || { data: [], pagination: { limit, offset, total: 0 } };
    },

    async getCatalogStyles() {
        if (this.isDemo) return [];
        const out = await this._api('GET', '/api/catalog/styles');
        return (out && out.data) ? out.data : [];
    },

    async getCatalogBeer(beerId) {
        if (this.isDemo || !beerId) return null;
        try {
            return await this._api('GET', `/api/catalog/beer/${encodeURIComponent(beerId)}`);
        } catch { return null; }
    },

    async searchBeersExternal(q) {
        if (!q || q.length < 3) return [];
        try {
            const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&categories_tags_en=beers&json=1&page_size=10&fields=product_name,brands,categories_tags_en,alcohol_value`;
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
                    abv: p.alcohol_value || '',
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
        // Convert radius (meters) to approximate lat/lng delta
        const delta = radius / 111000; // ~111km per degree
        const south = lat - delta;
        const north = lat + delta;
        const west = lng - delta;
        const east = lng + delta;

        const query = `
            [out:json][timeout:10];
            (
                node["amenity"~"bar|pub|restaurant|cafe|brewery|biergarten"](${south},${west},${north},${east});
            );
            out body 10;
        `;

        try {
            const resp = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded', 
                    'User-Agent': 'BeerBook/1.0' 
                },
                body: `data=${encodeURIComponent(query)}`
            });
            if (!resp.ok) return [];
            const data = await resp.json();
            if (!data.elements) return [];
            return (data.elements || [])
                .filter(e => e.tags && e.tags.name)
                .map(e => ({
                    osm_id: e.id,
                    name: e.tags.name,
                    type: e.tags.amenity || e.tags.craft || 'venue',
                    latitude: e.lat,
                    longitude: e.lon,
                    address: [e.tags['addr:street'], e.tags['addr:city'], e.tags['addr:state']].filter(Boolean).join(', '),
                    source: 'overpass'
                }));
        } catch (err) {
            console.warn('Overpass query failed:', err);
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

    async getFollowers(userId, limit = 50, offset = 0) {
        if (!userId) return { data: [], pagination: { limit, offset, total: 0 } };
        if (this.isDemo) {
            const ids = this._demoGetFollowers(userId);
            const profiles = this._demoProfilesFromIds(ids);
            return { data: profiles.slice(offset, offset + limit), pagination: { limit, offset, total: profiles.length } };
        }
        return await cachedFetch(`followers:${userId}:${limit}:${offset}`, CACHE_TTL.follows, () =>
            this._api('GET', `/api/follows/${encodeURIComponent(userId)}/followers?limit=${limit}&offset=${offset}`)
        );
    },

    async getFollowing(userId, limit = 50, offset = 0) {
        if (!userId) return { data: [], pagination: { limit, offset, total: 0 } };
        if (this.isDemo) {
            const ids = this._demoGetFollowing(userId);
            const profiles = this._demoProfilesFromIds(ids);
            return { data: profiles.slice(offset, offset + limit), pagination: { limit, offset, total: profiles.length } };
        }
        return await cachedFetch(`following:${userId}:${limit}:${offset}`, CACHE_TTL.follows, () =>
            this._api('GET', `/api/follows/${encodeURIComponent(userId)}/following?limit=${limit}&offset=${offset}`)
        );
    },

    async getFollowStatus(userId) {
        if (!userId || !this.currentUser) return { is_following: false };
        if (this.isDemo) {
            return { is_following: this._demoGetFollowing(this.currentUser.id).includes(userId) };
        }
        return await this._api('GET', `/api/follows/${encodeURIComponent(userId)}/status`);
    },

    async toggleFollow(userId) {
        if (!userId || !this.currentUser) throw new Error('User required');
        if (this.isDemo) {
            const me = this.currentUser.id;
            const follows = this._demoGetFollows();
            const key = `${me}:${userId}`;
            if (follows[key]) delete follows[key];
            else if (me !== userId) follows[key] = true;
            this._demoSetFollows(follows);
            invalidateCache('followers:');
            invalidateCache('following:');
            return { following: !!follows[key] };
        }
        const out = await this._api('POST', `/api/follows/${encodeURIComponent(userId)}`);
        invalidateCache('followers:');
        invalidateCache('following:');
        invalidateCache('stats');
        return out;
    },

    async getCrews() {
        if (this.isDemo) {
            const mine = this._demoGetCrewsForUser(this.currentUser?.id);
            return { data: mine };
        }
        return await cachedFetch('crews:mine', CACHE_TTL.crews, () => this._api('GET', '/api/crews'));
    },

    async getCrewDetail(crewId) {
        if (!crewId) return null;
        if (this.isDemo) {
            return this._demoGetCrewById(crewId);
        }
        return await cachedFetch(`crew:${crewId}`, CACHE_TTL.crewDetail, () =>
            this._api('GET', `/api/crews/${encodeURIComponent(crewId)}`)
        );
    },

    async createCrew(name) {
        if (!name) throw new Error('Crew name is required');
        if (this.isDemo) {
            const crew = this._demoCreateCrew(name, this.currentUser?.id);
            invalidateCache('crews:');
            return crew;
        }
        const out = await this._api('POST', '/api/crews', { body: JSON.stringify({ name }) });
        invalidateCache('crews:');
        invalidateCache('crew:');
        return out;
    },

    async joinCrew(inviteCode) {
        if (!inviteCode) throw new Error('Invite code is required');
        if (this.isDemo) {
            const crew = this._demoJoinCrew(inviteCode, this.currentUser?.id);
            invalidateCache('crews:');
            return crew;
        }
        const out = await this._api('POST', '/api/crews/join', { body: JSON.stringify({ invite_code: inviteCode }) });
        invalidateCache('crews:');
        invalidateCache('crew:');
        return out;
    },

    async updateCrew(crewId, name) {
        if (this.isDemo) {
            return this._demoUpdateCrew(crewId, { name });
        }
        const out = await this._api('PATCH', `/api/crews/${encodeURIComponent(crewId)}`, { body: JSON.stringify({ name }) });
        invalidateCache('crews:');
        invalidateCache(`crew:${crewId}`);
        return out;
    },

    async regenerateCrewCode(crewId) {
        if (this.isDemo) {
            return this._demoRegenerateCrewCode(crewId);
        }
        const out = await this._api('POST', `/api/crews/${encodeURIComponent(crewId)}/regenerate-code`);
        invalidateCache('crews:');
        invalidateCache(`crew:${crewId}`);
        return out;
    },

    async removeCrewMember(crewId, userId) {
        if (this.isDemo) {
            this._demoRemoveCrewMember(crewId, userId);
            invalidateCache('crews:');
            invalidateCache(`crew:${crewId}`);
            return { ok: true };
        }
        await this._api('DELETE', `/api/crews/${encodeURIComponent(crewId)}/members/${encodeURIComponent(userId)}`);
        invalidateCache('crews:');
        invalidateCache(`crew:${crewId}`);
        return { ok: true };
    },

    async deleteCrew(crewId) {
        if (this.isDemo) {
            this._demoDeleteCrew(crewId);
            invalidateCache('crews:');
            invalidateCache(`crew:${crewId}`);
            return { ok: true };
        }
        await this._api('DELETE', `/api/crews/${encodeURIComponent(crewId)}`);
        invalidateCache('crews:');
        invalidateCache(`crew:${crewId}`);
        return { ok: true };
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

    async getTabsProfile(userId = null) {
        if (this.isDemo) return { data: null };
        const path = userId
            ? `/api/tabs/profile/${encodeURIComponent(userId)}`
            : '/api/tabs/profile';
        return await this._api('GET', path);
    },

    async getTabsNotifications(limit = 50, offset = 0) {
        if (this.isDemo) return { data: [], metadata: { unread_count: 0 } };
        return await this._api('GET', `/api/tabs/notifications?limit=${Math.max(1, Number(limit) || 50)}&offset=${Math.max(0, Number(offset) || 0)}`);
    },

    async markTabsNotificationRead(notificationId) {
        if (this.isDemo) return { ok: true };
        return await this._api('PATCH', `/api/tabs/notifications/${encodeURIComponent(notificationId)}/read`);
    },

    async markAllTabsNotificationsRead() {
        if (this.isDemo) return { ok: true };
        return await this._api('PATCH', '/api/tabs/notifications/read-all');
    },

    async createTabsSubmission(payload) {
        if (this.isDemo) return { data: { ...payload, id: Utils.uid(), status: 'pending', created_at: new Date().toISOString() } };
        return await this._api('POST', '/api/tabs/submissions', { body: JSON.stringify(payload) });
    },

    async getTabsSubmissions() {
        if (this.isDemo) return { data: [] };
        return await this._api('GET', '/api/tabs/submissions');
    },

    async getTabsLeaderboard(limit = 50, offset = 0) {
        if (this.isDemo) return { data: [] };
        return await this._api('GET', `/api/tabs/leaderboard?limit=${Math.max(1, Number(limit) || 50)}&offset=${Math.max(0, Number(offset) || 0)}`);
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

        // Ensure token is fresh — uploadPhoto bypasses _api() so must check manually
        const tokens = Utils.storage.get('oidc_tokens');
        if (tokens?.expires_at && Date.now() > tokens.expires_at - 60000) {
            const refreshed = await this._refreshToken();
            if (!refreshed) throw new Error('Session expired — please sign in again');
        }

        return await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const url = `${this.apiBaseUrl}/api/upload`;
            const progressEl = document.getElementById('upload-progress');

            const hideProgress = () => {
                if (!progressEl) return;
                progressEl.style.display = 'none';
                progressEl.textContent = '';
            };

            xhr.upload.addEventListener('progress', (event) => {
                if (!progressEl || !event.lengthComputable) return;
                const pct = Math.round((event.loaded / event.total) * 100);
                progressEl.style.display = 'block';
                progressEl.textContent = `Uploading photo... ${pct}%`;
            });

            xhr.addEventListener('load', () => {
                hideProgress();
                let body = null;
                try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (_) {}
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(body || {});
                    return;
                }
                reject(new Error(body?.error || body?.message || `Upload failed: ${xhr.status}`));
            });

            xhr.addEventListener('error', () => {
                hideProgress();
                reject(new Error('Upload network error'));
            });

            xhr.addEventListener('timeout', () => {
                hideProgress();
                reject(new Error('Photo upload timed out — please try again on a better connection'));
            });

            xhr.open('POST', url);
            xhr.timeout = 30000;
            const token = this._getAccessToken();
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

            const formData = new FormData();
            formData.append('file', file);
            xhr.send(formData);
        });
    },

    async createVenue(venue) {
        if (this.isDemo) return { id: 'demo_venue_' + Utils.uid(), name: venue.name };
        const body = {
            name: venue.name,
            latitude: venue.latitude,
            longitude: venue.longitude,
            address: venue.address || null,
            venue_type: venue.venue_type || null,
            created_by: this.currentUser?.id || 'demo'
        };
        const out = await this._api('POST', '/api/venues', { body: JSON.stringify(body) });
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

    async getMapVenues() {
        if (this.isDemo) return { data: [] };
        return await this._api('GET', '/api/map/venues');
    },

    async getBreweriesMap(bounds) {
        if (this.isDemo) return { data: [] };
        const q = bounds ? `?bounds=${encodeURIComponent(bounds)}` : '';
        return await this._api('GET', `/api/breweries/map${q}`);
    },

    async getBrewery(id) {
        if (this.isDemo) return null;
        return await this._api('GET', `/api/breweries/${encodeURIComponent(id)}`);
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
    },

    async adminGetUsers(params = {}) {
        if (this.isDemo) return { data: [], pagination: { total: 0, limit: 50, offset: 0 } };
        const qs = new URLSearchParams();
        if (params.sort) qs.set('sort', params.sort);
        if (params.order) qs.set('order', params.order);
        if (params.limit != null) qs.set('limit', String(params.limit));
        if (params.offset != null) qs.set('offset', String(params.offset));
        if (params.search) qs.set('search', params.search);
        return await this._api('GET', `/api/admin/users?${qs.toString()}`);
    },

    async adminGetUser(userId) {
        if (this.isDemo || !userId) return null;
        return await this._api('GET', `/api/admin/users/${encodeURIComponent(userId)}`);
    },

    async adminGetStats() {
        if (this.isDemo) return {};
        return await this._api('GET', '/api/admin/stats');
    },

    async adminGetReferrals(params = {}) {
        if (this.isDemo) return { data: [], pagination: { total: 0, limit: 50, offset: 0 } };
        const qs = new URLSearchParams();
        if (params.target_type) qs.set('target_type', params.target_type);
        if (params.target_id) qs.set('target_id', params.target_id);
        if (params.user_id) qs.set('user_id', params.user_id);
        if (params.from) qs.set('from', params.from);
        if (params.to) qs.set('to', params.to);
        if (params.limit != null) qs.set('limit', String(params.limit));
        if (params.offset != null) qs.set('offset', String(params.offset));
        return await this._api('GET', `/api/admin/referrals?${qs.toString()}`);
    },

    async adminGetReferralSummary(params = {}) {
        if (this.isDemo) return { total_clicks: 0, by_target_type: {}, top_breweries: [], top_venues: [], daily_trend: [] };
        const qs = new URLSearchParams();
        if (params.target_type) qs.set('target_type', params.target_type);
        if (params.from) qs.set('from', params.from);
        if (params.to) qs.set('to', params.to);
        return await this._api('GET', `/api/admin/referrals/summary?${qs.toString()}`);
    },

    async adminGetTraffic(params = {}) {
        if (this.isDemo) return { total_views: 0, unique_sessions: 0, unique_users: 0, top_pages: [], daily_trend: [] };
        const qs = new URLSearchParams();
        if (params.from) qs.set('from', params.from);
        if (params.to) qs.set('to', params.to);
        return await this._api('GET', `/api/admin/traffic?${qs.toString()}`);
    },

    async adminTabsGetUsers() {
        if (this.isDemo) return { data: [] };
        return await this._api('GET', '/api/admin/tabs/users');
    },

    async adminTabsSetSeeder(userId, isSeeder) {
        if (this.isDemo) return { data: null };
        return await this._api('PATCH', `/api/admin/tabs/users/${encodeURIComponent(userId)}/seeder`, {
            body: JSON.stringify({ is_seeder: !!isSeeder }),
        });
    },

    async adminTabsSetTier(userId, tier) {
        if (this.isDemo) return { data: null };
        return await this._api('PATCH', `/api/admin/tabs/users/${encodeURIComponent(userId)}/tier`, {
            body: JSON.stringify({ tier }),
        });
    },

    async adminTabsAdjustBalance(userId, amount, reason) {
        if (this.isDemo) return { data: null };
        return await this._api('POST', `/api/admin/tabs/users/${encodeURIComponent(userId)}/adjust`, {
            body: JSON.stringify({ amount, reason }),
        });
    },

    async adminTabsGetSubmissions(status = 'pending') {
        if (this.isDemo) return { data: [] };
        if (status === 'all') {
            const [pending, approved, rejected] = await Promise.all([
                this._api('GET', '/api/admin/tabs/submissions?status=pending'),
                this._api('GET', '/api/admin/tabs/submissions?status=approved'),
                this._api('GET', '/api/admin/tabs/submissions?status=rejected'),
            ]);
            return {
                data: [
                    ...(pending?.data || []),
                    ...(approved?.data || []),
                    ...(rejected?.data || []),
                ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
            };
        }
        return await this._api('GET', `/api/admin/tabs/submissions?status=${encodeURIComponent(status)}`);
    },

    async adminTabsReviewSubmission(id, status, reviewNotes = null) {
        if (this.isDemo) return { data: null };
        const payload = { status };
        if (reviewNotes != null) payload.review_notes = reviewNotes;
        return await this._api('PATCH', `/api/admin/tabs/submissions/${encodeURIComponent(id)}`, {
            body: JSON.stringify(payload),
        });
    },

    async adminTabsGetStats() {
        if (this.isDemo) return {};
        return await this._api('GET', '/api/admin/tabs/stats');
    },

    async adminGetChallenges(params = {}) {
        if (this.isDemo) return { data: [], pagination: { limit: 50, offset: 0, total: 0 } };
        const qs = new URLSearchParams();
        if (params.limit != null) qs.set('limit', params.limit);
        if (params.offset != null) qs.set('offset', params.offset);
        return await this._api('GET', `/api/admin/challenges?${qs.toString()}`);
    },
    async adminGetChallenge(id) {
        if (this.isDemo) return null;
        return await this._api('GET', `/api/admin/challenges/${encodeURIComponent(id)}`);
    },
    async adminCreateChallenge(body) {
        if (this.isDemo) return null;
        return await this._api('POST', '/api/admin/challenges', { body: JSON.stringify(body) });
    },
    async adminUpdateChallenge(id, body) {
        if (this.isDemo) return null;
        return await this._api('PATCH', `/api/admin/challenges/${encodeURIComponent(id)}`, { body: JSON.stringify(body) });
    },
    async adminDeleteChallenge(id) {
        if (this.isDemo) return null;
        return await this._api('DELETE', `/api/admin/challenges/${encodeURIComponent(id)}`);
    },

    async adminGetAchievements() {
        if (this.isDemo) return { data: [] };
        return await this._api('GET', '/api/admin/achievements');
    },
    async adminGetAchievement(id) {
        if (this.isDemo) return null;
        return await this._api('GET', `/api/admin/achievements/${encodeURIComponent(id)}`);
    },
    async adminCreateAchievement(body) {
        if (this.isDemo) return null;
        return await this._api('POST', '/api/admin/achievements', { body: JSON.stringify(body) });
    },
    async adminUpdateAchievement(id, body) {
        if (this.isDemo) return null;
        return await this._api('PATCH', `/api/admin/achievements/${encodeURIComponent(id)}`, { body: JSON.stringify(body) });
    },
    async adminDeactivateAchievement(id) {
        if (this.isDemo) return null;
        return await this._api('PATCH', `/api/admin/achievements/${encodeURIComponent(id)}/deactivate`);
    },
    async adminGetAchievementCategories() {
        if (this.isDemo) return { data: [] };
        return await this._api('GET', '/api/admin/achievement-categories');
    },
    async adminCreateAchievementCategory(body) {
        if (this.isDemo) return null;
        return await this._api('POST', '/api/admin/achievement-categories', { body: JSON.stringify(body) });
    },
    async adminUpdateAchievementCategory(key, body) {
        if (this.isDemo) return null;
        return await this._api('PATCH', `/api/admin/achievement-categories/${encodeURIComponent(key)}`, { body: JSON.stringify(body) });
    },

    async adminGetFeaturedBeers(params = {}) {
        if (this.isDemo) return { data: [], pagination: { limit: 50, offset: 0, total: 0 } };
        const qs = new URLSearchParams();
        if (params.limit != null) qs.set('limit', params.limit);
        if (params.offset != null) qs.set('offset', params.offset);
        return await this._api('GET', `/api/admin/featured-beers?${qs.toString()}`);
    },
    async adminCreateFeaturedBeer(body) {
        if (this.isDemo) return null;
        return await this._api('POST', '/api/admin/featured-beers', { body: JSON.stringify(body) });
    },
    async adminUpdateFeaturedBeer(id, body) {
        if (this.isDemo) return null;
        return await this._api('PATCH', `/api/admin/featured-beers/${encodeURIComponent(id)}`, { body: JSON.stringify(body) });
    },
    async adminDeleteFeaturedBeer(id) {
        if (this.isDemo) return null;
        return await this._api('DELETE', `/api/admin/featured-beers/${encodeURIComponent(id)}`);
    },

    async adminGetCosmetics() {
        if (this.isDemo) return { data: [] };
        return await this._api('GET', '/api/admin/cosmetics');
    },
    async adminCreateCosmetic(body) {
        if (this.isDemo) return null;
        return await this._api('POST', '/api/admin/cosmetics', { body: JSON.stringify(body) });
    },
    async adminUpdateCosmetic(id, body) {
        if (this.isDemo) return null;
        return await this._api('PATCH', `/api/admin/cosmetics/${encodeURIComponent(id)}`, { body: JSON.stringify(body) });
    },
    async adminDeactivateCosmetic(id) {
        if (this.isDemo) return null;
        return await this._api('PATCH', `/api/admin/cosmetics/${encodeURIComponent(id)}/deactivate`);
    },

    _demoGetFollows() {
        return Utils.storage.get('demo_follows', {});
    },

    _demoSetFollows(map) {
        Utils.storage.set('demo_follows', map || {});
    },

    _demoGetFollowers(userId) {
        const follows = this._demoGetFollows();
        return Object.keys(follows).filter((k) => follows[k]).map((k) => k.split(':')).filter(([, followed]) => followed === userId).map(([follower]) => follower);
    },

    _demoGetFollowing(userId) {
        const follows = this._demoGetFollows();
        return Object.keys(follows).filter((k) => follows[k]).map((k) => k.split(':')).filter(([follower]) => follower === userId).map(([, followed]) => followed);
    },

    _demoGetCrews() {
        return Utils.storage.get('demo_crews', []);
    },

    _demoSetCrews(crews) {
        Utils.storage.set('demo_crews', crews || []);
    },

    _demoGetCrewsForUser(userId) {
        if (!userId) return [];
        return this._demoGetCrews().filter((c) => (c.member_user_ids || []).includes(userId));
    },

    _demoGetCrewById(crewId) {
        return this._demoGetCrews().find((c) => c.id === crewId) || null;
    },

    _demoCreateCrew(name, ownerId) {
        const crews = this._demoGetCrews();
        const inviteChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const code = Array.from({ length: 6 }).map(() => inviteChars[Math.floor(Math.random() * inviteChars.length)]).join('');
        const crew = {
            id: Utils.uid(),
            name,
            created_by: ownerId,
            invite_code: code,
            member_count: 1,
            my_role: 'owner',
            member_user_ids: [ownerId],
            members: [{ user_id: ownerId, role: 'owner', profile: { id: ownerId, display_name: this.currentUser?.display_name || 'Beer Lover' }, rating_count: 0 }],
            stats: { total_ratings: 0, avg_rating: 0, most_popular_style: null, top_beer: null }
        };
        crews.unshift(crew);
        this._demoSetCrews(crews);
        return crew;
    },

    _demoJoinCrew(inviteCode, userId) {
        const crews = this._demoGetCrews();
        const code = String(inviteCode || '').trim().toUpperCase();
        const crew = crews.find((c) => String(c.invite_code || '').toUpperCase() === code);
        if (!crew) throw new Error('Crew not found');
        if ((crew.member_user_ids || []).includes(userId)) throw new Error("You're already in this crew!");
        if ((crew.member_user_ids || []).length >= 50) throw new Error('This crew is full (50/50)');
        crew.member_user_ids.push(userId);
        crew.member_count = crew.member_user_ids.length;
        crew.members = crew.members || [];
        crew.members.push({
            user_id: userId,
            role: 'member',
            profile: { id: userId, display_name: this.currentUser?.display_name || 'Beer Lover' },
            rating_count: 0
        });
        this._demoSetCrews(crews);
        return crew;
    },

    _demoUpdateCrew(crewId, patch) {
        const crews = this._demoGetCrews();
        const crew = crews.find((c) => c.id === crewId);
        if (!crew) throw new Error('Crew not found');
        Object.assign(crew, patch || {});
        this._demoSetCrews(crews);
        return crew;
    },

    _demoRegenerateCrewCode(crewId) {
        const inviteChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const code = Array.from({ length: 6 }).map(() => inviteChars[Math.floor(Math.random() * inviteChars.length)]).join('');
        const crew = this._demoUpdateCrew(crewId, { invite_code: code });
        return { invite_code: crew.invite_code };
    },

    _demoRemoveCrewMember(crewId, userId) {
        const crews = this._demoGetCrews();
        const crew = crews.find((c) => c.id === crewId);
        if (!crew) return;
        crew.member_user_ids = (crew.member_user_ids || []).filter((id) => id !== userId);
        crew.members = (crew.members || []).filter((m) => m.user_id !== userId);
        crew.member_count = crew.member_user_ids.length;
        if (crew.member_count === 0) {
            this._demoSetCrews(crews.filter((c) => c.id !== crewId));
            return;
        }
        this._demoSetCrews(crews);
    },

    _demoDeleteCrew(crewId) {
        const crews = this._demoGetCrews().filter((c) => c.id !== crewId);
        this._demoSetCrews(crews);
    },

    _demoProfilesFromIds(ids) {
        const ratings = Utils.storage.get('reviews', []);
        const latestByUser = {};
        ratings.forEach((r) => {
            if (!r.user_id) return;
            if (!latestByUser[r.user_id]) latestByUser[r.user_id] = r;
        });
        return ids.map((id) => ({
            id,
            display_name: latestByUser[id]?.user_name || (id === this.currentUser?.id ? this.currentUser.display_name : 'Beer Lover'),
            avatar_url: null,
            rating_count: ratings.filter((r) => r.user_id === id).length
        }));
    }
};
