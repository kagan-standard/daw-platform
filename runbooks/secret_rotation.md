# Secret Rotation — Phase 1

**Cadence:** Quarterly, or immediately on incident / staff turnover.

**Secrets in scope:** Keycloak admin password, `PGRST_JWT_SECRET`, Supabase `service_role` key, Supabase `anon` key.

## 1. Keycloak admin password

1. Log in to Keycloak admin at https://auth.drinksafterwork.net.  
2. Realm **master** → Manage → Users → user `admin` (or your admin user).  
3. Credentials tab → Set password (temporary OFF if you want to force change on next login).  
4. Update `infra/compose/.env`:  
   `KEYCLOAK_ADMIN_PASSWORD=<new password>`  
5. Restart Keycloak so it picks up env (if you use bootstrap admin):  
   `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env restart keycloak`  
   (Note: Keycloak 26 may not re-bootstrap admin from env on restart; in that case only the DB password is relevant. Change the admin user password in the UI and keep .env in sync for documentation.)

## 2. PGRST_JWT_SECRET and Supabase JWT keys

PostgREST and Realtime use `PGRST_JWT_SECRET` to verify JWTs. beerbook-api uses `SUPABASE_SERVICE_ROLE_KEY` (and optionally anon for future use). All JWTs must be signed with the **same** secret.

### Rotate secret and keys together

1. **Generate new secret**  
   `NEW_SECRET=$(openssl rand -base64 32)` (store in a temp file or env, not in repo).

2. **Generate new anon and service_role JWTs**  
   Use a small script or tool that signs a JWT with HS256 and the new secret.  
   Payloads (example):  
   - anon: `{"role":"anon","iss":"daw","exp":9999999999}`  
   - service_role: `{"role":"service_role","iss":"daw","exp":9999999999}`  
   (Use real `exp` if you want expiry.)

   Example with Node (sign with `jose` or `jsonwebtoken`):

   ```js
   const secret = process.env.NEW_SECRET;
   const payload = { role: 'service_role', iss: 'daw', exp: Math.floor(Date.now()/1000) + 10*365*24*3600 };
   // sign with HS256, output JWT
   ```

3. **Update .env**  
   - `PGRST_JWT_SECRET=<NEW_SECRET>`  
   - `SUPABASE_SERVICE_ROLE_KEY=<new service_role JWT>`  
   - `SUPABASE_ANON_KEY=<new anon JWT>` (if used)

4. **Restart services that use the secret or keys**  
   - PostgREST: `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env restart supabase-rest`  
   - Realtime: `docker compose ... restart supabase-realtime`  
   - beerbook-api: `docker compose ... restart beerbook-api`

5. **Verify**  
   - Health: `curl -s https://api.beerbook.drinksafterwork.net/api/health` → 200.  
   - Authenticated request with Keycloak token: POST /api/ratings → 201.

## 3. Keycloak DB password (KC_DB_PASSWORD)

1. Change password in Postgres:  
   `docker exec -it keycloak-db psql -U keycloak -d keycloak -c "ALTER USER keycloak PASSWORD 'new_password';"`  
2. Update `infra/compose/.env`: `KC_DB_PASSWORD=new_password`.  
3. Restart Keycloak:  
   `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env restart keycloak`

## 4. Supabase DB password (SUPABASE_DB_PASSWORD)

1. Change in Postgres:  
   `docker exec -it supabase-db psql -U postgres -c "ALTER USER postgres PASSWORD 'new_password';"`  
2. Update `.env`: `SUPABASE_DB_PASSWORD=new_password`.  
3. Restart consumers:  
   `docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env restart supabase-rest supabase-realtime`

## Emergency invalidation (key compromise)

- **Keycloak:** Change admin password and KC_DB_PASSWORD; restart Keycloak. Consider revoking existing sessions (realm → Sessions) if needed.  
- **PGRST_JWT_SECRET / service_role:** Rotate as in section 2; restart supabase-rest, supabase-realtime, beerbook-api. All clients must use new tokens (BeerBook uses Keycloak tokens; only beerbook-api uses the service_role key, so no browser change).  
- **DB passwords:** Rotate as in sections 3 and 4; restart dependent containers.

## Post-rotation checklist

- [ ] Keycloak admin login works.  
- [ ] BeerBook login (Keycloak) works.  
- [ ] API health 200.  
- [ ] POST /api/ratings with Keycloak token succeeds.  
- [ ] No 401/502 from beerbook-api to PostgREST.
