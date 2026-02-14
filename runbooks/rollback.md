# Rollback — Phase 1

Target: recovery within 10 minutes after a bad deploy or config change.

## Last-known-good (update after each successful deploy)

| Item | Value |
|------|--------|
| keycloak image | `quay.io/keycloak/keycloak:26.1` |
| beerbook image | `nginx:1.25-alpine` |
| beerbook-api image | `beerbook-api:1.0.0` |
| keycloak-db image | `postgres:16-alpine` |
| supabase-db image | `supabase/postgres:15.6.1.143` |
| supabase-rest image | `postgrest/postgrest:v12.2.3` |
| supabase-realtime image | `supabase/realtime:v2.30.34` |
| Config / notes | e.g. “Phase 1 .env, no overrides” |

## Abort / rollback conditions (per service)

- **keycloak**: Restart loop after 3 attempts; admin console unreachable > 5 min.  
- **keycloak-db**: DB fails to initialize or keycloak cannot connect.  
- **beerbook-api**: Health check fails after deploy; all tokens 401 (JWKS/config).  
- **supabase-***: Postgres or PostgREST repeatedly failing; schema migration errors.

## Fast rollback steps

### 1. Revert config

- Restore `infra/compose/.env` from backup or last-known-good copy.  
- If only a single service is bad, change only the vars that affect that service.

### 2. Revert beerbook-api image (if API was redeployed bad)

```bash
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env build beerbook-api  # optional: rebuild from last-known Dockerfile
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d beerbook-api --force-recreate
```

If you had a previous tag (e.g. `beerbook-api:0.9.0`), set that in `docker-compose.yml` under `beerbook-api` → `image`, then:

```bash
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d beerbook-api --force-recreate
```

### 3. Restart Keycloak (if config/env changed)

```bash
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env restart keycloak keycloak-db
```

### 4. Restart Supabase stack (if DB or REST config changed)

```bash
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env restart supabase-db supabase-rest supabase-realtime
# If DB was recreated from backup, then:
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env restart supabase-rest supabase-realtime beerbook-api
```

### 5. Full stack down/up (nuclear)

```bash
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env down
# Fix .env and/or compose file
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d
```

## Post-rollback verification

- [ ] Keycloak: https://auth.drinksafterwork.net loads.  
- [ ] BeerBook: https://beerbook.drinksafterwork.net loads.  
- [ ] API: `curl -s https://api.beerbook.drinksafterwork.net/api/health` → 200.  
- [ ] Login and one POST /api/ratings with valid token → 201.  
- [ ] No restart loops: `docker ps` shows all containers “Up” and not restarting.

Run the relevant checks from `runbooks/smoke_tests.md` after rollback.
