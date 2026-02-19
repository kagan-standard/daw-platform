# DAW Platform — Fix Auth Flow, Session Persistence, CTA Hierarchy, and Navigation

## Context Files (read ALL before writing code)
- `apps/daw-web/index.html` — landing page with inline OIDC flow
- `apps/daw-web/config.js` — DAW config with Keycloak settings
- `apps/beerbook/app.js` — BeerBook main app, `enterApp()`, hamburger menu
- `apps/beerbook/supabase.js` — BeerBook OIDC auth flow, `signOut()`
- `apps/beerbook/styles.css` — BeerBook styles including hamburger/menu
- `apps/beerbook/index.html` — BeerBook HTML

---

## Issue 1: DAW Landing Page Loses Session on Refresh

### Problem
After signing in at drinksafterwork.net, refreshing the page shows the logged-out state again (Sign In / Create Account buttons). The session is lost.

### Root Cause
`apps/daw-web/index.html` stores OIDC tokens in `sessionStorage`. While sessionStorage persists across refreshes in the same tab, there may be an issue with how the `init()` function checks for existing tokens on page load — it likely only checks the OIDC callback and doesn't fall through to checking stored tokens properly.

### Fix

In `apps/daw-web/index.html`, update the `init()` function. Make sure the flow is:

1. Check for OIDC callback (`?code=` in URL) → exchange for tokens → show logged-in
2. If no callback, check for existing tokens in sessionStorage → if valid, fetch userinfo → show logged-in
3. If no tokens, show logged-out state

The key fix: after `handleCallback()` resolves with `null` (no callback), the code MUST check for existing tokens. Find the `init()` function and ensure it looks like this:

```javascript
function init() {
    renderServiceCard('logged-out-services', false);
    renderServiceCard('logged-in-services', true);

    if (!authority) {
        setAuthStatus('Keycloak not configured.', true);
        return;
    }

    // Clean up stale OIDC state if not a callback
    var urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.get('code') && !urlParams.get('error')) {
        storageRemove('verifier');
        storageRemove('state');
    }

    handleCallback().then(function(user) {
        if (user) return; // Logged in via OIDC callback

        // Check for existing session tokens
        var tokens = storageGet('tokens');
        if (tokens && tokens.access_token) {
            // Check if token is expired
            if (tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
                // Try to refresh
                if (tokens.refresh_token) {
                    return refreshToken(tokens).then(function(success) {
                        if (!success) {
                            storageRemove('tokens');
                            return; // Show logged-out state
                        }
                        var newTokens = storageGet('tokens');
                        return getUserInfo(newTokens.access_token).then(function(u) {
                            if (u) showLoggedIn(u);
                        });
                    });
                }
                storageRemove('tokens');
                return; // Show logged-out state
            }
            // Token still valid — restore session
            return getUserInfo(tokens.access_token).then(function(u) {
                if (u) showLoggedIn(u);
            }).catch(function(err) {
                console.warn('Session restore failed:', err);
                storageRemove('tokens');
            });
        }

        // No tokens — show logged-out state (default)
    });
}
```

Also, add a `refreshToken` function if one doesn't exist:

```javascript
function refreshToken(tokens) {
    if (!tokens.refresh_token) return Promise.resolve(false);
    return discoverOIDC().then(function(ok) {
        if (!ok) return false;
        return fetch(oidc.tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: tokens.refresh_token,
                client_id: clientId
            }).toString()
        }).then(function(r) {
            if (!r.ok) return false;
            return r.json();
        }).then(function(t) {
            if (!t || !t.access_token) return false;
            storageSet('tokens', {
                access_token: t.access_token,
                refresh_token: t.refresh_token || tokens.refresh_token,
                id_token: t.id_token,
                expires_at: Date.now() + (t.expires_in * 1000)
            });
            return true;
        });
    }).catch(function() { return false; });
}
```

---

## Issue 2: BeerBook Sign-Out Button Does Not Work

### Problem
Clicking "Sign Out" in BeerBook does nothing visible — the user stays in the app.

### Likely Causes
1. The `signOut()` function in `supabase.js` redirects to Keycloak's `end_session_endpoint`, but Keycloak may redirect back to BeerBook, which then detects the still-valid Keycloak session (via `prompt=none` silent check) and logs back in immediately — creating an infinite loop or the appearance that sign-out did nothing.
2. The `end_session_endpoint` redirect might fail silently if `id_token` is missing or expired.

### Fix

In `apps/beerbook/supabase.js`, update the `signOut()` method:

