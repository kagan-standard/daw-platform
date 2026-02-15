# Phase 2 — DAW Web as the Front Door

Apply cursor/prompts/00_system.md rules.

Existing Traefik docker network name is `traefik`.
DAW Web source files are already in `apps/daw-web/` (imported from `/opt/daw-signup/site/`).
BeerBook OIDC pattern to reference: `apps/beerbook/supabase.js` (PKCE flow).

## Goal

Make `https://drinksafterwork.net` the central launchpad for all DAW services. Replace the current Matrix-only login/register page with a Keycloak-powered front door that shows service launcher cards and a logged-in user experience.

## Definition of Done

- [ ] `https://drinksafterwork.net` loads from the `daw-web` container managed by `docker-compose.yml`
- [ ] Old standalone `daw-signup` container is documented for retirement (operator stops it manually)
- [ ] Landing page shows service launcher cards (BeerBook, DAW Chat, DAWFootball)
- [ ] "Sign in with DAW" uses Keycloak OIDC Authorization Code + PKCE (same pattern as BeerBook)
- [ ] Logged-in state shows username, avatar, and quick-launch links
- [ ] Logged-out state shows launcher cards with public info + sign-in button
- [ ] Registration link goes to Keycloak self-registration (not the old Matrix register form)
- [ ] Existing visual identity preserved (dark theme, gold accents, cityscape, stars, Bebas Neue + Outfit fonts)
- [ ] Mobile responsive (works on 360px+ screens)
- [ ] Smoke tests pass
- [ ] Rollback steps documented and tested

---

## Task 0: Add daw-web to docker-compose.yml

**What to do:**
- [ ] Add `daw-web` service to `infra/compose/docker-compose.yml`
- [ ] Follow the exact same pattern as the `beerbook` nginx container
- [ ] Use pinned image tag `nginx:1.25-alpine` (same as beerbook — no `:latest`)
- [ ] Traefik labels for `drinksafterwork.net`
- [ ] Volume mount `../../apps/daw-web` to `/usr/share/nginx/html:ro`
- [ ] Network: `traefik` only (no internal services needed)

**Service definition (add to public section of docker-compose.yml):**
```yaml
  daw-web:
    image: nginx:1.25-alpine
    container_name: daw-web
    restart: unless-stopped
    volumes:
      - ../../apps/daw-web:/usr/share/nginx/html:ro
    networks:
      - traefik
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.daw-web.rule=Host(`drinksafterwork.net`)"
      - "traefik.http.routers.daw-web.entrypoints=web-secure"
      - "traefik.http.routers.daw-web.tls=true"
      - "traefik.http.routers.daw-web.tls.certresolver=default"
      - "traefik.http.services.daw-web.loadbalancer.server.port=80"
```

**Success criteria:**
- [ ] `docker compose up -d daw-web` starts without errors
- [ ] `docker network inspect traefik` lists `daw-web`
- [ ] `curl -fsSI https://drinksafterwork.net` returns 200 with HTML content
- [ ] Existing services (keycloak, beerbook, beerbook-api) still respond normally

**Abort / rollback if:**
- Traefik routing for existing services breaks
- daw-web container enters restart loop

**Rollback:** Remove the `daw-web` service from docker-compose.yml, run `docker compose up -d --remove-orphans`. The old standalone `daw-signup` container should still be running as fallback until explicitly retired.

---

## Task 1: Configure Keycloak Client for daw-web

**What to do:**
- [ ] Create a new Keycloak client `daw-web` in the `daw` realm (or document the manual steps for operator)
  - Client type: Public (no secret)
  - Authentication flow: Authorization Code + PKCE
  - Valid redirect URIs: `https://drinksafterwork.net/*`
  - Valid post-logout redirect URIs: `https://drinksafterwork.net/*`
  - Web origins: `https://drinksafterwork.net`
  - Client scopes: `openid`, `profile`, `email`
- [ ] Add audience mapper: access tokens include `aud: daw-web`
  - Mapper type: Audience
  - Included Client Audience: `daw-web`
  - Add to access token: ON
  - Add to ID token: OFF

**Note for agent:** This is a manual Keycloak admin step. Document it clearly in the deploy runbook. Do NOT attempt to automate Keycloak admin API calls unless you are certain the admin credentials are available.

**Success criteria:**
- [ ] `curl https://auth.drinksafterwork.net/realms/daw/.well-known/openid-configuration` returns valid JSON
- [ ] Client `daw-web` exists in Keycloak admin console with correct redirect URIs
- [ ] Decoded test access token contains `aud` including `daw-web`

