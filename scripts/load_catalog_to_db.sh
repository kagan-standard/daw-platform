#!/bin/bash
# Load Beer Catalog CSVs into Postgres (breweries first, then beers with brewery_id resolution).
# Run from repo root after: python scripts/build_beer_catalog.py
# Requires: data/output/breweries.csv, beers.csv, beer_styles.csv, flavor_descriptors.csv

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$REPO_ROOT/data/output}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
BATCH_ID="seed_$(date +%Y%m%d%H%M%S)"

echo "=== Loading Beer Catalog (batch: $BATCH_ID) ==="
echo "DATA_DIR=$DATA_DIR"

if [[ ! -f "$DATA_DIR/breweries.csv" ]]; then
    echo "ERROR: $DATA_DIR/breweries.csv not found. Run: python scripts/build_beer_catalog.py" >&2
    exit 1
fi

# 0. Backup
mkdir -p "$BACKUP_DIR"
echo "0. Backing up database..."
docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres > "$BACKUP_DIR/pre-catalog-load-$(date +%Y%m%d%H%M%S).sql"

# 1. Load beer_styles
echo "1. Loading beer_styles..."
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "
    COPY beer_styles(name, category, description, abv_min, abv_max, ibu_min, ibu_max)
    FROM STDIN WITH (FORMAT csv, HEADER true, NULL '');
" < "$DATA_DIR/beer_styles.csv"

# 2. Load breweries (temp table + COPY + INSERT in one session)
echo "2. Loading breweries..."
{
    echo "CREATE TEMP TABLE tmp_breweries (name TEXT, slug TEXT, normalized_name TEXT, source TEXT, source_id TEXT);"
    echo "COPY tmp_breweries FROM STDIN WITH (FORMAT csv, HEADER true, NULL '');"
    cat "$DATA_DIR/breweries.csv"
    echo '\.'
    echo "INSERT INTO breweries (name, slug, normalized_name, source, source_id, import_batch_id) SELECT name, slug, normalized_name, source, source_id, '$BATCH_ID' FROM tmp_breweries ON CONFLICT (slug) DO NOTHING;"
    echo "DROP TABLE tmp_breweries;"
} | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres

# 3. Load beers (temp table + COPY + INSERT with brewery_id JOIN in one session)
echo "3. Loading beers (this is the big one)..."
{
    echo "CREATE TEMP TABLE tmp_beers (name TEXT, slug TEXT, normalized_name TEXT, brewery_normalized_name TEXT, brewery_name TEXT, style TEXT, style_category TEXT, abv DECIMAL, ibu_min INTEGER, ibu_max INTEGER, flavor_astringency INTEGER, flavor_body INTEGER, flavor_alcohol INTEGER, flavor_bitter INTEGER, flavor_sweet INTEGER, flavor_sour INTEGER, flavor_salty INTEGER, flavor_fruity INTEGER, flavor_hoppy INTEGER, flavor_spicy INTEGER, flavor_malty INTEGER, review_aroma DECIMAL, review_appearance DECIMAL, review_palate DECIMAL, review_taste DECIMAL, review_overall DECIMAL, review_count INTEGER, description TEXT, source TEXT, source_id TEXT, source_brewery_id TEXT);"
    echo "COPY tmp_beers FROM STDIN WITH (FORMAT csv, HEADER true, NULL '');"
    cat "$DATA_DIR/beers.csv"
    echo '\.'
    echo "INSERT INTO beers (name, slug, normalized_name, brewery_id, brewery_name, style, style_category, abv, ibu_min, ibu_max, flavor_astringency, flavor_body, flavor_alcohol, flavor_bitter, flavor_sweet, flavor_sour, flavor_salty, flavor_fruity, flavor_hoppy, flavor_spicy, flavor_malty, review_aroma, review_appearance, review_palate, review_taste, review_overall, review_count, description, source, source_id, source_brewery_id, import_batch_id) SELECT t.name, t.slug, t.normalized_name, br.id, t.brewery_name, t.style, t.style_category, t.abv, t.ibu_min, t.ibu_max, t.flavor_astringency, t.flavor_body, t.flavor_alcohol, t.flavor_bitter, t.flavor_sweet, t.flavor_sour, t.flavor_salty, t.flavor_fruity, t.flavor_hoppy, t.flavor_spicy, t.flavor_malty, t.review_aroma, t.review_appearance, t.review_palate, t.review_taste, t.review_overall, t.review_count, t.description, t.source, t.source_id, t.source_brewery_id, '$BATCH_ID' FROM tmp_beers t LEFT JOIN breweries br ON br.normalized_name = t.brewery_normalized_name ON CONFLICT (brewery_id, normalized_name) DO NOTHING;"
    echo "DROP TABLE tmp_beers;"
} | docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres

# 4. Load flavor_descriptors
echo "4. Loading flavor_descriptors..."
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "
    COPY flavor_descriptors(category, keyword, impact)
    FROM STDIN WITH (FORMAT csv, HEADER true, NULL '');
" < "$DATA_DIR/flavor_descriptors.csv"

# 5. Analyze
echo "5. Running ANALYZE..."
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c "
    ANALYZE breweries; ANALYZE beers; ANALYZE beer_styles; ANALYZE flavor_descriptors;
"

# 6. Verify
echo ""
echo "=== Verification ==="
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c "
    SELECT 'breweries' AS tbl, count(*) FROM breweries
    UNION ALL SELECT 'beers', count(*) FROM beers
    UNION ALL SELECT 'beer_styles', count(*) FROM beer_styles
    UNION ALL SELECT 'flavor_descriptors', count(*) FROM flavor_descriptors
    UNION ALL SELECT 'beers_with_reviews', count(*) FROM beers WHERE review_count > 0
    UNION ALL SELECT 'beers_with_flavors', count(*) FROM beers WHERE flavor_hoppy IS NOT NULL
    UNION ALL SELECT 'beers_with_description', count(*) FROM beers WHERE description IS NOT NULL
    ORDER BY tbl;
"

echo ""
echo "=== Search function test ==="
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c "
    SELECT name, brewery_name, style, review_overall, review_count
    FROM search_beer_catalog('yuengling', 5);
"

echo ""
echo "Batch ID: $BATCH_ID"
echo "To rollback: DELETE FROM beers WHERE import_batch_id = '$BATCH_ID'; DELETE FROM breweries WHERE import_batch_id = '$BATCH_ID';"
echo "Done!"
