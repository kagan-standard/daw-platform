# DAW Platform — Fix "Create Account" Landing on Sign In Tab

## Context Files
- `apps/daw-web/index.html` — `startRegistration()` function
- `apps/beerbook/supabase.js` — `startRegistration()` method

---

## Problem

When users click "Create Account" on either drinksafterwork.net or beerbook.drinksafterwork.net, they are redirected to Keycloak but land on the **Sign In** tab instead of the **Create Account** tab. The user has to manually click the "Create Account" tab or the "New user? Register" link.

## Root Cause

The current code appends `&kc_action=register` to the authorization endpoint URL. In Keycloak 26.x, `kc_action=register` is NOT the correct way to go directly to the registration form.

## Fix

Keycloak exposes a dedicated **registration endpoint** in its OIDC discovery document. The correct approach for Keycloak is to use the registration URL directly, which is the same as the authorization endpoint but on the `/registrations` path instead of `/auth`.

### Fix for daw-web (`apps/daw-web/index.html`)

Update `startRegistration()`:

```javascript
window.startRegistration = function() {
    discoverOIDC().then(function(ok) {
        if (!ok) { setAuthStatus('Cannot connect to Keycloak.', true); return; }
        generatePKCE().then(function(pkce) {
            var state = uid();
            storageSet('verifier', pkce.verifier);
            storageSet('state', state);
            var params = new URLSearchParams({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: redirectUri,
                scope: 'openid profile email',
                state: state,
                code_challenge: pkce.challenge,
                code_challenge_method: 'S256'
            });

            // Use the registrations endpoint instead of auth endpoint
            // Keycloak's registration URL is the auth URL with /auth replaced by /registrations
            var registrationUrl = oidc.authEndpoint.replace('/protocol/openid-connect/auth', '/protocol/openid-connect/registrations');
            window.location.href = registrationUrl + '?' + params;
        });
    });
};
```

### Fix for BeerBook (`apps/beerbook/supabase.js`)

Update `startRegistration()`:

```javascript
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

    // Use the registrations endpoint instead of auth + kc_action=register
    const registrationUrl = this.oidc.authEndpoint.replace(
        '/protocol/openid-connect/auth',
        '/protocol/openid-connect/registrations'
    );
    window.location.href = `${registrationUrl}?${params}`;
},
```

### What's changing

| Before | After |
|--------|-------|
| `oidc.authEndpoint + '?' + params + '&kc_action=register'` | `oidc.authEndpoint.replace('.../auth', '.../registrations') + '?' + params` |

The `/registrations` endpoint is the standard Keycloak way to go directly to the registration form. It skips the Sign In tab entirely and shows only the registration fields.

### Important Notes

1. The OIDC callback flow is IDENTICAL — Keycloak returns a `?code=` to your redirect_uri regardless of whether the user signed in or registered. No changes needed to `handleCallback()` or `handleOIDCCallback()`.

2. Remove any remaining `kc_action=register` parameters from the codebase — search for `kc_action` and remove it everywhere. It's not needed with the `/registrations` endpoint approach.

3. The `/registrations` endpoint has been available since Keycloak 15+, so this is safe for Keycloak 26.x.

---

## Testing Checklist

- [ ] Click "Create Account" on drinksafterwork.net → lands directly on Keycloak registration form (NOT the Sign In tab)
- [ ] Click "Create Account" on beerbook.drinksafterwork.net → lands directly on Keycloak registration form
- [ ] Complete registration → redirected back to the originating app with valid session
- [ ] "Sign In" button still works normally → shows Keycloak Sign In form
- [ ] Existing users signing in are not affected

## Constraints
- Only modify `startRegistration()` in both files
- Do NOT change callback handling or token exchange logic
- Do NOT modify Keycloak configuration
