# Troubleshooting — Phase 1

## Log locations

| Service | How to view logs |
|---------|------------------|
| Keycloak | `docker logs keycloak` |
| Keycloak DB | `docker logs keycloak-db` |
| BeerBook (nginx) | `docker logs beerbook` |
| daw-web (nginx) | `docker logs daw-web` |
| beerbook-api | `docker logs beerbook-api` |
| Supabase Postgres | `docker logs supabase-db` |
| PostgREST | `docker logs supabase-rest` |
| Realtime | `docker logs supabase-realtime` |
| Traefik | Use your existing Traefik log path (e.g. Docker or playbook-managed). |

Follow with `-f` for stream: `docker logs -f beerbook-api`.

## Restart commands

Use explicit compose path on prod: `/opt/daw-platform/infra/compose/docker-compose.yml`.

```bash
docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env restart keycloak
docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env restart beerbook-api
docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env restart supabase-rest supabase-realtime
```

Or use `./infra/compose/run.sh restart <service>`.

## Traefik routing

- Containers must be on network `traefik`:  
  `docker network inspect traefik` — should list keycloak, beerbook, beerbook-api.
- Labels must match your Traefik entrypoints/cert resolver.  
  Default in compose: `entrypoints=websecure`, `certresolver=letsencrypt`.  
  If your Traefik uses `web-secure` or `le`, change labels in `infra/compose/docker-compose.yml`.
- If HTTPS fails: check Traefik logs and that DNS for the hostnames points to this host.

## Verify named volumes (Phase 1.5)

Data “missing” is often caused by running compose from the wrong directory. Always use:

```bash
docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml ...
```

Check that DB data is on named volumes (not anonymous or wrong project):

```bash
docker inspect keycloak-db | jq '.[0].Mounts'
docker inspect supabase-db | jq '.[0].Mounts'
```

Expect `Type: "volume"` and names containing `keycloak_db_data`, `supabase_db_data`.

## Common errors

### Keycloak redirect URI mismatch

- Ensure `KC_PROXY=edge`, `KC_HOSTNAME=auth.drinksafterwork.net`, `KC_HTTP_ENABLED=true` in Keycloak env.
- In client `beerbook`, Valid redirect URIs must include `https://beerbook.drinksafterwork.net/*` (no trailing slash on origin).
- For **daw-web**: client `daw-web` must have Valid redirect URIs `https://drinksafterwork.net/*` and Post logout redirect URIs `https://drinksafterwork.net/*`. Web origins: `https://drinksafterwork.net`.

### daw-web OIDC / Traefik

- If "Sign in with DAW" fails with redirect_uri_mismatch: confirm Keycloak client `daw-web` has exactly `https://drinksafterwork.net/*` (and that the site is loaded at https://drinksafterwork.net, not a different origin).
- If daw-web returns 404 or Traefik error: ensure container is on `traefik` network: `docker network inspect traefik` (should list daw-web). Restart: `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env restart daw-web`.

### 401 on API with “valid” token

- Decode the access token: `aud` must include `beerbook` and `azp` must be `beerbook`.  
  Add the audience mapper in Keycloak (see `runbooks/deploy.md`).
- Check `KEYCLOAK_JWKS_URI` in .env and that beerbook-api can reach it (e.g. from inside container: `curl -s KEYCLOAK_JWKS_URI`).

### 502 from beerbook-api when calling PostgREST

- Ensure supabase-rest is up: `docker ps | grep supabase-rest`.
- From beerbook-api container:  
  `docker exec beerbook-api wget -q -O- http://supabase-rest:3000/ratings` (or use node fetch to same URL).  
  If this fails, fix PostgREST or Supabase DB (logs: `docker logs supabase-rest`, `docker logs supabase-db`).
- Check `SUPABASE_SERVICE_ROLE_KEY` is set and is a JWT signed with the same `PGRST_JWT_SECRET` used by PostgREST.

### CORS errors in browser

- Only `https://beerbook.drinksafterwork.net` is allowed.  
  Ensure the user is on that origin (not localhost unless you add it to CORS_ORIGIN and redeploy).
- Check `Access-Control-Allow-Origin` in response:  
  `curl -sI -H "Origin: https://beerbook.drinksafterwork.net" https://api.beerbook.drinksafterwork.net/api/health`.

### Supabase Realtime not receiving events

- Phase 1 frontend uses **polling** (every 5s), not Supabase Realtime in the browser.  
  If “realtime” is meant to be Realtime server: check `docker logs supabase-realtime` and that `ratings` is in `supabase_realtime` publication (`ALTER PUBLICATION supabase_realtime ADD TABLE ratings` in schema).

### Supabase Realtime crash-loop

- Realtime needs the `_realtime` schema and `supabase_realtime` publication.  
  Apply or re-run `apps/beerbook/docs/database-schema.sql` (it creates `CREATE SCHEMA IF NOT EXISTS _realtime` and the publication).  
- Check logs: `docker logs supabase-realtime`.  
- After fixing schema, restart:  
  `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml restart supabase-realtime`

### Keycloak or Supabase DB won’t start

- Check disk space: `df -h`.  
- Check logs for OOM or “database system was not properly shut down”.  
  If needed, restore from backup (see `runbooks/backup_restore.md`).
