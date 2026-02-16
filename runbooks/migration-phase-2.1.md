# Phase 2.1 — Database migration

The Phase 2.1 schema migration was not applied automatically. Run it once on the VPS after deploying Phase 2.1.

## Location

- **File:** `apps/beerbook/docs/migration-2.1.sql`
- **On VPS:** `/opt/daw-platform/apps/beerbook/docs/migration-2.1.sql` (if repo is at `/opt/daw-platform`)  
  Or from repo root: `apps/beerbook/docs/migration-2.1.sql`

## Prerequisites

- Compose stack running (so `supabase-db` container exists).
- Run from the host where Docker is running (VPS).

## Run migration (one-time)

From the **repository root** on the VPS (e.g. `/opt/daw-platform/`):

```bash
docker exec -i supabase-db psql -U postgres -d postgres < apps/beerbook/docs/migration-2.1.sql
```

If your repo root is elsewhere, use the full path to the SQL file:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < /opt/daw-platform/apps/beerbook/docs/migration-2.1.sql
```

The migration is idempotent (safe to run more than once).

## Verify

```bash
# Tables present (expect: profiles, ratings, venues, happy_hours, price_logs, reactions, etc.)
docker exec supabase-db psql -U postgres -d postgres -c '\dt'

# ratings has new columns (yg_value, latitude, longitude, location_name, venue_id, photo_url)
docker exec supabase-db psql -U postgres -d postgres -c '\d ratings'

# Views exist
docker exec supabase-db psql -U postgres -d postgres -c 'SELECT * FROM yg_exchange LIMIT 1;'
docker exec supabase-db psql -U postgres -d postgres -c 'SELECT * FROM venue_menus LIMIT 1;'
```

See also: `apps/beerbook/docs/PHASE-2.1-VALIDATION.md`.
