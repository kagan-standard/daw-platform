/* ============================================
   BeerBook — Supabase (data) + Keycloak (auth)
   
   Auth: Keycloak OIDC Authorization Code + PKCE
   Data: Supabase (PostgreSQL + Realtime)
   Demo: localStorage fallback
   ============================================ */

const DB = {
    client: null,
    isDemo: false,
    currentUser: null,
    subscriptions: [],

    // Keycloak OIDC config
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

    // ========== INITIALIZATION ==========
    async init() {
        const sbConfig = Utils.storage.get('supabase_config');
        const kcConfig = Utils.storage.get('keycloak_config');
        this.oidc.redirectUri = window.location.origin + window.location.pathname;

        if (kcConfig && kcConfig.authority) {
            this.oidc.authority = kcConfig.authority;
            this.oidc.clientId = kcConfig.clientId || 'beerbook';
            await this._discoverOIDC();
        }

        if (sbConfig && sbConfig.url && sbConfig.key) {
            try {
                this.client = supabase.createClient(sbConfig.url, sbConfig.key, {
                    auth: { persistSession: false, autoRefreshToken: false }
                });
                const { error } = await this.client.from('ratings').select('id').limit(1);
                if (error && error.code === '42P01') {
                    Utils.toast('Database tables not found. Run schema SQL first.', 'error');
                    this.isDemo = true;
                } else if (error) {
                    throw error;
                }
                console.log('Supabase data layer connected');
            } catch (e) {
                console.warn('Supabase failed, demo mode:', e.message);
                this.isDemo = true;
                this.client = null;
            }
        } else {
            this.isDemo = true;
        }
    },

    // ========== OIDC DISCOVERY ==========
    async _discoverOIDC() {
        try {
            const res = await fetch(`${this.oidc.authority}/.well-known/openid-configuration`);
            if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
            const cfg = await res.json();
            this.oidc.authEndpoint = cfg.authorization_endpoint;
            this.oidc.tokenEndpoint = cfg.token_endpoint;
            this.oidc.userinfoEndpoint = cfg.userinfo_endpoint;
            this.oidc.endSessionEndpoint = cfg.end_session_endpoint;
            console.log('OIDC discovery complete');
            return true;
        } catch (e) {
            console.warn('OIDC discovery failed:', e.message);
            return false;
        }
    },

    // ========== CONFIG ==========
    saveConfig(sbUrl, sbKey, kcAuthority, kcClientId) {
        if (sbUrl && sbKey) Utils.storage.set('supabase_config', { url: sbUrl, key: sbKey });
        if (kcAuthority) {
            Utils.storage.set('keycloak_config', {
                authority: kcAuthority.replace(/\/+$/, ''),
                clientId: kcClientId || 'beerbook'
            });
        }
    },
    hasConfig() { const kc = Utils.storage.get('keycloak_config'); return kc && kc.authority; },
    hasDataConfig() { const sb = Utils.storage.get('supabase_config'); return sb && sb.url && sb.key; },
    clearConfig() { Utils.storage.remove('supabase_config'); Utils.storage.remove('keycloak_config'); },

    // ========== PKCE HELPERS ==========
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

    // ========== KEYCLOAK LOGIN ==========
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

    // ========== KEYCLOAK REGISTRATION ==========
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
        // Keycloak registration hint
        window.location.href = `${this.oidc.authEndpoint}?${params}&kc_action=register`;
    },

    // ========== HANDLE OIDC CALLBACK ==========
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

    // ========== SESSION ==========
    async getSession() {
        // Demo check
        if (this.isDemo || !this.hasConfig()) {
            const demo = Utils.storage.get('demo_user');
            if (demo) { this.currentUser = demo; this.isDemo = true; return demo; }
            return null;
        }

        // OIDC callback?
        const cbUser = await this.handleOIDCCallback();
        if (cbUser) return cbUser;

        // Existing tokens?
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
        const tokens = Utils.storage.get('oidc_tokens');
        this.subscriptions.forEach(s => { if (s?.unsubscribe) s.unsubscribe(); });
        this.subscriptions = [];
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

    // ========== CRUD (unchanged) ==========
    async addRating(rating) {
        const record = {
            id: Utils.uid(), user_id: this.currentUser.id, user_name: this.currentUser.display_name,
            beer_name: rating.beerName, brewery: rating.brewery || '', style: rating.style,
            abv: rating.abv || null, rating: rating.rating,
            flavor_hoppy: rating.flavors?.hoppy || 0, flavor_malty: rating.flavors?.malty || 0,
            flavor_bitter: rating.flavors?.bitter || 0, flavor_sweet: rating.flavors?.sweet || 0,
            flavor_fruity: rating.flavors?.fruity || 0,
            notes: rating.notes || '', created_at: new Date().toISOString()
        };
        if (this.isDemo) {
            const reviews = Utils.storage.get('reviews', []);
            reviews.unshift(record); Utils.storage.set('reviews', reviews); return record;
        }
        const { data, error } = await this.client.from('ratings').insert(record).select().single();
        if (error) throw error; return data;
    },

    async getAllRatings() {
        if (this.isDemo) return Utils.storage.get('reviews', []);
        const { data, error } = await this.client.from('ratings').select('*').order('created_at', { ascending: false });
        if (error) throw error; return data || [];
    },

    async getUserRatings(userId) {
        if (this.isDemo) return Utils.storage.get('reviews', []).filter(r => r.user_id === userId);
        const { data, error } = await this.client.from('ratings').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (error) throw error; return data || [];
    },

    async deleteRating(id) {
        if (this.isDemo) {
            const r = Utils.storage.get('reviews', []);
            Utils.storage.set('reviews', r.filter(x => x.id !== id)); return true;
        }
        const { error } = await this.client.from('ratings').delete().eq('id', id).eq('user_id', this.currentUser.id);
        if (error) throw error; return true;
    },

    async getStats() {
        const ratings = await this.getAllRatings();
        const users = new Set(ratings.map(r => r.user_id));
        return {
            totalBeers: new Set(ratings.map(r => r.beer_name.toLowerCase())).size,
            totalReviews: ratings.length, totalUsers: users.size,
            avgRating: ratings.length ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1) : '0.0',
            ratings
        };
    },

    subscribeToRatings(callback) {
        if (this.isDemo || !this.client) return;
        const ch = this.client.channel('ratings-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings' }, callback)
            .subscribe();
        this.subscriptions.push(ch);
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
        const { data, error } = await this.client.from('profiles').select('*');
        if (error) throw error; return data || [];
    }
};
