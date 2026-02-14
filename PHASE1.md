# Phase 1: Ship BeerBook with DAW SSO

## Goal
Ship a working BeerBook at `https://beerbook.drinksafterwork.net` with DAW SSO via Keycloak at `https://auth.drinksafterwork.net`, and self-hosted Supabase as the data + realtime layer. All services run on the Hetzner VM (`178.156.232.88`) behind the existing Traefik reverse proxy.

## Definition of Done
- [ ] BeerBook loads publicly over HTTPS
- [ ] "Sign in with DAW" redirects to Keycloak and returns successfully (PKCE)
- [ ] User can create a rating/review and it persists across page refresh
- [ ] Supabase is running locally on Hetzner (Postgres not publicly exposed)
- [ ] Browser never talks directly to Supabase — all data flows through `beerbook-api`
- [ ] Runbooks exist for install, restart, backup, and smoke tests

---

## Task 0: Repo + Docs Sanity

**What to do:**
- [ ] Create `daw-platform` repo (local git init, can push to remote later)
- [ ] Add `ARCHITECTURE.md` (from existing draft)
- [ ] Add `DECISIONS.md` (v1, including BeerBook Stack Decision + Data Access Pattern Decision)
- [ ] Add `PHASE1.md` (this file)
- [ ] Place existing BeerBook source in `apps/beerbook/`

**Repo structure:**
```
daw-platform/
├── ARCHITECTURE.md
├── DECISIONS.md
├── PHASE1.md
├── infra/
│   └── compose/
│       ├── docker-compose.yml
│       ├── .env.example
│       └── run.sh
├── apps/
│   ├── beerbook/
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── supabase.js
│   │   ├── charts.js
│   │   ├── utils.js
│   │   ├── sample-data.js
│   │   ├── styles.css
│   │   ├── appletouchicon.png
│   │   └── docs/
│   │       ├── setup.md
│   │       └── database-schema.sql
│   └── beerbook-api/
│       ├── package.json
│       ├── server.js
│       ├── Dockerfile
│       └── .env.example
└── runbooks/
    ├── deploy.md
    ├── smoke_tests.md
    ├── backup_restore.md
    └── troubleshooting.md
```

**Success criteria:** `daw-platform` contains all source of truth docs and the BeerBook source.

---

## Task 1: DNS Setup (Google DNS)

**What to do:**
- [ ] Create A records pointing to `178.156.232.88`:
  - `auth.drinksafterwork.net`
  - `beerbook.drinksafterwork.net`
  - `api.beerbook.drinksafterwork.net`

**Success criteria:**
- [ ] `nslookup auth.drinksafterwork.net` → `178.156.232.88`
- [ ] `nslookup beerbook.drinksafterwork.net` → `178.156.232.88`
- [ ] `nslookup api.beerbook.drinksafterwork.net` → `178.156.232.88`

**Note:** This is a manual step (Google DNS console). Agent should skip and assume done unless verification fails.

---

## Task 2: Container Layout & Routing (Traefik + Compose)

**What to do:**
- [ ] Create `infra/compose/docker-compose.yml` with all Phase 1 services
- [ ] Attach public-facing containers to the existing Traefik docker network (do NOT run a second Traefik)
- [ ] Traefik labels for routing:
  - `auth.drinksafterwork.net` → Keycloak (port 8080)
  - `beerbook.drinksafterwork.net` → BeerBook nginx (port 80)
  - `api.beerbook.drinksafterwork.net` → beerbook-api (port 3001)
- [ ] Supabase containers get NO Traefik labels (internal only)
- [ ] Create `.env.example` with all required env vars (no real secrets)
- [ ] Create `run.sh` with commands: `up`, `down`, `logs`, `restart`

