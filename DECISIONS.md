DECISIONS.md
Platform Identity Decision

Identity Provider: Keycloak
Realm: daw
Canonical User ID: sub (OIDC subject from Keycloak)

Keycloak is the single source of truth for identity across:

BeerBook

Matrix (future OIDC integration)

DAWFootball (future)

DAW Web (future)

Supabase Auth will NOT be used.

Data Platform Decision

Standard DAW Data Platform: Self-hosted Supabase

Supabase provides:

Postgres database

Realtime (Broadcast / Presence / Postgres Changes)

Row Level Security (RLS)

Storage (optional later)

BeerBook uses Supabase for data only.
Future DAWFootball live draft features will use Supabase Realtime.

Hosting Decision

Primary Host: Hetzner VM
Public IP: 178.156.232.88

All core services will run as Docker containers on this VM unless future scaling requires separation.

Reverse proxy: Traefik (existing, playbook-managed)

Domain Strategy

Primary domain: drinksafterwork.net
DNS: Google name servers

Subdomains:

auth.drinksafterwork.net → Keycloak

beerbook.drinksafterwork.net → BeerBook

matrix.drinksafterwork.net → Synapse

element.drinksafterwork.net → Element

football.drinksafterwork.net → DAWFootball (later)

All A records point to: 178.156.232.88

TLS handled via Traefik + Let’s Encrypt.

Phase 1 Scope Decision (Stability First)

Phase 1 includes:

Keycloak deployed

Supabase self-host deployed

BeerBook deployed behind Traefik

OIDC login working

Reviews persist in database

Phase 1 excludes:

Matrix OIDC integration

DAWFootball resurrection

Multi-VM scaling

Advanced logging stack

Production hardening beyond baseline security

Database Isolation Decision

Supabase Postgres will:

Not be exposed publicly

Only be accessible via Docker internal network

Be backed up regularly (backup process defined in runbooks)

Secrets Management Decision

All secrets stored in .env files

.env never committed

Keycloak admin credentials stored securely

Supabase JWT secret stored securely

Agent Execution Rules

Agents (Cursor, Claude, etc.) must:

Assume sensible defaults

Log assumptions here instead of asking unless:

DNS change required

Security risk introduced

Data deletion involved

Additional hosting cost introduced

Always produce:

docker-compose updates

runbook steps

smoke test verification steps

Future Architectural Direction

DAW becomes a multi-service platform

Keycloak remains identity spine

Supabase remains data + realtime spine

Services remain isolated deployments (no monolithic merge)

Event-driven features (live draft, notifications) will use Supabase Realtime

BeerBook Stack Decision
Framework: Vanilla JavaScript (no build step, no bundler)
Charts: Chart.js 4.x (CDN)
Styling: Custom CSS (pub/craft brewery theme)
Auth: Keycloak OIDC Authorization Code + PKCE (implemented in supabase.js)
Data: Supabase Postgres via beerbook-api (NOT direct browser-to-Supabase)
Serving: nginx:alpine container behind Traefik
Source: Existing codebase (claude_beerbook_with_keycloak_expected.zip)
Known debt: Frontend supabase.js must be rewired from direct Supabase client
calls to fetch() calls against beerbook-api. Supabase JS CDN removed from frontend.
Data Access Pattern Decision
Pattern: Backend-for-Frontend (BFF) via beerbook-api

Browser calls ONLY beerbook-api (https://api.beerbook.drinksafterwork.net)
beerbook-api validates Keycloak access tokens via JWKS
beerbook-api calls PostgREST internally using Supabase service role key
Supabase containers (PostgREST, Realtime, Postgres) are NEVER exposed publicly
RLS disabled in Phase 1 — safe because PostgREST has no public access
Phase 2: re-enable RLS with JWT sub verification for defense-in-depth

Database Schema Decision

profiles.id and ratings.user_id are TEXT (Keycloak sub claim)
No references to Supabase auth.users table
No use of auth.uid() in RLS policies
Original database-schema.sql must be replaced with corrected version (see PHASE1.md Task 4)
End of Decisions v1