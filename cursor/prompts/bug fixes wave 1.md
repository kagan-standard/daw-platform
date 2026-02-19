# BeerBook — Fix Cheers Greeting Rotation + SSO Double-Login

## Context Files (read ALL before writing code)
- `apps/beerbook/app.js` — main app logic, `enterApp()`, greeting logic
- `apps/beerbook/supabase.js` — OIDC/Keycloak auth flow, `getSession()`, `_refreshToken()`
- `apps/beerbook/index.html` — auth screen HTML, `#user-greeting` element
- `apps/beerbook/styles.css` — if any greeting-related styles need updating

---

## Issue 1: Cheers Greeting Does Not Randomize on Refresh

### Current Behavior
The greeting shown after login (e.g., "Hey, {name}!") does NOT change between page loads/refreshes. It's always the same static greeting.

### Desired Behavior
Every time the app loads (page refresh, new visit, re-login), the greeting should randomly pick from a fun array of beer-themed "cheers" greetings in different languages/styles. The greeting should feel fresh and playful each time.

### Implementation

**In `app.js`, find the `enterApp()` method** which currently has something like:
```javascript
const greeting = document.getElementById('user-greeting');
if (greeting && DB.currentUser) {
    greeting.textContent = `Hey, ${DB.currentUser.display_name}!`;
}
```

**Replace with a random greeting picker:**

