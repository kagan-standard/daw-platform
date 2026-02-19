# DAW Web — Fix "Invalid auth state" After Email Verification

## Context Files
- `apps/daw-web/index.html` — the single-file landing page with inline OIDC flow

---

## Problem

When a new user registers through Keycloak and clicks the email verification link, Keycloak redirects them to `https://drinksafterwork.net` (the daw-web landing page). But the URL Keycloak redirects to does NOT contain OIDC `?code=` or `?state=` parameters — it's just a clean redirect after verification.

However, if a `prompt=none` silent SSO check was added to the daw-web init flow, OR if there's leftover OIDC state in sessionStorage from the original registration tab, the page tries to process an OIDC callback that doesn't exist or has mismatched state, resulting in **"Invalid auth state. Try again."**

## Root Cause

In `apps/daw-web/index.html`, the `handleCallback()` function checks for a `code` param in the URL. If there's no `code` but there IS leftover `state`/`verifier` in sessionStorage from a previous registration attempt (in a different tab), the state mismatch triggers the error.

Additionally, if a `prompt=none` silent SSO check was implemented, it can conflict with the verification redirect flow.

## Fix

### 1. Make `handleCallback()` more resilient

In the `handleCallback()` function, update the state validation to be more forgiving:

```javascript
function handleCallback() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get('code');
    var state = params.get('state');
    var error = params.get('error');

    // Handle errors from Keycloak
    if (error) {
        // Clean the URL
        window.history.replaceState({}, '', redirectUri);

        // 'login_required' and 'interaction_required' are expected from prompt=none
        // Don't show an error for these — just silently show the login screen
        if (error === 'login_required' || error === 'interaction_required') {
            storageRemove('verifier');
            storageRemove('state');
            return Promise.resolve(null);
        }

        setAuthStatus('Login error: ' + (params.get('error_description') || error), true);
        return Promise.resolve(null);
    }

    // No code in URL = not an OIDC callback, nothing to do
    if (!code) return Promise.resolve(null);

    // Validate state — but if state is missing/mismatched, just clean up
    // instead of showing a scary error. This happens when:
    //   - User opened verification link in a different tab
    //   - sessionStorage was cleared between registration and callback
    //   - prompt=none redirect and state expired
    var savedState = storageGet('state');
    var verifier = storageGet('verifier');

    if (!state || !savedState || state !== savedState || !verifier) {
        // Clean up stale OIDC artifacts and URL params
        storageRemove('verifier');
        storageRemove('state');
        window.history.replaceState({}, '', redirectUri);
        // Don't show an error — just show the login screen normally
        // The user can click "Sign in with DAW" to do a fresh login
        return Promise.resolve(null);
    }

    // ... rest of the existing token exchange code stays the same ...
}
```

### 2. If a silent SSO check (`prompt=none`) was added to daw-web `init()`, remove it

The `prompt=none` approach causes problems specifically with the email verification flow because:
- Keycloak redirects to drinksafterwork.net after email verification
- The page immediately does a `prompt=none` redirect to Keycloak
- Keycloak returns with a code, but the state/verifier don't match (new page load = new sessionStorage)

**For daw-web specifically, do NOT use `prompt=none` silent SSO.** Instead, just check for existing tokens in sessionStorage. If none exist, show the login screen. The landing page is a lightweight launcher — forcing users to click "Sign in" once is fine here.

Search the `init()` function for any `prompt=none` or `_silentSSOCheck` logic and **remove it**. The init flow should be:

```javascript
function init() {
    renderServiceCard('logged-out-services', false);
    renderServiceCard('logged-in-services', true);

    if (!authority) {
        setAuthStatus('Keycloak not configured.', true);
        return;
    }

    // 1. Handle OIDC callback (if returning from Keycloak)
    handleCallback().then(function(user) {
        if (user) return; // Already logged in via callback

        // 2. Check existing session tokens
        var tokens = storageGet('tokens');
        if (tokens && tokens.access_token) {
            if (tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
                // Token expired — just show login screen
                // (Could try refresh_token here if implemented)
                storageRemove('tokens');
                return;
            }
            // Valid tokens — show logged-in state
            return getUserInfo(tokens.access_token).then(function(user) {
                if (user) showLoggedIn(user);
            }).catch(function() {
                storageRemove('tokens');
            });
        }

        // 3. No tokens, no callback — just show the login screen
        // Do NOT attempt prompt=none here
    });
}
```

### 3. Clean up stale sessionStorage on page load

Add this near the top of `init()`, before `handleCallback()`:

```javascript
// Clean up stale OIDC state if there's no code in the URL
// This prevents "invalid auth state" errors from leftover registration state
var urlParams = new URLSearchParams(window.location.search);
if (!urlParams.get('code') && !urlParams.get('error')) {
    storageRemove('verifier');
    storageRemove('state');
}
```

This ensures that if the user lands on the page without OIDC parameters (e.g., from an email verification link, a bookmark, or typing the URL), any leftover OIDC state is wiped clean.

---

## Also Apply to BeerBook (`apps/beerbook/supabase.js`)

The same state mismatch issue can happen in BeerBook. Apply similar fixes:

### In `handleOIDCCallback()`:
- When state doesn't match, **don't show a toast error** — just clean up and return null
- Add the `login_required` / `interaction_required` silent handling (if not already done)

### In `getSession()`:
- If a `prompt=none` silent SSO check was added, make sure it handles the email verification redirect case:
  - The `sso_silent_attempted` flag should prevent infinite loops
  - State mismatches should silently clean up, not show errors

### Clean up stale state on load:
Add the same cleanup logic — if there's no `?code=` in the URL, clear `oidc_verifier` and `oidc_state` from storage.

---

## Keycloak Configuration Check

Also verify in Keycloak admin that the email verification redirect URL is correct:

1. Go to **Realm Settings → Email** and check the email verification template
2. The verification link should NOT redirect to `drinksafterwork.net` with OIDC parameters — it should just verify the email and then show a success page or redirect cleanly
3. If you need to customize where users land after verification:
   - **Realm Settings → General → Frontend URL** — make sure this is set correctly
   - **Authentication → Flows → Registration** — the post-registration redirect goes to the client's redirect URI

The fix above handles this gracefully regardless of where Keycloak redirects after verification.

---

## Testing Checklist

- [ ] Register a new user via "Create Account" on drinksafterwork.net
- [ ] Click the verification email link → should land on drinksafterwork.net with NO error
- [ ] Login screen shows normally — user can click "Sign in with DAW" 
- [ ] Existing login flow still works (Sign in → Keycloak → return with session)
- [ ] Existing session resumption works (tokens in sessionStorage → auto-login)
- [ ] No "Invalid auth state" errors in any normal flow
- [ ] Bookmark/direct navigation to drinksafterwork.net works without errors

## Constraints
- Vanilla JS only
- Only modify `apps/daw-web/index.html` and optionally `apps/beerbook/supabase.js`
- Do NOT break existing login/logout flows
- Do NOT add `prompt=none` to daw-web
