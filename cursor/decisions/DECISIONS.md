# DECISIONS.md

## Platform Identity Decision

Identity Provider: Keycloak
Realm: daw
Canonical User ID: sub (OIDC subject from Keycloak)

Keycloak is the single source of truth for identity across:
- BeerBook
- Matrix (future OIDC integration)
- DAWFootball (future)
- DAW Web (future)

Supabase Auth will NOT be used.

## Data Platform Decision

Standard DAW Data Platform: Self-hosted Supabase

Supabase provides:
- Postgres database
- Realtime (Broadcast / Presence / Postgres Changes)
- Row Level Security (RLS)
- Storage (optional later)

BeerBook uses Supabase for data only.
Future DAWFootball live draft features will use Supabase Realtime.

## Hosting Decision

Primary Host: Hetzner VM
Public IP: 178.156.232.88

All core services will run as Docker containers on this VM unless future scaling requires separation.

Reverse proxy: Traefik (existing, playbook-managed)

## Domain Strategy

Primary domain: drinksafterwork.net
DNS: Google name servers

Subdomains:
- auth.drinksafterwork.net → Keycloak
- beerbook.drinksafterwork.net → BeerBook
- api.beerbook.drinksafterwork.net → beerbook-api
- matrix.drinksafterwork.net → Synapse
- element.drinksafterwork.net → Element
- football.drinksafterwork.net → DAWFootball (later)

All A records point to: 178.156.232.88

TLS handled via Traefik + Let's Encrypt.

## Phase 1 Scope Decision (Stability First)

Phase 1 includes:
- Keycloak deployed
- Supabase self-host deployed
- BeerBook deployed behind Traefik
- OIDC login working
- Reviews persist in database
- Token audience/azp validation enforced
- Pagination and rate limiting on public endpoints
- CORS origin hardening
- Rollback runbook tested
- Secret rotation runbook documented

Phase 1 excludes:
- Matrix OIDC integration
- DAWFootball resurrection
- Multi-VM scaling
- Advanced logging stack
- Production hardening beyond baseline security

## Database Isolation Decision

Supabase Postgres will:
- Not be exposed publicly
- Only be accessible via Docker internal network
- Be backed up regularly (backup process defined in runbooks)

## Secrets Management Decision

All secrets stored in .env files.
.env never committed.
Keycloak admin credentials stored securely.
Supabase JWT secret stored securely.

### Secret Rotation Policy
- Rotation cadence: Quarterly, or immediately on incident / staff turnover
- Covered secrets: Keycloak admin password, PGRST_JWT_SECRET, Supabase service_role key, Supabase anon key
- Rotation procedure documented in `runbooks/secret_rotation.md`
- Emergency invalidation procedure documented for key-compromise scenarios
- Post-rotation verification checklist required after every rotation

## Agent Execution Rules

Agents (Cursor, Claude, etc.) must:
- Assume sensible defaults
- Log assumptions in the active phase prompt's Agent Assumption Log instead of asking unless:
  - DNS change required
  - Security risk introduced
  - Data deletion involved
  - Additional hosting cost introduced
- Always produce:
  - docker-compose updates
  - runbook steps
  - smoke test verification steps

## Future Architectural Direction

DAW becomes a multi-service platform.
Keycloak remains identity spine.
Supabase remains data + realtime spine.
Services remain isolated deployments (no monolithic merge).
Event-driven features (live draft, notifications) will use Supabase Realtime.

## BeerBook Stack Decision

Framework: Vanilla JavaScript (no build step, no bundler)
Charts: Chart.js 4.x (CDN)
Styling: Custom CSS (pub/craft brewery theme)
Auth: Keycloak OIDC Authorization Code + PKCE (implemented in supabase.js)
Data: Supabase Postgres via beerbook-api (NOT direct browser-to-Supabase)
Serving: nginx:alpine container behind Traefik
Source: Existing codebase (claude_beerbook_with_keycloak_expected.zip)
Known debt: Frontend supabase.js must be rewired from direct Supabase client calls to fetch() calls against beerbook-api. Supabase JS CDN removed from frontend.

### Frontend File Organization (Phase 2.5+)