```javascript
const greeting = document.getElementById('user-greeting');
if (greeting && DB.currentUser) {
    const name = DB.currentUser.display_name;
    const greetings = [
        `🍻 Cheers, ${name}!`,
        `🍺 Prost, ${name}!`,
        `🥂 Salud, ${name}!`,
        `🍻 Sláinte, ${name}!`,
        `🍺 Cin cin, ${name}!`,
        `🍻 Skål, ${name}!`,
        `🥂 干杯, ${name}!`,
        `🍺 건배, ${name}!`,
        `🍻 Na zdraví, ${name}!`,
        `🍺 Kampai, ${name}!`,
        `🥂 Santé, ${name}!`,
        `🍻 Proost, ${name}!`,
        `🍺 Zum Wohl, ${name}!`,
        `🥂 Saúde, ${name}!`,
        `🍻 Şerefe, ${name}!`,
        `🍺 L'chaim, ${name}!`,
        `🥂 Yamas, ${name}!`,
        `🍻 Na zdrowie, ${name}!`,
        `🍺 Egészségedre, ${name}!`,
        `🥂 Noroc, ${name}!`,
    ];
    greeting.textContent = greetings[Math.floor(Math.random() * greetings.length)];
}
```

**Key requirements:**
- The random selection must happen EVERY time `enterApp()` is called — no caching the greeting in localStorage/sessionStorage
- `Math.random()` is sufficient — no need for crypto randomness
- The emoji should be part of the greeting text
- If `display_name` is missing/empty, fall back to "Beer Lover"

---

## Issue 2: SSO Double Sign-In / Keycloak Prompt Persists

### Current Behavior
Users who are already logged into Keycloak (have an active Keycloak session) are STILL shown the BeerBook auth/login screen and have to click "Sign In with DAW" manually. This means they effectively sign in twice: once at Keycloak, and then click a button in BeerBook to trigger the redirect — even though Keycloak would auto-complete the flow since they already have a session.

### Desired Behavior
If a user already has a valid Keycloak session, BeerBook should **silently check** for it on page load and skip the auth screen entirely. The flow should be:

1. User visits BeerBook
2. BeerBook checks if there are stored OIDC tokens → if valid, enter app immediately
3. If no valid tokens, attempt a **silent SSO check** via a hidden iframe or redirect with `prompt=none`
4. If the silent check returns a code → exchange it, enter app
5. If the silent check fails (no Keycloak session) → show the auth screen with Sign In button

### Implementation

**In `supabase.js`, modify `getSession()`** to add a silent SSO check after the existing token checks fail:

```javascript
async getSession() {
    // Demo mode check (unchanged)
    if (this.isDemo || !this.hasConfig()) {
        const demo = Utils.storage.get('demo_user');
        if (demo) { this.currentUser = demo; this.isDemo = true; return demo; }
        return null;
    }

    // 1. Handle OIDC callback (unchanged)
    const cbUser = await this.handleOIDCCallback();
    if (cbUser) return cbUser;

    // 2. Check existing tokens (unchanged)
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
            const user = await this._getUserInfo(tokens.access_token);
            this.currentUser = user;
            return user;
        }
    }

    // 3. NEW: Silent SSO check — try to get a code from Keycloak without showing login UI
    return await this._silentSSOCheck();
},
```

**Add a new method `_silentSSOCheck()`:**

```javascript
async _silentSSOCheck() {
    // Don't attempt silent SSO if we already tried and failed this session
    if (Utils.storage.get('sso_silent_attempted')) return null;
    Utils.storage.set('sso_silent_attempted', true);

    try {
        if (!this.oidc.authEndpoint && !(await this._discoverOIDC())) return null;

        const { verifier, challenge } = await this._generatePKCE();
        const state = Utils.uid();
        Utils.storage.set('oidc_verifier', verifier);
        Utils.storage.set('oidc_state', state);

        // Redirect to Keycloak with prompt=none
        // If user has an active KC session, this returns immediately with a code
        // If not, it returns with error=login_required
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
        // Page will redirect — execution stops here
        // On return, handleOIDCCallback() will pick up the code
        // If error=login_required, handleOIDCCallback() will see the error and return null

        return null; // Won't reach here, but satisfy the return type
    } catch (e) {
        console.warn('Silent SSO check failed:', e.message);
        return null;
    }
},
```

**Also update `handleOIDCCallback()`** to handle the `login_required` error gracefully (don't show a toast for this expected case):

```javascript
async handleOIDCCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
        // Clear URL params
        window.history.replaceState({}, '', this.oidc.redirectUri);

        // 'login_required' and 'interaction_required' are expected from prompt=none
        // Don't show a toast for these — just silently fall through to show auth screen
        if (error === 'login_required' || error === 'interaction_required') {
            Utils.storage.remove('oidc_verifier');
            Utils.storage.remove('oidc_state');
            return null;
        }

        // For real errors, show the toast
        Utils.toast(`Login error: ${params.get('error_description') || error}`, 'error');
        return null;
    }

    // ... rest of the existing code/token exchange logic unchanged ...
}
```

### Important Notes

1. **`sso_silent_attempted` flag**: This prevents an infinite redirect loop. If the silent check fails (user not logged into Keycloak), we don't want to keep trying on every page load. Clear this flag when the user explicitly clicks "Sign In" (in `startLogin()` and `startRegistration()`).

2. **Add to `startLogin()` and `startRegistration()`**: Clear the silent attempt flag so a manual login always works:
   ```javascript
   Utils.storage.remove('sso_silent_attempted');
   ```

3. **Clear on successful logout**: In `signOut()`, also clear:
   ```javascript
   Utils.storage.remove('sso_silent_attempted');
   ```

4. **The `prompt=none` approach** is the standard OIDC way to check for an existing session. Keycloak fully supports it. An iframe-based approach is also possible but more complex and has cross-origin issues — the redirect approach is simpler and more reliable.

5. **User experience**: On first visit with no Keycloak session, the user will see a brief redirect to Keycloak and back before the auth screen shows. This is fast (usually <500ms) and much better than forcing every returning user to click "Sign In" when they're already authenticated.

---

## Testing Checklist

### Cheers Greeting
- [ ] Refresh the page multiple times — greeting should change between refreshes
- [ ] Greeting includes the user's display name
- [ ] Greeting shows an emoji at the start
- [ ] If user has no display name, shows "Beer Lover" as fallback

### SSO Silent Check
- [ ] **Already logged into Keycloak**: Visit BeerBook → should skip auth screen, go straight to app
- [ ] **NOT logged into Keycloak**: Visit BeerBook → brief redirect → auth screen shows (no toast error)
- [ ] **Explicit Sign In**: Click "Sign In with DAW" → normal Keycloak login flow works
- [ ] **After logout**: Sign out of BeerBook → auth screen shows → next visit does silent check again
- [ ] **Demo mode**: Silent SSO check should NOT run in demo mode
- [ ] **No infinite redirects**: If Keycloak is down or unreachable, app should show auth screen after one attempt

---

## Constraints
- Vanilla JS only — no libraries
- Do NOT modify `server.js` or the database schema
- Do NOT break existing demo mode functionality
- Do NOT remove any existing auth flow functionality — only ADD the silent check
- Keep the `prompt=none` redirect approach (not iframe)