---

## Task 2: Create daw-web config.js

**What to do:**
- [ ] Create `apps/daw-web/config.js` with baked-in configuration (same pattern as BeerBook):

```javascript
// DAW Web runtime config (Phase 2)
window.DAW_CONFIG = {
    keycloak: {
        authority: 'https://auth.drinksafterwork.net/realms/daw',
        clientId: 'daw-web'
    },
    services: [
        {
            id: 'beerbook',
            name: 'BeerBook',
            desc: 'Rate & review beers with the crew',
            url: 'https://beerbook.drinksafterwork.net',
            icon: 'beer',
            status: 'live'
        },
        {
            id: 'chat',
            name: 'DAW Chat',
            desc: 'Encrypted group chat, powered by Matrix',
            url: 'https://element.drinksafterwork.net',
            icon: 'chat',
            status: 'live'
        },
        {
            id: 'football',
            name: 'DAW Fantasy Football',
            desc: 'League tracker & draft room',
            url: 'https://football.drinksafterwork.net',
            icon: 'football',
            status: 'coming-soon'
        }
    ]
};
```

**Success criteria:**
- [ ] `config.js` loads in browser without errors
- [ ] Service data is readable from `window.DAW_CONFIG.services`

---

## Task 3: Rewrite index.html — Front Door Landing Page

**What to do:**
- [ ] Replace the current Matrix login/register page with a Keycloak-powered front door
- [ ] The page has TWO states: **logged-out** (default) and **logged-in**

### Logged-out state (default):
- DAW logo + "Drinks After Work" branding (keep existing visual identity)
- Tagline (e.g. "Where the crew links up" or similar)
- Service launcher cards rendered from `config.js` services array:
  - Each card shows: icon, name, description, status badge
  - `live` services are clickable links to their URLs
  - `coming-soon` services are greyed/disabled with "Coming Soon" badge
- "Sign in with DAW" button (prominent, gold)
- "Create Account" button (secondary)
- Stars + cityscape background (keep existing aesthetic)
- No Matrix login form — all auth goes through Keycloak

### Logged-in state (after OIDC callback):
- Greeting: "Welcome, {display_name}" with avatar (from Keycloak userinfo)
- Same service launcher cards, but now clickable and personalized
- Quick links section
- Sign out button
- Avatar: use Keycloak `picture` claim if available, otherwise show initials in a styled circle

### OIDC Implementation:
- [ ] Implement Keycloak OIDC Authorization Code + PKCE flow (reference `apps/beerbook/supabase.js` for the exact pattern)
- [ ] On page load: check for `?code=` parameter (OIDC callback), exchange for tokens
- [ ] Store tokens in `sessionStorage` (NOT localStorage — no persistent login for the landing page)
- [ ] Fetch userinfo from Keycloak userinfo endpoint to get display name, email, avatar
- [ ] On "Sign in with DAW" click: redirect to Keycloak authorize endpoint with PKCE
- [ ] On "Create Account" click: same redirect but with `kc_action=register` parameter
- [ ] On "Sign out" click: clear session, optionally redirect to Keycloak end_session_endpoint
- [ ] OIDC discovery via `/.well-known/openid-configuration` (same as BeerBook)
- [ ] Generate PKCE code_verifier + code_challenge with `crypto.subtle` (same as BeerBook)
- [ ] State parameter for CSRF protection (same as BeerBook)