As BeerBook grows, the frontend JS is split by feature area:
- `app.js` — core app init, navigation, shared utilities, rating form
- `supabase.js` — API client + Keycloak OIDC auth
- `charts.js` — Chart.js rendering logic
- `exchange.js` — YG Exchange trading floor, cross-rate calculator
- `map.js` — Leaflet map, venue pins, beer trails, deals nearby
- `venues.js` — venue detail, price logging, happy hour management
- `profiles.js` — user profile pages, personal stats

All JS files are loaded via `<script>` tags in `index.html`. No module bundler. Files communicate through a shared `App` namespace or direct DOM access.

CSS remains in a single `styles.css` file — do not create per-feature CSS files.

### External CDN Libraries

Allowed CDN dependencies (no npm, no bundling):
- **Chart.js 4.x** — charts and graphs (existing)
- **Leaflet.js 1.9.x** — interactive maps (Phase 2.5)
- **Leaflet.markercluster 1.5.x** — map pin clustering (Phase 2.5)
- **Leaflet.heat** — heatmap layer (Phase 2.5)

No other frontend libraries without explicit approval.

## Data Access Pattern Decision

Pattern: Backend-for-Frontend (BFF) via beerbook-api

- Browser calls ONLY beerbook-api (https://api.beerbook.drinksafterwork.net)
- beerbook-api validates Keycloak access tokens via JWKS
- beerbook-api calls PostgREST internally using Supabase service role key
- Supabase containers (PostgREST, Realtime, Postgres) are NEVER exposed publicly
- RLS disabled in Phase 1 — safe because PostgREST has no public access
- Phase 2: re-enable RLS with JWT sub verification for defense-in-depth

## Token Validation Decision

beerbook-api validates Keycloak access tokens with the following checks:

| Check | Requirement | Failure response |
|-------|-------------|-----------------|
| `iss` | Must equal `https://auth.drinksafterwork.net/realms/daw` | 401 |
| `exp` | Must not be expired (30s clock skew tolerance) | 401 |
| `aud` | Must include `beerbook` | 403 |
| `azp` | Must equal `beerbook` | 403 |
| Signature | Must validate against Keycloak JWKS | 401 |

Rationale: Without `aud`/`azp` checks, tokens minted for other DAW clients (e.g. future dawfootball) would be accepted by beerbook-api. This is a cross-client token confusion risk.

## YG Exchange Decision (Phase 2.5)

The YG Exchange is a comparative beer rating system where Yuengling Golden Pilsner (YG) is the baseline unit of value (always = 1.0 YG).

Design decisions:
- **YG value is per-rating, not per-beer.** Each individual rating can optionally include a `yg_value`. The beer's exchange rate is the average across all ratings.
- **YG value is optional.** Users can rate a beer without assigning a YG value. This keeps the rating form lightweight for casual use.
- **Cross-rates are derived, not stored.** The exchange rate between any two beers is calculated as `avg_yg_A / avg_yg_B`. No separate cross-rate table needed.
- **YG range: 0.1–10.0, step 0.5.** The slider covers 0.5–5.0 with manual entry up to 10.0 for extreme outliers.
- **Yuengling Golden Pilsner is hardcoded as 1.0 YG.** If someone rates YG itself, the yg_value is always displayed as 1.0 regardless of what they enter.
- **Trend calculation:** Compare current avg to avg from >30 days ago. Need at least 2 data points in each period to show a trend.

## Geolocation & Venue Decision (Phase 2.5)

Design decisions:
- **Location is always opt-in per rating.** Browser geolocation is only requested when user clicks "📍 Add Location". Never auto-captured.
- **Reverse geocoding: OpenStreetMap Nominatim.** Free, no API key. Rate limit: 1 request/sec. Custom User-Agent: `BeerBook/1.0`.
- **Venues are a first-class entity** with their own table (`venues`). Ratings can optionally link to a venue via `venue_id`.
- **Auto-venue creation:** When a user geotags a rating and no existing venue is within 100m, prompt to create a new venue. Don't auto-create silently — let the user name it.
- **Map library: Leaflet.js.** Free, no API key, CDN-loaded. Tile provider: OpenStreetMap default tiles.
- **No Google Maps.** Avoids API key management, billing, and terms-of-service complexity.

## Beer Price & Happy Hour Decision (Phase 2.5)

Design decisions:
- **Prices are stored in cents (integer).** Avoids floating-point rounding issues. Display as dollars in the frontend.
- **Prices are per-venue, per-beer.** A beer can have different prices at different venues.
- **Happy hours are per-venue, per-day-of-week.** A venue can have different happy hour windows on different days.
- **Stale data threshold: 90 days.** Price logs and happy hours not confirmed within 90 days get a warning badge.
- **Confirmation mechanic:** Any authenticated user can "confirm" a price or happy hour (increment counter + update timestamp). One confirmation per user per item (idempotent).
- **The "deals" query** factors in: user location, venue radius, active happy hours (current day + time), beer YG rate, beer price, and avg stars. Sorted by YG-per-dollar (value metric).
- **No restaurant/bar category taxonomy.** Venues are just venues. Don't over-engineer venue types.

## Photo Storage Decision (Phase 2.5)

Design decisions:
- **Phase 2.5: Docker named volume** (`uploads_data`) mounted in beerbook-api container, served via nginx location block.
- **No external object storage in Phase 2.5.** Hetzner object storage or S3 can be added later if volume grows.
- **Max file size: 5MB.** Client-side compression to max 1200px width before upload.
- **Accepted formats: JPEG, PNG, WebP.**
- **File naming: `{user_id}_{timestamp}_{random}.{ext}`** — avoids collisions and allows per-user cleanup.
- **Served at: `/uploads/{filename}`** via nginx `location /uploads/` block pointing to the volume.
- **Backup:** `uploads_data` volume should be included in backup procedures (add to `runbooks/backup_restore.md`).

## Schema Evolution Rules

All schema changes across phases must follow these rules:
- **Additive only.** No column drops, no column renames, no table drops.
- **New columns are nullable** (or have sensible defaults). Existing rows must remain valid.
- **All DDL is idempotent.** Use `IF NOT EXISTS`, `IF EXISTS`, and `DO $$ ... EXCEPTION WHEN duplicate_object` blocks.
- **Migration files are separate** from the canonical schema. Write `migration-{phase}.sql` for the delta, then update `database-schema.sql` to reflect the merged final state.
- **Test migrations on a copy first** if possible. At minimum, verify `SELECT count(*)` on existing tables before and after.

## Social Features Decision (Phase 2.5)

Design decisions:
- **Reactions: "Cheers" only (🍻).** One reaction type keeps it simple. One cheers per user per rating (toggle on/off).
- **No comments in Phase 2.5.** Comments introduce moderation complexity. Cheers is lightweight engagement without content moderation.
- **User profiles are public.** Any user can view any other user's profile, stats, and ratings. No privacy toggle in Phase 2.5.
- **Leaderboard periods: weekly, monthly, all-time.** Weekly = last 7 days rolling. Monthly = last 30 days rolling. Not calendar-aligned.
- **Delete own reviews only.** Users can delete their own ratings. No edit — delete and re-rate. Admins can't delete others' ratings in Phase 2.5.

## Crews & Follows Decision (Phase 3.0)

### Context

BeerBook currently has no user-to-user social graph. All ratings are visible globally to all authenticated users. The original "Path A" concept envisioned hard multi-tenant isolation with `crew_id` on every row, but user feedback revealed a different need: users want to **prioritize** content from their people, not be **isolated** from everyone else. This decision replaces Path A with a softer social layer model.

### Design Decisions

- **Two-layer social model: Follows + Crews.** Follows are lightweight discovery (one-directional, no approval). Crews are mutual groups (your actual drinking buddies). Both coexist — a user can follow strangers and also be in a crew with friends.
- **Follows are one-directional and instant.** Tap follow on any profile — no approval, no notification. Unfollow is equally instant. This is the low-friction discovery layer.
- **Crews are small mutual groups with invite codes.** A user creates a crew, gets a 6-character alphanumeric invite code (or shareable link), and shares it. Anyone with the code can join. No approval queue in Phase 3.0.
- **Users can be in multiple crews.** Work crew, college friends, neighborhood regulars — no limit in Phase 3.0 (soft cap at 10 if abuse appears).
- **Crew size soft cap: 50 members.** Keeps crews intimate. Can be raised later.
- **Feed priority, not feed filtering.** The dashboard, activity feed, and browse views show ALL ratings but **weighted**: crew reviews appear first (visually highlighted), then followed users, then everyone else. Users always see the global pool — crews just bubble their people to the top.
- **Crew leaderboards.** The existing leaderboard gets a "My Crew" tab alongside All Time / Monthly / Weekly. Shows stats scoped to selected crew members only.
- **No `crew_id` on ratings or other content tables.** Crew scoping happens at query time by joining `crew_members` to `ratings` on `user_id`. Ratings remain global. This is fundamentally different from Path A.
- **Crew roles: owner and member.** Owner can rename the crew, regenerate the invite code, and remove members. Members can leave. No admin role in Phase 3.0.
- **Crew names are freeform text, max 50 characters.** No uniqueness constraint — multiple crews can have the same name.
- **Invite codes are unique and regenerable.** Owner can regenerate to invalidate old links. Codes are case-insensitive, 6 alphanumeric characters (e.g., `BK7M2X`).
- **Profile shows crew membership.** A user's public profile lists which crews they belong to (crew names visible, not invite codes).
- **Follow/crew counts on profile.** Profile header shows: followers count, following count, crew count.
- **No DMs, no crew chat.** Social interaction is through ratings, cheers, follows, and crew membership. DAW Chat (Matrix) handles messaging.
- **Path A is retired.** The multi-tenant isolation model with `crew_id` on every row is no longer the plan. The social layer model (global data + social prioritization) is the new standard for BeerBook.

### Schema

Four new tables. All follow Schema Evolution Rules (additive, nullable, idempotent DDL).

```
follows (follower_id TEXT, followed_id TEXT, created_at TIMESTAMPTZ)
  - PK: (follower_id, followed_id)
  - Indexes on both columns for bidirectional lookups

crews (id TEXT PK, name TEXT, created_by TEXT, invite_code TEXT UNIQUE, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
  - invite_code: 6-char alphanumeric, case-insensitive unique

crew_members (crew_id TEXT FK, user_id TEXT, role TEXT DEFAULT 'member', joined_at TIMESTAMPTZ)
  - PK: (crew_id, user_id)
  - role: CHECK IN ('owner', 'member')
```

### API Endpoints

```
POST   /api/follows/:userId         → auth; toggle follow (follow if not following, unfollow if following)
GET    /api/follows/:userId/followers → public; paginated list of followers
GET    /api/follows/:userId/following → public; paginated list of following
GET    /api/follows/:userId/status    → auth; { is_following: bool }

POST   /api/crews                    → auth; create crew { name } → returns crew with invite_code
GET    /api/crews                    → auth; list my crews
GET    /api/crews/:id                → auth; crew detail (members, stats)
PATCH  /api/crews/:id                → auth (owner); update name
DELETE /api/crews/:id                → auth (owner); delete crew
POST   /api/crews/:id/regenerate-code → auth (owner); new invite code
POST   /api/crews/join               → auth; { invite_code } → join crew
DELETE /api/crews/:id/members/:userId → auth (owner or self); remove member / leave

GET    /api/ratings?feed=crew&crew_id=X  → ratings from crew members only
GET    /api/ratings?feed=following        → ratings from followed users only
GET    /api/activity?feed=crew&crew_id=X → activity from crew members only
```

### Feed Algorithm (Client-Side Phase 3.0)

Phase 3.0 implements feed prioritization client-side for simplicity:
1. Fetch all ratings (existing endpoint, unchanged)
2. Client tags each rating: `crew` / `following` / `global` based on local crew_members + follows lists
3. Sort: crew first (sorted by date), then following (sorted by date), then global (sorted by date)
4. Visual treatment: crew ratings get a subtle highlight border or badge; following gets a smaller indicator; global is default

Future optimization: server-side feed endpoint that returns pre-sorted results.

### Migration Path from Current State

- No existing tables are modified
- No existing API endpoints change behavior
- New tables are purely additive
- Frontend changes are additive (new nav items, new sections in existing views)
- Demo mode extended with mock follows/crews data