```javascript
async signOut() {
    const tokens = Utils.storage.get('oidc_tokens');

    // Clear ALL local auth state FIRST
    Utils.storage.remove('oidc_tokens');
    Utils.storage.remove('oidc_verifier');
    Utils.storage.remove('oidc_state');
    Utils.storage.remove('sso_silent_attempted');
    this.currentUser = null;

    // If we have Keycloak endpoints and an id_token, do a proper Keycloak logout
    if (this.oidc.endSessionEndpoint && tokens?.id_token) {
        const params = new URLSearchParams({
            id_token_hint: tokens.id_token,
            post_logout_redirect_uri: this.oidc.redirectUri,
        });
        window.location.href = `${this.oidc.endSessionEndpoint}?${params}`;
        return; // Page will redirect
    }

    // Fallback: just show auth screen (no Keycloak logout)
    document.getElementById('app').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
},
```

**CRITICAL:** Also check that the `post_logout_redirect_uri` is configured in Keycloak for the `beerbook` client:

1. Keycloak Admin → Clients → `beerbook`
2. **Valid post logout redirect URIs** must include: `https://beerbook.drinksafterwork.net/*`
3. If this is missing, Keycloak will ignore the redirect and show its own default post-logout page

**Also CRITICAL:** If a `prompt=none` silent SSO check was added to BeerBook's `getSession()`, it MUST check the `sso_silent_attempted` flag. After logout, the flag is cleared. On the next page load, the silent check will run, but since we just logged out of Keycloak (via end_session_endpoint), Keycloak will return `error=login_required`, and the silent check will fail gracefully → show auth screen.

If the `prompt=none` was NOT added to BeerBook (only to daw-web), then sign-out should work fine once the local tokens are cleared.

---

## Issue 3: CTA Hierarchy — "Create Account" Should Be Primary

### Problem
On the DAW landing page, "SIGN IN WITH DAW" is the prominent gold button, while "CREATE ACCOUNT" is the outline/secondary button. On BeerBook, "Create Account" is the amber primary button and "Sign In with DAW" is secondary. These should be consistent, and "Create Account" should be the primary CTA on BOTH.

### Rationale
- New user acquisition > returning user convenience
- Returning users know where to click regardless of styling
- "Create Account" as the primary CTA signals growth mindset

### Fix for daw-web (`apps/daw-web/index.html`)

Swap the button order and styles. Find the auth buttons section:

```html
<!-- BEFORE (wrong hierarchy): -->
<button class="btn btn-gold" id="btn-signin">SIGN IN WITH DAW</button>
<button class="btn btn-outline" id="btn-register">CREATE ACCOUNT</button>

<!-- AFTER (correct hierarchy): -->
<button class="btn btn-gold" id="btn-register">CREATE ACCOUNT</button>
<button class="btn btn-outline" id="btn-signin">SIGN IN WITH DAW</button>
```

Make sure the `onclick` handlers (`startLogin` and `startRegistration`) stay attached to the correct buttons after swapping.

### Fix for BeerBook (`apps/beerbook/index.html`)

BeerBook already has "Create Account" as primary — verify this is the case and keep it. If the order was changed by a previous Cursor edit, restore it:

```html
<!-- Correct order for BeerBook auth screen: -->
<button id="sso-register" class="btn btn-primary btn-full btn-lg">Create Account</button>
<button id="sso-login" class="btn btn-amber btn-full">Sign In with DAW</button>
```

---

## Issue 4: Hamburger Menu Should Not Appear on Desktop

### Problem
The hamburger menu (☰) shows on desktop/wide screens where it's unnecessary. BeerBook has a bottom navbar for mobile — the hamburger should only appear on mobile as a supplementary menu, or not at all if the bottom nav is always visible.

### Fix

In `apps/beerbook/styles.css`, hide the hamburger button and its dropdown on desktop:

```css
/* Hamburger menu — mobile only */
@media (min-width: 769px) {
    .hamburger-btn,
    #menu-toggle {
        display: none !important;
    }

    .hamburger-dropdown,
    #hamburger-menu {
        display: none !important;
    }
}
```

The hamburger should only be visible on mobile (< 769px) as a way to access supplementary items (Activity Feed, Leaderboard, YG Exchange, Settings, Sign Out) that don't fit in the bottom nav.

On desktop, these items should be accessible through the bottom nav or through the existing view navigation. If a desktop nav bar is needed later, that's a separate design decision.

---

## Issue 5: Cross-App SSO Continuity (BeerBook ↔ DAW Landing)