### Design constraints:
- [ ] Keep: dark navy background (#0b0e1a), gold accents (#f5b731), Bebas Neue + Outfit fonts
- [ ] Keep: animated stars canvas, cityscape SVG silhouette
- [ ] Keep: card-based layout with hover effects, smooth transitions
- [ ] Keep: mobile responsive (360px+)
- [ ] Vanilla JavaScript only — no frameworks, no build step, no npm
- [ ] Single HTML file with inline CSS and JS (same as current pattern)
- [ ] Load `config.js` as a separate `<script>` tag (so config can be changed without editing HTML)

### What to remove from the current index.html:
- [ ] Matrix homeserver login form (handleLogin function hitting `/_matrix/client/v3/login`)
- [ ] Matrix register form (handleRegister function hitting `/_matrix/client/v3/register`)
- [ ] reCAPTCHA integration (`grecaptcha`, sitekey)
- [ ] All references to `matrix.drinksafterwork.net` as a homeserver
- [ ] The "Connecting to drinksafterwork.net" homeserver badge
- [ ] The post-register welcome card (Element app download instructions)

### What to keep / evolve:
- [ ] The launcher card grid (expand from 2 placeholder items to the 3 real services)
- [ ] The card-switching animation system (auth-card → launcher-card transitions)
- [ ] The visual identity (colors, fonts, stars, cityscape)
- [ ] The "web chat hint" can become a footer link to Element
- [ ] Mobile breakpoints

**Success criteria:**
- [ ] Page loads at `https://drinksafterwork.net` with service cards visible (no login required to see them)
- [ ] "Sign in with DAW" redirects to Keycloak, returns with tokens, shows logged-in state
- [ ] "Create Account" redirects to Keycloak registration page
- [ ] Logged-in state shows username from Keycloak
- [ ] Sign out clears session and returns to logged-out view
- [ ] Service cards link to correct URLs (BeerBook, Element)
- [ ] DAWFootball card is greyed out / disabled
- [ ] Mobile layout works (no horizontal scroll, cards stack vertically)
- [ ] No references to Matrix login API in the code
- [ ] No reCAPTCHA loaded

**Abort / rollback if:**
- OIDC flow fails (Keycloak misconfiguration, CORS, redirect URI mismatch)
- Page fails to load or shows blank screen

**Rollback:** Restore previous `index.html` from git: `git checkout HEAD~1 -- apps/daw-web/index.html`, redeploy.

---

## Task 4: Remove signup.html

**What to do:**
- [ ] Delete `apps/daw-web/signup.html` from the repo (if it was imported)
- [ ] Registration is now handled entirely by Keycloak — no standalone signup page needed
- [ ] If there are any links to `signup.html` or `signup.drinksafterwork.net`, they should redirect to Keycloak registration

**Note:** The `signup.html` was a Matrix-specific registration form. With Keycloak as identity provider, users register through the Keycloak hosted UI at `auth.drinksafterwork.net`. The "Create Account" button on the landing page uses the `kc_action=register` parameter to go directly to Keycloak's register form.

**Success criteria:**
- [ ] `signup.html` does not exist in `apps/daw-web/`
- [ ] No broken links to a signup page

---

## Task 5: Update Runbooks and Docs

**What to do:**
- [ ] Update `runbooks/deploy.md`:
  - Add section for daw-web deployment
  - Document Keycloak `daw-web` client creation steps
  - Document retirement of old `daw-signup` container
- [ ] Update `runbooks/smoke_tests.md`:
  - Add daw-web smoke tests
- [ ] Update `runbooks/troubleshooting.md`:
  - Add daw-web section (OIDC redirect issues, Traefik routing)
- [ ] Update `ARCHITECTURE.md`:
  - Change daw-web Runtime/Host from "TBD" to "Hetzner VM (Docker)"
  - Note that daw-web is now in `apps/daw-web/` and part of the main compose
- [ ] Update `DECISIONS.md`:
  - Add "Phase 2 RLS Gate Deferral" decision: RLS gate deferred to pre-Phase 4 (before a second service shares the database). Rationale: beerbook-api validates all tokens and enforces ownership; PostgREST is internal-only. RLS becomes necessary when multiple services share Supabase.
  - Add "daw-web Identity" decision: daw-web uses Keycloak OIDC (client `daw-web`, public, PKCE). Matrix direct login retired.
  - Add "daw-web Session" decision: tokens in sessionStorage only (not localStorage). Landing page does not need persistent sessions.
- [ ] Update `cursor/tickets/02_front_door.md` with completion status

**Success criteria:**
- [ ] Runbooks cover daw-web
- [ ] Architecture doc reflects current state
- [ ] DECISIONS.md has Phase 2 entries

---

## Task 6: Smoke Tests

Run on VPS or from a host that can reach the URLs.

```bash
# 1. daw-web loads
curl -fsSI https://drinksafterwork.net | head

# 2. Existing services still work
curl -fsSI https://beerbook.drinksafterwork.net | head
curl -fsSI https://auth.drinksafterwork.net | head
curl -fsSI https://api.beerbook.drinksafterwork.net/api/health

# 3. daw-web serves config.js
curl -fsSI https://drinksafterwork.net/config.js

# 4. OIDC discovery still works
curl -s https://auth.drinksafterwork.net/realms/daw/.well-known/openid-configuration | head

# 5. No Matrix login endpoint references in page source
curl -s https://drinksafterwork.net | grep -c "_matrix/client" 
# Expected: 0

# 6. No reCAPTCHA loaded
curl -s https://drinksafterwork.net | grep -c "recaptcha"
# Expected: 0
```

**Manual browser tests:**
- [ ] Open `https://drinksafterwork.net` — see launcher cards without logging in
- [ ] Click "Sign in with DAW" — redirected to Keycloak login
- [ ] Log in with existing DAW account — returned to landing page with username displayed
- [ ] Click BeerBook card — navigates to `beerbook.drinksafterwork.net`
- [ ] Click DAW Chat card — navigates to `element.drinksafterwork.net`
- [ ] DAWFootball card is visually disabled
- [ ] Click "Sign out" — returns to logged-out state
- [ ] Test on mobile viewport (Chrome DevTools 375px width)

---

## Task 7: Operator Instructions — Retire Old daw-signup

After Phase 2 is verified, the operator (you) should manually retire the old container:

```bash
# 1. Verify new daw-web is working
curl -fsSI https://drinksafterwork.net | head
# Should return 200

# 2. Stop old standalone container
docker stop daw-signup
docker rm daw-signup

# 3. Optionally archive old files
mv /opt/daw-signup /opt/daw-signup.bak

# 4. Verify site still works (now served by daw-web in main compose)
curl -fsSI https://drinksafterwork.net | head
```

**Do NOT delete /opt/daw-signup until you've confirmed the new container works.** Keep the backup for at least a week.

---

## Constraints

- No architectural changes to existing services (Keycloak, BeerBook, Supabase)
- No changes to BeerBook code or beerbook-api
- No docker commands executed locally — all deploy instructions target VPS
- Always use explicit compose file path: `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env ...`
- Never run `docker compose down -v` on prod
- Vanilla JS only — no React, no Vue, no build step
- daw-web does NOT need its own API — it's a static site with client-side OIDC
- daw-web does NOT store any data — it only reads Keycloak userinfo for display
- Keycloak client `daw-web` is separate from client `beerbook` (different audience, different redirect URIs)

## Required Output

1. Plan (max 12 bullets)
2. All file changes (new and modified)
3. Validation commands (VPS-side)
4. Rollback steps (exact)
5. Updated runbooks

## Agent Assumption Log

_Agents must log assumptions here instead of asking (per DECISIONS.md):_

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| 2025-02-15 | 0 | Compose path on VPS is `/opt/daw-platform`; Traefik entrypoint `web-secure` and cert resolver `default` match existing beerbook labels. | Same as Phase 1 deploy runbook. |
| 2025-02-15 | 1 | Keycloak client `daw-web` is created manually by operator; no admin API automation. | DECISIONS + prompt: do not automate Keycloak admin unless credentials available. |
| 2025-02-15 | 2 | config.js loaded synchronously before inline script. | Single HTML + separate config pattern per prompt. |
| 2025-02-15 | 3 | OIDC storage: sessionStorage prefix `daw_oidc_`; no refresh on landing. | sessionStorage-only per DECISIONS; PKCE from BeerBook supabase.js. |
| 2025-02-15 | 3 | Tagline "Where the crew links up"; service icons emoji. | Sensible default. |
| 2025-02-15 | 4 | signup.html not present in apps/daw-web; no file deleted. | Glob found 0 files. |
| 2025-02-15 | 5–7 | Runbooks/docs updated; operator runs deploy on VPS. | No docker locally per prompt. |

---

## Validation commands (VPS)

```bash
docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env up -d daw-web
docker network inspect traefik
curl -fsSI https://drinksafterwork.net
curl -fsSI https://beerbook.drinksafterwork.net
curl -fsSI https://auth.drinksafterwork.net
curl -fsSI https://drinksafterwork.net/config.js
curl -s https://auth.drinksafterwork.net/realms/daw/.well-known/openid-configuration
curl -s https://drinksafterwork.net | grep -c "_matrix/client"
curl -s https://drinksafterwork.net | grep -c "recaptcha"
```

---

## Rollback steps (exact)

1. **Revert daw-web service:** Remove the `daw-web` service block from `infra/compose/docker-compose.yml`. Run:  
   `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env up -d --remove-orphans`  
   Old standalone `daw-signup` (if still running) remains as fallback.

2. **Revert index.html only:**  
   `git checkout HEAD~1 -- apps/daw-web/index.html`  
   Restart or rely on volume mount to serve reverted file.
