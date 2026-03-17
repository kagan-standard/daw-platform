# BeerBook-API Comprehensive Architecture Scan Plan

## Scope (beerbook-api only)

- **Root**: [apps/beerbook-api](apps/beerbook-api)
- **In scope**: `server.js`, `routes/`, `lib/`, `supabase/` (migrations + Edge Function `process-event`), `scripts/`, `test/`, `docs/`
- **Out of scope**: Other apps in the monorepo, frontends, shared packages

## Output directory (this effort only)

**All summary files and deliverables from this scan live in a single new directory:**

- **Path**: `apps/beerbook-api/docs/architecture-scan/`

**Contents:**

- `01-entry-routing-auth.md` — Phase 1 deliverable
- `02-data-layer.md` — Phase 2 deliverable
- `03-domain-logic.md` — Phase 3 deliverable
- `04-api-by-domain.md` — Phase 4 deliverable
- `05-scripts-tests-crosscutting.md` — Phase 5 deliverable
- `BEERBOOK_API_ARCHITECTURE.md` — Final synthesis (diagram, stack summary, pointers to phase docs and to existing API_CONTRACT.md / DATABASE_SCHEMAS_OVERVIEW.md)

Agents must create `architecture-scan` and write only these files there; no other docs under beerbook-api are modified by this effort.

---

## Current scale (from exploration)

| Area | Count / size |
|------|----------------|
| **Entry** | [server.js](apps/beerbook-api/server.js) ~2,500 lines; 104+ endpoints documented in [API_CONTRACT.md](apps/beerbook-api/docs/API_CONTRACT.md) |
| **Route modules** | 14 mounted under `/api` (activity, beers, exchange, venues, deals, map, leaderboard, upload, highlights, admin, tracking, tabs, follows, crews) + many inline routes in server.js (auth, catalog, breweries, ratings, comments, profile, stats, guest-ratings, head-to-head, review share) |
| **Lib modules** | 15+ in [lib/](apps/beerbook-api/lib): actorIdentity, achievementProgress, adminValidation, catalogMap, crewAuth, crewMilestones, elo, headToHead, keycloakAdmin, processEvent, processEventEngine, ratingsValidation, styleFamily, tabs, uploadModeration, visionModeration |
| **Supabase** | 38 migrations in [supabase/migrations](apps/beerbook-api/supabase/migrations); 1 Edge Function [process-event](apps/beerbook-api/supabase/functions/process-event) (Deno/TS + engine.ts) |
| **Scripts** | 7 in [scripts/](apps/beerbook-api/scripts); **Tests** | 9 files in [test/](apps/beerbook-api/test) |

Existing docs (unchanged): [API_CONTRACT.md](apps/beerbook-api/docs/API_CONTRACT.md) (source of truth for endpoints), [DATABASE_SCHEMAS_OVERVIEW.md](apps/beerbook-api/docs/DATABASE_SCHEMAS_OVERVIEW.md) (schema outline).

---

## Single-shot vs phased

**Single-shot**: An agent *could* analyze the whole API in one run by following a fixed checklist and reading in order (server → routes → lib → migrations → functions → scripts/tests). The main risks are context limits and missing cross-cutting details.

**Phased (recommended)**: Each phase has a bounded scope and a written deliverable in `apps/beerbook-api/docs/architecture-scan/`. Later phases can reference earlier deliverables. Phases can be run in separate sessions; the final step is the synthesis document in that same directory.

---

## Recommended phased scan (5 phases)

### Phase 1 — Entry, routing, and auth

**Scope**: server.js (structure: middleware order, route mounting, env), auth flow (Keycloak, guest ratings, admin).

**Deliverable**: `apps/beerbook-api/docs/architecture-scan/01-entry-routing-auth.md` — Stack, middleware order, route layout, auth mechanisms, config surface (env vars).

---

### Phase 2 — Data layer and persistence

**Scope**: PostgREST usage, key RPCs and call sites, migration themes, Supabase Edge vs in-process.

**Deliverable**: `apps/beerbook-api/docs/architecture-scan/02-data-layer.md`.

---

### Phase 3 — Domain logic (lib and process-event engine)

**Scope**: lib/*.js and process-event (engine + index). One paragraph per lib module; process-event event types, idempotency, invocation points, Node vs Deno parity.

**Deliverable**: `apps/beerbook-api/docs/architecture-scan/03-domain-logic.md`.

---

### Phase 4 — API surface by domain

**Scope**: All HTTP endpoints grouped by domain; per domain: auth, side effects, notable validation. No duplicate of full request/response shapes (API_CONTRACT.md remains source of truth).

**Deliverable**: `apps/beerbook-api/docs/architecture-scan/04-api-by-domain.md`.

---

### Phase 5 — Scripts, tests, and cross-cutting concerns

**Scope**: scripts/, test/, error handling, request ID, rate limiting, upload/moderation flow, CORS.

**Deliverable**: `apps/beerbook-api/docs/architecture-scan/05-scripts-tests-crosscutting.md`.

---

## Final synthesis

- **Input**: The five phase docs in `apps/beerbook-api/docs/architecture-scan/` plus existing API_CONTRACT.md and DATABASE_SCHEMAS_OVERVIEW.md.
- **Output**: `apps/beerbook-api/docs/architecture-scan/BEERBOOK_API_ARCHITECTURE.md` — high-level diagram, stack and mechanisms summary, pointers to the five phase docs and to API_CONTRACT / DATABASE_SCHEMAS_OVERVIEW.

No new code or config changes; all deliverables live under `apps/beerbook-api/docs/architecture-scan/`.

---

## Optional: single-pass alternative

If using one agent run: use the same section structure as phases 1–5 as the checklist; read server → routes → lib → process-event → migrations → scripts → tests; produce a single document with the five sections plus intro/synthesis, and write it (or split into the same five files) into `apps/beerbook-api/docs/architecture-scan/`.