### Problem
After logging in at drinksafterwork.net and clicking the BeerBook launcher, BeerBook opens in a new tab but shows its own auth screen — it doesn't detect the existing Keycloak session.

### The Right Approach
BeerBook's `getSession()` should attempt a silent SSO check (`prompt=none`) when there are no stored tokens. This was addressed in a previous Cursor prompt (`CURSOR_PROMPT_cheers_greeting_and_sso.md`). Verify this is implemented correctly:

1. User visits BeerBook (new tab, no tokens)
2. `getSession()` finds no stored tokens
3. It does a redirect to Keycloak with `prompt=none`
4. Keycloak has an active session (from daw-web login) → returns a code
5. BeerBook exchanges the code → user is logged in, no auth screen shown

**If the `prompt=none` silent check was removed or not implemented in BeerBook**, add it back per the previous prompt. The key is the `sso_silent_attempted` flag that prevents infinite redirect loops.

**If it WAS implemented but isn't working**, check:
- Is the `sso_silent_attempted` flag being stored in `localStorage` or `sessionStorage`? Since BeerBook opens in a NEW tab, `sessionStorage` would be empty. The flag should be in `sessionStorage` (so it resets per tab — that's correct, each new tab gets one silent check attempt).
- Is `handleOIDCCallback()` correctly handling the code returned from the `prompt=none` redirect?
- Check browser console for any errors during the silent check redirect.

---

## Issue 6: Clean Up handleCallback Error Handling (daw-web)

### Problem
State mismatches from email verification redirects or stale sessionStorage cause "Invalid auth state" errors.

### Fix
This was addressed in a previous prompt, but verify it's applied. In `handleCallback()`:

```javascript
// If state doesn't match, DON'T show an error — just clean up silently
if (!state || !savedState || state !== savedState || !verifier) {
    storageRemove('verifier');
    storageRemove('state');
    window.history.replaceState({}, '', redirectUri);
    return Promise.resolve(null); // Show login screen normally, no error
}
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `apps/daw-web/index.html` | Fix `init()` to restore session from stored tokens on refresh; add `refreshToken()`; swap CTA button order; silence state mismatch errors; clean stale OIDC state on load |
| `apps/beerbook/supabase.js` | Fix `signOut()` to clear all state before Keycloak redirect; verify `prompt=none` silent SSO check works for cross-app continuity |
| `apps/beerbook/styles.css` | Hide hamburger menu on desktop (min-width: 769px) |
| `apps/beerbook/index.html` | Verify CTA order: Create Account primary, Sign In secondary |

## Testing Checklist

### Session Persistence (daw-web)
- [ ] Sign in at drinksafterwork.net → see logged-in state with username
- [ ] Refresh the page → STILL logged in (no Sign In buttons)
- [ ] Close tab, open new tab to drinksafterwork.net → may need to sign in again (sessionStorage) — this is acceptable
- [ ] Sign out → see logged-out state → refresh → still logged out

### Sign-Out (BeerBook)
- [ ] Sign into BeerBook → click Sign Out → see auth screen
- [ ] After sign-out, refresh → auth screen still shown (not auto-logged back in)
- [ ] After sign-out from BeerBook, go to drinksafterwork.net → also logged out (Keycloak session ended)

### CTA Hierarchy
- [ ] drinksafterwork.net: "CREATE ACCOUNT" is the gold/primary button, "SIGN IN WITH DAW" is secondary
- [ ] beerbook.drinksafterwork.net: "Create Account" is the primary button, "Sign In with DAW" is secondary

### Hamburger Menu
- [ ] On desktop (>769px): hamburger icon is NOT visible
- [ ] On mobile (<769px): hamburger icon IS visible and works as designed

### Cross-App SSO
- [ ] Sign in at drinksafterwork.net → click BeerBook → new tab opens → BeerBook should auto-detect Keycloak session and skip auth screen (may involve a brief redirect)
- [ ] If not auto-detected, clicking "Sign In with DAW" in BeerBook should complete instantly (no password prompt, Keycloak session exists)

### Registration Flow
- [ ] Click "Create Account" on drinksafterwork.net → goes to Keycloak register page
- [ ] Complete registration → email verification → click email link → lands on drinksafterwork.net with NO errors
- [ ] Can then sign in normally

## Constraints
- Vanilla JS only — no frameworks or libraries
- Do NOT modify `server.js`, database schema, or Keycloak realm config files
- Do NOT break demo mode in BeerBook
- Keep the visual identity distinct between daw-web (navy/gold) and BeerBook (amber/mahogany)