**Services in docker-compose.yml:**
```
# === Public (Traefik-exposed) ===
keycloak          - quay.io/keycloak/keycloak:26.1       → auth.drinksafterwork.net
beerbook          - nginx:alpine (static files)          → beerbook.drinksafterwork.net
beerbook-api      - node:20-alpine (custom)              → api.beerbook.drinksafterwork.net

# === Internal only (no Traefik labels) ===
keycloak-db       - postgres:16-alpine                   (Keycloak's own DB)
supabase-db       - supabase/postgres:15.6.1.143         (Supabase Postgres)
supabase-rest     - postgrest/postgrest                   (PostgREST, internal)
supabase-realtime - supabase/realtime                     (Realtime, internal)
```

**Critical decisions:**
- Keycloak gets its OWN Postgres instance (`keycloak-db`), separate from Supabase. Do not share.
- Supabase containers have ZERO Traefik exposure. No public ports. Internal network only.
- `beerbook-api` is the ONLY service that talks to Supabase. Browser never touches Supabase directly.
- BeerBook frontend (nginx) and `beerbook-api` are separate containers on separate subdomains.

**Keycloak proxy environment variables (REQUIRED):**
```yaml
keycloak:
  environment:
    KC_PROXY: edge
    KC_HOSTNAME: auth.drinksafterwork.net
    KC_HOSTNAME_STRICT: "false"
    KC_HTTP_ENABLED: "true"
    KC_DB: postgres
    KC_DB_URL: jdbc:postgresql://keycloak-db:5432/keycloak
    KC_DB_USERNAME: keycloak
    KC_DB_PASSWORD: ${KC_DB_PASSWORD}
    KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN}
    KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
```
If you don't set `KC_PROXY=edge` and `KC_HOSTNAME` you WILL get redirect URI mismatches and mixed-content errors.

