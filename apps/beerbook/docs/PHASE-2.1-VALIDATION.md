# Phase 2.1 — Validation & Rollback

All commands assume VPS at `/opt/daw-platform/` and API base `https://api.beerbook.drinksafterwork.net` (or localhost:3001 when testing locally). Replace `$TOKEN` with a valid Keycloak Bearer token for auth-required endpoints.

## Migration validation (run on VPS after applying migration)

```bash
# Run migration (from repo root on VPS)
docker exec -i supabase-db psql -U postgres -d postgres < apps/beerbook/docs/migration-2.1.sql

# Tables present
docker exec supabase-db psql -U postgres -d postgres -c '\dt'

# ratings new columns
docker exec supabase-db psql -U postgres -d postgres -c '\d ratings'

# Views
docker exec supabase-db psql -U postgres -d postgres -c 'SELECT * FROM yg_exchange LIMIT 1;'
docker exec supabase-db psql -U postgres -d postgres -c 'SELECT * FROM venue_menus LIMIT 1;'

# Row count unchanged
docker exec supabase-db psql -U postgres -d postgres -c 'SELECT count(*) FROM ratings;'
```

## API validation (curl)

```bash
BASE=https://api.beerbook.drinksafterwork.net
# or BASE=http://localhost:3001

# Health
curl -s "$BASE/api/health"

# Beers
curl -s "$BASE/api/beers?limit=2"
curl -s "$BASE/api/beers/search?q=pal"
curl -s "$BASE/api/beers/Sierra%20Nevada%20Pale%20Ale"

# Exchange
curl -s "$BASE/api/exchange?limit=2"
curl -s "$BASE/api/exchange/portfolio/some-user-id"
curl -s "$BASE/api/exchange/Some%20Beer"

# Venues (no geo)
curl -s "$BASE/api/venues?limit=2"
# Venues with geo (replace lat/lng)
curl -s "$BASE/api/venues?lat=40.7&lng=-74&radius=5000"
# Venue detail (need existing venue id)
curl -s "$BASE/api/venues/VENUE_ID"

# Create venue (auth)
curl -s -X POST "$BASE/api/venues" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Test Pub","latitude":40.7,"longitude":-74.0}'

# Venue prices / happy hours
curl -s "$BASE/api/venues/VENUE_ID/prices"
curl -s "$BASE/api/venues/VENUE_ID/happy-hours"

# Deals
curl -s "$BASE/api/deals?lat=40.7&lng=-74&radius=5000"

# Activity
curl -s "$BASE/api/activity"
curl -s "$BASE/api/ratings/RATING_ID/cheers"
curl -s "$BASE/api/users/USER_ID"
curl -s "$BASE/api/users/USER_ID/stats"

# Map
curl -s "$BASE/api/map"
curl -s "$BASE/api/map/user/USER_ID"

# Leaderboard
curl -s "$BASE/api/leaderboard?period=weekly"
curl -s "$BASE/api/leaderboard?period=monthly"
curl -s "$BASE/api/leaderboard?period=alltime"

# Highlights
curl -s "$BASE/api/highlights/beer-of-the-week"

# Upload (auth, multipart)
curl -s -X POST "$BASE/api/upload" -H "Authorization: Bearer $TOKEN" -F "file=@/path/to/image.jpg"

# POST rating with new optional fields
curl -s -X POST "$BASE/api/ratings" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"beer_name":"Test","style":"IPA","rating":4,"yg_value":2.5,"latitude":40.7,"longitude":-74}'
```

## Rollback steps

**Migration (schema):** Phase 2.1 is additive only. There is no automated rollback script. To revert:

1. Do **not** drop columns or tables that may hold data.
2. If you must undo before go-live: restore the database from a pre–migration backup:
   ```bash
   # Restore from backup (example; adjust paths)
   docker exec -i supabase-db psql -U postgres -d postgres < /path/to/backup_before_2.1.sql
   ```
3. Document backup location and restore procedure in your runbooks.

**API (beerbook-api):**

1. Revert `apps/beerbook-api` to previous commit (or redeploy image `beerbook-api:1.0.0`).
2. Rebuild and restart:
   ```bash
   docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env build beerbook-api
   docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env up -d beerbook-api
   ```
3. If you reverted to 1.0.0: remove `uploads_data` volume mount and `UPLOAD_DIR` from compose if not used.

**Docker Compose:**

1. To revert image tag: in `docker-compose.yml` set `image: beerbook-api:1.0.0` and remove the `uploads_data` volume from `beerbook-api` and the `UPLOAD_DIR` env var.
2. Run `docker compose ... up -d` to recreate the API container.
