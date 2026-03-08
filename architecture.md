# DAW Platform Architecture

## Purpose

Drinks After Work (DAW) is a multi-service platform. One DAW account should access multiple services (BeerBook, Matrix/Element, DAWFootball, daw-web) with minimal friction.

## Services

| Service | Purpose | Repo | Primary URL | Runtime/Host |
|---------|---------|------|-------------|--------------|
| **Keycloak (auth)** | DAW identity (SSO) | daw-platform (infra) | https://auth.drinksafterwork.net | Hetzner VM (Docker) |
| **BeerBook** | Beer ratings/reviews app (API + web) | daw-platform (`apps/beerbook-api`, `apps/beerbook`) | https://beerbook.drinksafterwork.net | Hetzner VM (Docker + nginx) |
| **Supabase (BeerBook data)** | BeerBook data layer (Postgres + optional Realtime) | daw-platform (`apps/beerbook-api/supabase`) | (internal) | Hetzner VM (Docker) |
| **Synapse (Matrix)** | Homeserver | matrix-docker-ansible-deploy | https://matrix.drinksafterwork.net | Hetzner VM |
| **Element Web** | Matrix web client | playbook-managed | https://element.drinksafterwork.net | Hetzner VM |
| **DAW Web (front door)** | Landing + launchpad | daw-platform (`apps/daw-web`) | https://drinksafterwork.net | Hetzner VM (Docker) |
| **DAWFootball (legacy)** | Fantasy tracker/draft room | dawfootball-legacy | https://football.drinksafterwork.net | TBD |

## Domain & DNS

Primary domain: `drinksafterwork.net`

DNS provider: Google Domains name servers  
Public IP (Hetzner VM): **178.156.232.88**

Subdomains:

- `auth.drinksafterwork.net` → Keycloak
- `beerbook.drinksafterwork.net` → BeerBook
- `matrix.drinksafterwork.net` → Synapse
- `element.drinksafterwork.net` → Element
- `football.drinksafterwork.net` → DAWFootball (later)

Records:

- A records for each subdomain → **178.156.232.88**
- TLS: handled via Traefik + Let's Encrypt

## Identity & Access (SSO)

Source of truth for identity: **Keycloak**  
Realm: `daw`

Clients (planned):

- `beerbook` (OIDC Authorization Code + PKCE)
- `synapse` (OIDC, later phase)
- `daw-web` (later)
- `dawfootball` (later)

Account model:

- Keycloak user is canonical
- BeerBook stores a local user/profile keyed by Keycloak subject (OIDC `sub`) plus profile fields in Supabase `profiles` table

## Data Architecture

BeerBook uses **self-hosted Supabase** (Postgres) as the data layer:

- **Migrations:** `apps/beerbook-api/supabase/migrations` (ordered timestamped SQL)
- **Schema overview:** See `apps/beerbook-api/docs/DATABASE_SCHEMAS_OVERVIEW.md`
- **Core entities:** `profiles`, `ratings`, `rating_comments`, `reactions`, `venues`, `beers`, `breweries`, `styles`, plus achievements/tabs/ledger, cosmetics, crews, tracking, etc.

Backups:

- Database backups stored on Hetzner (location TBD) and/or offsite (TBD). Procedures: `runbooks/backup_restore.md`

## BeerBook Stack (Backend)

- **API:** Node.js + Express (`apps/beerbook-api`). REST over `/api`; internal routes under `/internal`.
- **Auth:** Keycloak JWT via `Authorization: Bearer <token>`. Audiences: `beerbook`, `beerbook-mobile`.
- **Contract:** Canonical API and behavior are documented in **`apps/beerbook-api/docs/API_CONTRACT.md`** (endpoints, auth, pagination, errors, side effects).
- **Process-event:** Dual runtime — Node (`lib/processEventEngine.js`, `routes/internal.js`) and Supabase Edge (`supabase/functions/process-event`). Both must stay in parity; internal endpoint protected by `INTERNAL_PROCESS_EVENT_SECRET` and rate limiting.

## Deployment Topology

Host: Hetzner VM  
Orchestration: Docker / docker-compose  
Reverse proxy: Traefik (existing, playbook-managed for Matrix; may also route Keycloak/BeerBook)

Containers (expected):

- Traefik (existing)
- Keycloak
- Supabase (Postgres + PostgREST + optional Realtime)
- BeerBook container(s) (nginx + app, depending on build)

## Request Flow (High-level)

### BeerBook login flow (SSO)

1. User visits `https://beerbook.drinksafterwork.net`
2. Clicks "Sign in with DAW"
3. Redirect → `https://auth.drinksafterwork.net` (Keycloak)
4. Auth Code + PKCE → back to BeerBook redirect URI
5. BeerBook stores session and maps user via `sub` (Keycloak subject)
6. BeerBook API reads/writes via Supabase (PostgREST/direct Postgres)

### Matrix login flow (later phase)

1. User uses Element at `https://element.drinksafterwork.net`
2. Element offers "Sign in with DAW" (OIDC)
3. Synapse validates via Keycloak OIDC provider config

## Security Basics

- HTTPS everywhere (Let's Encrypt via Traefik)
- Secrets stored in `.env` files (never committed)
- Keycloak admin console restricted (strong admin creds; optional IP allowlist later)
- Postgres not exposed publicly (internal network only)
- Internal process-event endpoint requires `INTERNAL_PROCESS_EVENT_SECRET` and is rate-limited

## Observability & Operations

- Logs: docker logs
- Health checks: container health + basic smoke tests
- **Runbooks:** `runbooks/*.md` (deploy, smoke_tests, backup_restore, troubleshooting, rollback, secret_rotation, migrations)

## Phase Plan

- **Phase 1:** Keycloak + BeerBook + Supabase live (security/auth/data integrity). Detailed execution: `docs/PHASE_1_EXECUTION_PLAN.md`
- **Phase 2:** Landing page launcher + feature wiring. Execution: `docs/PHASE_2_EXECUTION_PLAN.md` (and related)
- **Phase 3:** Notifications / fixes; Matrix OIDC integration (later). Execution: `docs/PHASE_3_EXECUTION_PLAN.md`
- **Phase 4:** Performance, cleanup, parity (aggregation, tracking, tests). Execution: `docs/PHASE_4_EXECUTION_PLAN.md`
- **Later:** DAWFootball revival

## Supabase Stance (DAW Standard Data Platform)

We standardize on **self-hosted Supabase** for DAW services that need:

- Realtime Broadcast / Presence (e.g., live draft rooms)
- Postgres Changes over WebSockets (live leaderboards, activity feeds)
- Row Level Security (multi-tenant leagues/users)

**Phase 1 (BeerBook):** Supabase runs as the data layer. Keycloak remains the identity provider (SSO).

**Phase 2+:** DAWFootball adopts Supabase Realtime for live draft/presence features.

## Key Documentation

| Doc | Description |
|-----|-------------|
| `apps/beerbook-api/docs/API_CONTRACT.md` | BeerBook API source of truth (endpoints, auth, pagination, errors) |
| `apps/beerbook-api/docs/DATABASE_SCHEMAS_OVERVIEW.md` | BeerBook schema after migrations |
| `docs/PHASE_*_EXECUTION_PLAN.md` | Per-phase execution plans (batches, ownership, validation) |
| `runbooks/*.md` | Deploy, smoke tests, backup/restore, troubleshooting, rollback |
