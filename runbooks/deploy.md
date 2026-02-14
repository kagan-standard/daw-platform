# Deploy — Phase 1 (BeerBook + Keycloak + Supabase)

## Prerequisites

- Docker and Docker Compose on host (Hetzner VM).
- Traefik running with network `traefik`. Create if missing: `docker network create traefik`.
- Traefik entrypoint for HTTPS (e.g. `websecure`) and cert resolver (e.g. `letsencrypt`). If your labels use different names, edit `infra/compose/docker-compose.yml` (e.g. `entrypoints=web-secure`, `certresolver=le`).

## 1. DNS (manual)

Ensure A records point to `178.156.232.88`:

- `auth.drinksafterwork.net`
- `beerbook.drinksafterwork.net`
- `api.beerbook.drinksafterwork.net`

## 2. Secrets and env

```bash
cd /path/to/daw-platform
cp infra/compose/.env.example infra/compose/.env
```

Edit `infra/compose/.env`:

- Set `KC_DB_PASSWORD`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`.
- Set `SUPABASE_DB_PASSWORD`.
- Generate `PGRST_JWT_SECRET` (min 32 chars): `openssl rand -base64 32`.
- Generate `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (JWTs signed with `PGRST_JWT_SECRET`). See `runbooks/secret_rotation.md` for how to create anon/service_role JWTs.

## 3. Start stack

```bash
cd /path/to/daw-platform
./infra/compose/run.sh up
```

Or:

```bash
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d
```

Wait for Keycloak and Supabase DB to be healthy (e.g. 30–60s).

## 4. Run database schema (Supabase)

```bash
docker exec -i supabase-db psql -U postgres < apps/beerbook/docs/database-schema.sql
```

Verify:

```bash
docker exec supabase-db psql -U postgres -c '\dt'
# Should list profiles, ratings (and possibly others).
```

## 5. Configure Keycloak (realm, client, audience mapper)

1. Open https://auth.drinksafterwork.net and log in with `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`.

2. **Create realm `daw`**  
   - Realm name: `daw` → Save.  
   - Realm Settings → Login: enable **User registration**.

3. **Create client `beerbook`**  
   - Clients → Create client.  
   - Client type: OpenID Connect.  
   - Client ID: `beerbook`.  
   - Next → Client authentication: **OFF** (public).  
   - Next → Valid redirect URIs: `https://beerbook.drinksafterwork.net/*`.  
   - Valid post logout redirect URIs: `https://beerbook.drinksafterwork.net/*`.  
   - Web origins: `https://beerbook.drinksafterwork.net`.  
   - Save.

4. **Add audience mapper so access tokens include `aud: beerbook`**  
   - Clients → `beerbook` → Client scopes → `beerbook-dedicated` (or create one).  
   - Add mapper:  
     - Protocol: OpenID Connect.  
     - Mapper type: **Audience**.  
     - Name: `audience-beerbook`.  
     - Included Client Audience: `beerbook`.  
     - Add to ID token: OFF, **Add to access token: ON**.  
   - Save.  
   - Ensure the client’s **Assigned client scopes** include this scope (so access tokens get `aud`).

   Alternative (realm-level): Client scopes → Create `audience-beerbook` scope, add same Audience mapper, then assign to client `beerbook`.

5. **Verify**  
   - Use OIDC discovery: `curl -s https://auth.drinksafterwork.net/realms/daw/.well-known/openid-configuration`.  
   - Log in via BeerBook, decode access token (e.g. jwt.io): must contain `aud` including `beerbook` and `azp: "beerbook"`.

6. **Test user**  
   - Users → Add user (e.g. `testuser`), set password in Credentials tab.

## 6. Update BeerBook static files (if changed)

If you changed `apps/beerbook/`:

- Ensure the compose volume mounts the repo’s `apps/beerbook` (as in `docker-compose.yml`).  
- Or copy into the container/volume and restart:  
  `docker compose -f infra/compose/docker-compose.yml restart beerbook`

## 7. Rebuild beerbook-api (if code changed)

```bash
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env build beerbook-api --no-cache
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d beerbook-api
```

## 8. Smoke tests

Run checks in `runbooks/smoke_tests.md` (health, auth, pagination, rate limit, CORS, rollback drill).

## 9. Record last-known-good (rollback)

After a successful deploy, note in `runbooks/rollback.md`:

- Image tags (keycloak, beerbook, beerbook-api, keycloak-db, supabase-db, supabase-rest, supabase-realtime).  
- Config hash or short description (e.g. “Phase 1 .env as of 2025-02-13”).
