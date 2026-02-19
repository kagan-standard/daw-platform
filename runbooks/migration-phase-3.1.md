# Runbook: Migration Phase 3.1 — Beer Catalog Schema

Apply the Phase 3.1 schema: beer catalog tables, search function, and nullable `ratings.beer_id` FK.

## What this migration does

- **Enables** `pg_trgm` for trigram similarity and GIN indexes.
- **Creates 6 tables:** `breweries`, `beers`, `beer_styles`, `brewery_aliases`, `beer_aliases`, `flavor_descriptors`.
- **Adds** nullable `beer_id` to `ratings` with FK to `beers(id)` (Phase 3.2 will backfill).
- **Creates** `search_beer_catalog(search_term, max_results)` for prefix + fuzzy catalog search.
- **Creates** triggers for `breweries` and `beers` `updated_at`.

**Note:** `beer_styles` and `flavor_descriptors` are **empty** after this migration. They are populated by the seed runbook ([seed-catalog.md](seed-catalog.md)), not by the migration.

## Pre-migration backup

```bash
docker exec supabase-db pg_dump -U postgres -d postgres > backups/pre-migration-3.1-$(date +%Y%m%d%H%M%S).sql
```

Ensure `supabase-db` is the correct container name and `backups/` exists (or adjust path).

## Apply migration

From repo root, run the Phase 3.1 SQL file:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < apps/beerbook/docs/migration-3.1.sql
```

Or from inside the container:

```bash
docker exec -it supabase-db psql -U postgres -d postgres -f /path/to/migration-3.1.sql
```

(If the file is mounted or copied into the container; otherwise use the first form.)

Migration is **idempotent** (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).

## Post-migration verification

1. **Tables and extension:**

```sql
SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';
-- Expect: pg_trgm

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN (
  'breweries', 'beers', 'beer_styles', 'brewery_aliases', 'beer_aliases', 'flavor_descriptors'
)
ORDER BY table_name;
-- Expect 6 rows.
```

2. **`ratings.beer_id`:**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ratings' AND column_name = 'beer_id';
-- Expect: beer_id, text, YES.
```

3. **Search function:**

```sql
SELECT search_beer_catalog('test', 2);
-- Should return 0 rows (empty catalog until seed is run); no error.
```

## Next step

Run the [seed-catalog](seed-catalog.md) runbook to load `beer_styles`, `flavor_descriptors`, `breweries`, and `beers` from the pipeline CSVs.
