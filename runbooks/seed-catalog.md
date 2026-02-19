# Runbook: Seed Beer Catalog (Phase 3.1)

Load the beer catalog from pipeline-generated CSVs into PostgreSQL in the `supabase-db` container.

## Prerequisites

- **Python 3** with dependencies: `openpyxl` (for pipeline)
- **Docker** running; container `supabase-db` up with Postgres
- **Phase 3.1 migration** already applied (see [migration-phase-3.1.md](migration-phase-3.1.md))
- **Source data** in `data/` (as required by the pipeline; see script docstrings). Pipeline outputs go to `data/output/`.

## Step 1: Run pipeline

From repo root:

```bash
python3 scripts/build_beer_catalog.py
```

Produces in `data/output/`:

- `breweries.csv`
- `beers.csv`
- `beer_styles.csv`
- `flavor_descriptors.csv`

## Step 2: Run load script

From repo root:

```bash
bash scripts/load_catalog_to_db.sh
```

- **Container:** `supabase-db`
- **Database:** `postgres`
- Script takes a backup under `backups/` before loading.
- At the end it prints a **batch ID** (e.g. `seed_20250218120000`). Save it for rollback.

## Expected output counts (verified)

After a full run:

| Table / metric              | Count   |
|----------------------------|--------|
| beers                      | ~90,010 (84,119 unique names) |
| breweries                  | ~4,421 |
| beer_styles                | ~105   |
| flavor_descriptors         | ~630   |
| Beers with brewery link    | ~47,211 |
| Beers without brewery link | ~42,799 |
| Beers with description     | ~1,850 |
| Beers with flavor profile   | ~3,197 |
| Beers with reviews         | ~44,403 |

## Verification queries

Run inside the DB (e.g. `docker exec -it supabase-db psql -U postgres -d postgres`):

```sql
SELECT 'breweries' AS tbl, count(*) FROM breweries
UNION ALL SELECT 'beers', count(*) FROM beers
UNION ALL SELECT 'beer_styles', count(*) FROM beer_styles
UNION ALL SELECT 'flavor_descriptors', count(*) FROM flavor_descriptors
UNION ALL SELECT 'beers_with_brewery', count(*) FROM beers WHERE brewery_id IS NOT NULL
UNION ALL SELECT 'beers_with_description', count(*) FROM beers WHERE description IS NOT NULL
UNION ALL SELECT 'beers_with_flavors', count(*) FROM beers WHERE flavor_hoppy IS NOT NULL
UNION ALL SELECT 'beers_with_reviews', count(*) FROM beers WHERE review_count > 0
ORDER BY tbl;
```

Quick search test:

```sql
SELECT name, brewery_name, style, review_overall, review_count
FROM search_beer_catalog('yuengling', 5);
```

## Rollback

Using the **batch ID** printed by the load script:

```sql
DELETE FROM beers WHERE import_batch_id = '<batch_id>';
DELETE FROM breweries WHERE import_batch_id = '<batch_id>';
```

Example: if batch ID was `seed_20250218120000`:

```sql
DELETE FROM beers WHERE import_batch_id = 'seed_20250218120000';
DELETE FROM breweries WHERE import_batch_id = 'seed_20250218120000';
```

`beer_styles` and `flavor_descriptors` are loaded with `ON CONFLICT DO NOTHING`; rollback of a single batch does not remove them (they are shared reference data).

## Known issues

- **~43K beers without `brewery_id`:** From `full_reviews`-style source; brewery could not be matched to the breweries catalog. These rows remain with `brewery_name` only.
- **Sierra Nevada Pale Ale:** Present as two catalog entries (different sources/identifiers).
