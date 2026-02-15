# Smoke Tests — Phase 1 + Phase 2 (daw-web)

Run after deploy. All from a host that can reach the VM (or from the VM).

## Prerequisites

- DNS: `auth.drinksafterwork.net`, `beerbook.drinksafterwork.net`, `api.beerbook.drinksafterwork.net`, `drinksafterwork.net` → `178.156.232.88`
- TLS certs valid on all three
- Containers up: `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env ps`

---

## Functional

| Check | Command / Step | Expected |
|-------|----------------|----------|
| DNS | `nslookup auth.drinksafterwork.net` | `178.156.232.88` (and same for beerbook, api.beerbook, drinksafterwork.net) |
| TLS | `curl -sI https://auth.drinksafterwork.net` | 200, valid cert |
| OIDC Discovery | `curl -s https://auth.drinksafterwork.net/realms/daw/.well-known/openid-configuration` | JSON with `authorization_endpoint`, `token_endpoint`, `jwks_uri` |
| API health | `curl -s https://api.beerbook.drinksafterwork.net/api/health` | `{"status":"ok","service":"beerbook-api"}` |
| API public read | `curl -s https://api.beerbook.drinksafterwork.net/api/ratings` | `{"data":[...],"pagination":{...}}`, 200 |
| API auth gate | `curl -s -X POST https://api.beerbook.drinksafterwork.net/api/ratings -H "Content-Type: application/json" -d '{}'` | 401 |
| Supabase NOT public | From outside VM: `curl -s http://178.156.232.88:5432` or `:3000` | Connection refused / no route (ports not published) |
| Login flow | Browser: beerbook → Sign in with DAW → Keycloak → back to BeerBook | Session established |
| Data persistence | Create a review in BeerBook, refresh page | Review still visible |
| Ownership | User A creates review; User B (different account) cannot delete it | Delete fails or 404 |

---

## Phase 2 — daw-web (front door)

| Check | Command / Step | Expected |
|-------|----------------|----------|
| daw-web loads | `curl -fsSI https://drinksafterwork.net \| head` | 200, HTML |
| Existing services | `curl -fsSI https://beerbook.drinksafterwork.net \| head`; `curl -fsSI https://auth.drinksafterwork.net \| head`; `curl -fsSI https://api.beerbook.drinksafterwork.net/api/health` | 200 / healthy |
| config.js | `curl -fsSI https://drinksafterwork.net/config.js` | 200 |
| OIDC discovery | `curl -s https://auth.drinksafterwork.net/realms/daw/.well-known/openid-configuration` | JSON with endpoints |
| No Matrix in source | `curl -s https://drinksafterwork.net \| grep -c "_matrix/client"` | 0 |
| No reCAPTCHA | `curl -s https://drinksafterwork.net \| grep -c "recaptcha"` | 0 |

**Manual browser:** Open https://drinksafterwork.net → launcher cards visible; "Sign in with DAW" → Keycloak; log in → return with username; BeerBook / DAW Chat cards link correctly; DAWFootball disabled; Sign out → logged-out state; test at 375px width.

---

## Token strictness (aud/azp)

| Check | How | Expected |
|-------|-----|----------|
| aud check | Use a token with `aud: "other-client"` (e.g. from another Keycloak client) in `Authorization: Bearer <token>` on POST /api/ratings | 403 |
| azp check | Same: token minted for another client | 403 |
| Expired token | Use an expired access token | 401 |
| Malformed token | `Authorization: Bearer invalid` | 401 |

---

## Abuse resistance (pagination, rate limit)

| Check | Command | Expected |
|-------|---------|----------|
| Pagination default | `curl -s "https://api.beerbook.drinksafterwork.net/api/ratings"` | `pagination.limit` ≤ 50 |
| Pagination max | `curl -s "https://api.beerbook.drinksafterwork.net/api/ratings?limit=500"` | `pagination.limit` = 100 (clamped) |
| Invalid sort | `curl -s "https://api.beerbook.drinksafterwork.net/api/ratings?sort=password"` | 400 |
| Rate limit | Send 101 requests in 60s from same IP to e.g. /api/health or /api/ratings | 429, `Retry-After` header present |

---

## CORS

| Check | Command | Expected |
|-------|---------|----------|
| Allowed origin | `curl -sI -H "Origin: https://beerbook.drinksafterwork.net" https://api.beerbook.drinksafterwork.net/api/health` | `Access-Control-Allow-Origin: https://beerbook.drinksafterwork.net` |
| Blocked origin | `curl -sI -H "Origin: https://evil.example.com" https://api.beerbook.drinksafterwork.net/api/health` | No CORS headers (or not Allow-Origin for evil) |
| Preflight allowed | `curl -sI -X OPTIONS -H "Origin: https://beerbook.drinksafterwork.net" https://api.beerbook.drinksafterwork.net/api/ratings` | 204, CORS headers |
| Preflight blocked | `curl -sI -X OPTIONS -H "Origin: https://evil.example.com" https://api.beerbook.drinksafterwork.net/api/ratings` | 403 or no CORS headers |

---

## Realtime propagation

- Open two browser tabs at https://beerbook.drinksafterwork.net, both logged in.
- In Tab A: create a new review.
- Within a few seconds (polling interval ~5s), Tab B should refresh and show the new review (or navigate/refresh to confirm data is shared).

Document: Phase 1 uses **polling** (every 5s) for “realtime” propagation; no Supabase Realtime in browser.

---

## Resilience

| Check | Step | Expected |
|-------|------|----------|
| Restart | `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env down && up -d` | All services come back; Keycloak, BeerBook, API reachable |
| No console errors | Use BeerBook in browser, check DevTools console | No auth/CORS/network errors |

---

## Rollback drill

1. Record last-known-good: note current image tags (e.g. `beerbook-api:1.0.0`) and config in `runbooks/rollback.md`.
2. Deploy a bad config: e.g. set `KEYCLOAK_JWKS_URI` to wrong URL in .env, restart beerbook-api.
3. Verify failure: POST /api/ratings with valid token → 401 or 500.
4. Execute rollback: restore .env, `docker compose up -d beerbook-api` (or revert image per rollback.md).
5. Verify recovery: POST /api/ratings with valid token → 201.
6. Target: recovery within 10 minutes.