**Supabase minimal configuration notes:**
- `PGRST_JWT_SECRET` must be set on PostgREST (even if Phase 1 doesn't enforce JWT auth at that layer)
- Realtime needs correct DB connection string + secret
- Generate stable `anon` and `service_role` JWT keys upfront and store in `.env`
- Since we're not using Supabase Auth, we skip Kong/GoTrue/Studio in Phase 1

**Success criteria:**
- [ ] `docker compose up -d` starts all containers without errors
- [ ] `docker network inspect <traefik-network>` shows keycloak, beerbook, and beerbook-api containers
- [ ] Supabase containers are NOT visible on Traefik dashboard (no labels)
- [ ] `curl -k https://auth.drinksafterwork.net` returns Keycloak HTML

---

## Task 2.5: Data Access Pattern — beerbook-api

**Decision:** `beerbook-api` is the ONLY public gateway to the data layer.

**Architecture:**
```
Browser (user)
    │
    ├── https://beerbook.drinksafterwork.net     → static frontend (nginx)
    ├── https://auth.drinksafterwork.net          → Keycloak (login UI + OIDC)
    └── https://api.beerbook.drinksafterwork.net  → beerbook-api (Node/Express)
                                                        │
                                                        ├── validates Keycloak access token
                                                        ├── http://supabase-rest:3000 (internal)
                                                        └── uses SUPABASE_SERVICE_ROLE_KEY
```

**Rules:**
- Browser NEVER calls Docker internal hostnames
- Browser NEVER holds the Supabase service role key
- Supabase is reachable ONLY from the Docker internal network
- `beerbook-api` validates the Keycloak access token on every mutating request
- `beerbook-api` uses the Supabase service role key to make internal PostgREST calls
- RLS disabled in Phase 1 is SAFE because PostgREST is not publicly exposed

**What to build — `apps/beerbook-api/`:**

```
beerbook-api/
├── Dockerfile
├── package.json
├── server.js
└── .env.example
```

**server.js endpoints:**
- `GET  /api/health`            → 200 (no auth required)
- `GET  /api/ratings`           → public read, proxies to PostgREST
- `GET  /api/ratings/user/:id`  → public read, filtered by user_id
- `POST /api/ratings`           → authenticated, validates Keycloak token, extracts sub
- `DELETE /api/ratings/:id`     → authenticated, verifies ownership via token sub
- `GET  /api/profile`           → authenticated, returns/creates profile from token claims
- `GET  /api/stats`             → public read, beer averages + leaderboard

**Token validation middleware:**
- Extract `Authorization: Bearer <token>` from request
- Validate against Keycloak JWKS: `https://auth.drinksafterwork.net/realms/daw/protocol/openid-connect/certs`
- Validate `iss` = `https://auth.drinksafterwork.net/realms/daw`
- Validate `exp` not expired
- Extract `sub`, `preferred_username`, `email`
- Reject invalid/expired tokens on protected routes
- Public read routes (`GET /api/ratings`, `GET /api/stats`) do NOT require auth

**Environment variables:**
```
KEYCLOAK_ISSUER=https://auth.drinksafterwork.net/realms/daw
KEYCLOAK_JWKS_URI=https://auth.drinksafterwork.net/realms/daw/protocol/openid-connect/certs
SUPABASE_REST_URL=http://supabase-rest:3000
SUPABASE_SERVICE_ROLE_KEY=<generated service role JWT>
PORT=3001
CORS_ORIGIN=https://beerbook.drinksafterwork.net
```

**Success criteria:**
- [ ] `curl https://api.beerbook.drinksafterwork.net/api/health` → 200
- [ ] `curl https://api.beerbook.drinksafterwork.net/api/ratings` → 200 (empty array)
- [ ] `curl -X POST .../api/ratings` without auth → 401
- [ ] `curl -X POST ... -H "Authorization: Bearer <valid_token>"` → 201
- [ ] Response includes `Access-Control-Allow-Origin: https://beerbook.drinksafterwork.net`

---

## Task 3: Deploy Keycloak (SSO Spine)

**What to do:**
- [ ] Bring up Keycloak via compose (should already be running from Task 2)
- [ ] Confirm reachable at `https://auth.drinksafterwork.net`
- [ ] Create realm: `daw`
- [ ] Create client: `beerbook`
  - Client type: Public
  - Authentication flow: Authorization Code + PKCE
  - Valid redirect URIs: `https://beerbook.drinksafterwork.net/*`
  - Valid post-logout redirect URIs: `https://beerbook.drinksafterwork.net/*`
  - Web origins: `https://beerbook.drinksafterwork.net`
  - Client scopes: `openid`, `profile`, `email`
- [ ] Enable user self-registration on the `daw` realm
- [ ] Create at least one test user (e.g. `testuser` / password)
- [ ] Set Keycloak admin credentials (store in `.env`, never commit)

**Keycloak config notes for agent:**
- Realm name must be exactly `daw` (BeerBook expects issuer `.../realms/daw`)
- Client ID must be exactly `beerbook` (hardcoded default in supabase.js line 17)
- Verify OIDC discovery works BEFORE proceeding to Task 5

**Success criteria:**
- [ ] Keycloak admin console loads at `https://auth.drinksafterwork.net`
- [ ] `curl https://auth.drinksafterwork.net/realms/daw/.well-known/openid-configuration` → valid JSON
- [ ] JSON contains correct `authorization_endpoint`, `token_endpoint`, `jwks_uri`
- [ ] Test user can log in via Keycloak hosted login page

---

## Task 4: Deploy Supabase Self-Host (Data + Realtime Spine)

**What to do:**
- [ ] Bring up Supabase stack via compose (should already be running from Task 2)
- [ ] Verify Postgres is NOT exposed publicly (no published ports)
- [ ] Verify PostgREST is NOT exposed publicly (internal only)
- [ ] Verify Realtime service is running and healthy
- [ ] Generate and store JWT secrets in `.env`:
  - `PGRST_JWT_SECRET` — shared secret for PostgREST
  - `SUPABASE_ANON_KEY` — JWT with role=anon
  - `SUPABASE_SERVICE_ROLE_KEY` — JWT with role=service_role
- [ ] Run corrected database schema

### CRITICAL: Schema Migration

The existing `database-schema.sql` references `auth.users(id)` and `auth.uid()`. Since we use Keycloak (not Supabase Auth), the schema must be rewritten.

**Corrected schema:**
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT 'Beer Lover',
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL DEFAULT 'Anonymous',
    beer_name TEXT NOT NULL,
    brewery TEXT DEFAULT '',
    style TEXT NOT NULL,
    abv DECIMAL(4,1),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    flavor_hoppy INTEGER DEFAULT 0 CHECK (flavor_hoppy >= 0 AND flavor_hoppy <= 5),
    flavor_malty INTEGER DEFAULT 0 CHECK (flavor_malty >= 0 AND flavor_malty <= 5),
    flavor_bitter INTEGER DEFAULT 0 CHECK (flavor_bitter >= 0 AND flavor_bitter <= 5),
    flavor_sweet INTEGER DEFAULT 0 CHECK (flavor_sweet >= 0 AND flavor_sweet <= 5),
    flavor_fruity INTEGER DEFAULT 0 CHECK (flavor_fruity >= 0 AND flavor_fruity <= 5),
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_beer_name ON ratings(beer_name);
CREATE INDEX IF NOT EXISTS idx_ratings_style ON ratings(style);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON ratings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_rating ON ratings(rating);

-- RLS DISABLED Phase 1. PostgREST internal-only; beerbook-api validates tokens.

ALTER PUBLICATION supabase_realtime ADD TABLE ratings;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE VIEW beer_averages AS
SELECT beer_name, brewery, style,
    COUNT(*) as review_count,
    ROUND(AVG(rating)::numeric, 2) as avg_rating,
    ROUND(AVG(flavor_hoppy)::numeric, 1) as avg_hoppy,
    ROUND(AVG(flavor_malty)::numeric, 1) as avg_malty,
    ROUND(AVG(flavor_bitter)::numeric, 1) as avg_bitter,
    ROUND(AVG(flavor_sweet)::numeric, 1) as avg_sweet,
    ROUND(AVG(flavor_fruity)::numeric, 1) as avg_fruity,
    MAX(created_at) as last_reviewed
FROM ratings GROUP BY beer_name, brewery, style ORDER BY avg_rating DESC;
```

- [ ] Run corrected schema against Supabase Postgres
- [ ] Replace `apps/beerbook/docs/database-schema.sql` with corrected version

**Success criteria:**
- [ ] `docker exec supabase-db psql -U postgres -c '\dt'` shows `profiles` and `ratings`
- [ ] `profiles.id` is type `TEXT`
- [ ] `ratings.user_id` is type `TEXT`
- [ ] PostgREST responds internally: `docker exec beerbook-api curl http://supabase-rest:3000/ratings` → 200
- [ ] Realtime container is healthy

---

## Task 5: Build & Deploy beerbook-api

Implement the service specified in Task 2.5.

- [ ] Create `apps/beerbook-api/` with Dockerfile, package.json, server.js
- [ ] Implement all endpoints from Task 2.5
- [ ] Implement Keycloak JWKS token validation middleware
- [ ] Build image and add to docker-compose
- [ ] Traefik labels for `api.beerbook.drinksafterwork.net`
- [ ] CORS: allow `https://beerbook.drinksafterwork.net`

**Success criteria:** (same as Task 2.5)

---

## Task 6: Deploy BeerBook Frontend

**What to do:**
- [ ] Mount BeerBook static files into nginx container
- [ ] **Rewire frontend to call beerbook-api instead of Supabase directly:**
  - Replace all `this.client.from('ratings').select(...)` → `fetch('https://api.beerbook.drinksafterwork.net/api/ratings')`
  - Replace all `.insert(...)` → `fetch(..., { method: 'POST', headers: { Authorization: 'Bearer ' + token } })`
  - Replace all `.delete(...)` → `fetch(..., { method: 'DELETE', ... })`
  - Keep Keycloak OIDC flow as-is (login/logout/token management)
  - Remove Supabase JS client CDN import from index.html
  - Attach Keycloak access token as `Authorization: Bearer` on every API request

- [ ] Create `apps/beerbook/config.js`:
```javascript
window.BEERBOOK_CONFIG = {
    keycloak: {
        authority: 'https://auth.drinksafterwork.net/realms/daw',
        clientId: 'beerbook'
    },
    apiBaseUrl: 'https://api.beerbook.drinksafterwork.net'
};
```
- [ ] Wire `config.js` into init logic (check before localStorage fallback)
- [ ] Remove "Connect to Supabase" config form from the auth screen
- [ ] Keep demo mode as localStorage-only fallback

**Success criteria:**
- [ ] `https://beerbook.drinksafterwork.net` loads BeerBook UI
- [ ] No Supabase JS client in network tab
- [ ] "Sign in with DAW" redirects to Keycloak
- [ ] All data requests go to `api.beerbook.drinksafterwork.net`
- [ ] After login, creating a review works end-to-end

---

## Task 7: End-to-End Smoke Tests

**Create `runbooks/smoke_tests.md` and verify:**

- [ ] **DNS:** all three subdomains resolve to `178.156.232.88`
- [ ] **TLS:** valid certs on all three subdomains
- [ ] **OIDC Discovery:** `.well-known/openid-configuration` returns valid JSON
- [ ] **API health:** `GET /api/health` → 200
- [ ] **API public read:** `GET /api/ratings` → 200
- [ ] **API auth gate:** `POST /api/ratings` without token → 401
- [ ] **Supabase NOT public:** PostgREST unreachable from outside VM
- [ ] **Login flow:** BeerBook → Keycloak → back to BeerBook with session
- [ ] **Data persistence:** Create review → refresh → still there
- [ ] **Ownership:** User A cannot delete User B's review
- [ ] **Restart resilience:** `docker compose down && up -d` → everything recovers
- [ ] **No console errors:** No auth, CORS, or network errors in browser

---

## Task 8: Operations Runbooks

**Create in `runbooks/`:**

- [ ] `deploy.md` — Deploy from scratch, update BeerBook files, rebuild beerbook-api
- [ ] `backup_restore.md` — Postgres backup for BOTH databases (keycloak-db + supabase-db) + restore
- [ ] `troubleshooting.md` — Log locations, restart commands, Traefik routing, common errors

**Success criteria:**
- [ ] Can dump and restore both databases following the runbook
- [ ] Troubleshooting doc covers: Keycloak, beerbook-api, PostgREST, nginx, Traefik logs

---

## Cursor Agent Prompt

Paste into Cursor:

```
Read ARCHITECTURE.md and DECISIONS.md in daw-platform/. Execute PHASE1.md tasks 0-8
in order using Docker Compose. Key constraints:

- Keycloak at auth.drinksafterwork.net, realm "daw", client "beerbook" (public, PKCE)
- Set KC_PROXY=edge, KC_HOSTNAME, KC_HTTP_ENABLED=true for Traefik compatibility
- Supabase self-host: ALL Supabase containers internal only (NO Traefik labels, no public ports)
- Build beerbook-api (Node/Express) as the ONLY public data gateway at api.beerbook.drinksafterwork.net
- beerbook-api validates Keycloak tokens via JWKS and proxies to internal PostgREST
- BeerBook frontend at beerbook.drinksafterwork.net (static vanilla JS served by nginx)
- Rewire BeerBook frontend: replace all Supabase JS client calls with fetch() to beerbook-api
- Remove Supabase JS CDN from frontend; keep Keycloak OIDC auth flow as-is
- Database schema uses TEXT columns for user IDs (Keycloak sub), NOT auth.users references
- RLS disabled Phase 1 (safe: PostgREST is internal-only, beerbook-api validates tokens)
- Keycloak gets its own Postgres, separate from Supabase Postgres
- Generate PGRST_JWT_SECRET, anon key, and service_role key upfront in .env
- Create runbooks: deploy, smoke tests, backup/restore, troubleshooting
- Assume sensible defaults, log them in DECISIONS.md
- Only ask if: DNS change, security risk, data deletion, or cost increase
```

---

## Agent Assumption Log

_Agents must log assumptions here instead of asking (per DECISIONS.md):_

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| | | | |
