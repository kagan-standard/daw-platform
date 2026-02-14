\# DAW Platform Architecture



\## Purpose

Drinks After Work (DAW) is a multi-service platform. One DAW account should access multiple services (BeerBook, Matrix/Element, DAWFootball, daw-web) with minimal friction.



\## Services

| Service | Purpose | Repo | Primary URL | Runtime/Host |

|---|---|---|---|---|

| \*\*Keycloak (auth)\*\* | DAW identity (SSO) | daw-platform (infra) | https://auth.drinksafterwork.net | Hetzner VM (Docker) |

| \*\*BeerBook\*\* | Beer ratings/reviews app | beerbook | https://beerbook.drinksafterwork.net | Hetzner VM (Docker + nginx) |

| \*\*Database (BeerBook data)\*\* | BeerBook data layer | daw-platform (infra) | (internal) | Hetzner VM (Docker) |

| \*\*Synapse (Matrix)\*\* | Homeserver | matrix-docker-ansible-deploy | https://matrix.drinksafterwork.net | Hetzner VM |

| \*\*Element Web\*\* | Matrix web client | playbook-managed | https://element.drinksafterwork.net | Hetzner VM |

| \*\*DAW Web (front door)\*\* | Landing + launchpad | daw-web | https://drinksafterwork.net | TBD |

| \*\*DAWFootball (legacy)\*\* | Fantasy tracker/draft room | dawfootball-legacy | https://football.drinksafterwork.net | TBD |



\## Domain \& DNS

Primary domain: `drinksafterwork.net`



DNS provider: Google Domains name servers  

Public IP (Hetzner VM): \*\*178.156.232.88\*\*



Subdomains:

\- `auth.drinksafterwork.net` → Keycloak

\- `beerbook.drinksafterwork.net` → BeerBook

\- `matrix.drinksafterwork.net` → Synapse

\- `element.drinksafterwork.net` → Element

\- `football.drinksafterwork.net` → DAWFootball (later)



Records:

\- A records for each subdomain → \*\*178.156.232.88\*\*

\- TLS: handled via Traefik + Let’s Encrypt



\## Identity \& Access (SSO)

Source of truth for identity: \*\*Keycloak\*\*  

Realm: `daw`



Clients (planned):

\- `beerbook` (OIDC Authorization Code + PKCE)

\- `synapse` (OIDC, later phase)

\- `daw-web` (later)

\- `dawfootball` (later)



Account model:

\- Keycloak user is canonical

\- BeerBook stores a local user row keyed by `keycloak\_sub` (OIDC subject) plus profile fields



\## Data Architecture

BeerBook uses a dedicated database for:

\- `users` (keycloak\_sub)

\- `beers`

\- `reviews` (rating + text + timestamps)

\- `breweries` (optional v1)

\- `styles` (optional v1)



Backups:

\- Database backups stored on Hetzner (location TBD) and/or offsite (TBD)



\## Deployment Topology

Host: Hetzner VM  

Orchestration: Docker / docker-compose  

Reverse proxy: Traefik (existing, playbook-managed for Matrix; may also route Keycloak/BeerBook)



Containers (expected):

\- Traefik (existing)

\- Keycloak

\- Database container (Postgres, at minimum)

\- BeerBook container(s) (nginx + app, depending on build)



\## Request Flow (High-level)



\### BeerBook login flow (SSO)

1\. User visits `https://beerbook.drinksafterwork.net`

2\. Clicks “Sign in with DAW”

3\. Redirect → `https://auth.drinksafterwork.net` (Keycloak)

4\. Auth Code + PKCE → back to BeerBook redirect URI

5\. BeerBook stores session and maps user via `sub` (keycloak\_sub)

6\. BeerBook reads/writes reviews to the database



\### Matrix login flow (later phase)

1\. User uses Element at `https://element.drinksafterwork.net`

2\. Element offers “Sign in with DAW” (OIDC)

3\. Synapse validates via Keycloak OIDC provider config



\## Security Basics

\- HTTPS everywhere (Let’s Encrypt via Traefik)

\- Secrets stored in `.env` files (never committed)

\- Keycloak admin console restricted (strong admin creds; optional IP allowlist later)

\- Postgres not exposed publicly (internal network only)



\## Observability \& Operations

\- Logs: docker logs

\- Health checks: container health + basic smoke tests

\- Runbooks: /runbooks/\*.md



\## Phase Plan

\- Phase 1: Keycloak + BeerBook + DB live

\- Phase 2: Landing page launcher

\- Phase 3: Matrix OIDC integration

\- Phase 4: DAWFootball revival



\## Supabase Stance (DAW Standard Data Platform)

We will standardize on self-hosted Supabase for DAW services that need:

\- Realtime Broadcast / Presence (e.g., live draft rooms)

\- Postgres Changes over WebSockets (live leaderboards, activity feeds)

\- Row Level Security (multi-tenant leagues/users)



Phase 1 (BeerBook): Supabase runs as the data layer. Keycloak remains the identity provider (SSO).

Phase 2+: DAWFootball adopts Supabase Realtime for live draft/presence features.









