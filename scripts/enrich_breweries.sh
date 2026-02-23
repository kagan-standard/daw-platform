#!/bin/bash
set -e

CONTAINER=supabase-db
DB=postgres
CSV=/opt/daw-platform/data/openbrewerydb_breweries.csv

echo "=== Enriching breweries from Open Brewery DB ==="

# 1. Create staging table
docker exec -i $CONTAINER psql -U postgres -d $DB -c "
DROP TABLE IF EXISTS tmp_obdb;
CREATE TABLE tmp_obdb (
    obdb_id TEXT,
    name TEXT,
    brewery_type TEXT,
    address_1 TEXT,
    address_2 TEXT,
    address_3 TEXT,
    city TEXT,
    state_province TEXT,
    postal_code TEXT,
    country TEXT,
    phone TEXT,
    website_url TEXT,
    longitude TEXT,
    latitude TEXT
);
"

# 2. Load CSV
docker exec -i $CONTAINER psql -U postgres -d $DB -c "COPY tmp_obdb FROM STDIN WITH (FORMAT csv, HEADER true, NULL '', QUOTE '\"');" < "$CSV"

echo "Loaded $(docker exec -i $CONTAINER psql -U postgres -d $DB -t -c "SELECT COUNT(*) FROM tmp_obdb;") OBDB records"

# 3. Update existing breweries by normalized name match
docker exec -i $CONTAINER psql -U postgres -d $DB -c "
UPDATE breweries b
SET
    latitude = o.latitude::numeric(9,6),
    longitude = o.longitude::numeric(9,6),
    street = COALESCE(o.address_1, b.street),
    city = COALESCE(o.city, b.city),
    state = COALESCE(o.state_province, b.state),
    postal_code = COALESCE(o.postal_code, b.postal_code),
    country = COALESCE(o.country, b.country),
    phone = COALESCE(o.phone, b.phone),
    website_url = COALESCE(o.website_url, b.website_url),
    brewery_type = COALESCE(o.brewery_type, b.brewery_type),
    updated_at = NOW()
FROM tmp_obdb o
WHERE LOWER(TRIM(b.name)) = LOWER(TRIM(o.name))
  AND o.latitude IS NOT NULL AND o.latitude != ''
  AND o.longitude IS NOT NULL AND o.longitude != '';
"

echo "=== Exact match results ==="
docker exec -i $CONTAINER psql -U postgres -d $DB -c "
SELECT COUNT(*) AS has_coords FROM breweries WHERE latitude IS NOT NULL;
"

# 4. Fuzzy match remaining (trigram similarity > 0.6)
docker exec -i $CONTAINER psql -U postgres -d $DB -c "
UPDATE breweries b
SET
    latitude = o.latitude::numeric(9,6),
    longitude = o.longitude::numeric(9,6),
    street = COALESCE(o.address_1, b.street),
    city = COALESCE(o.city, b.city),
    state = COALESCE(o.state_province, b.state),
    postal_code = COALESCE(o.postal_code, b.postal_code),
    country = COALESCE(o.country, b.country),
    phone = COALESCE(o.phone, b.phone),
    website_url = COALESCE(o.website_url, b.website_url),
    brewery_type = COALESCE(o.brewery_type, b.brewery_type),
    updated_at = NOW()
FROM tmp_obdb o
WHERE b.latitude IS NULL
  AND similarity(LOWER(TRIM(b.name)), LOWER(TRIM(o.name))) > 0.6
  AND o.latitude IS NOT NULL AND o.latitude != ''
  AND o.longitude IS NOT NULL AND o.longitude != '';
"

echo "=== After fuzzy match ==="
docker exec -i $CONTAINER psql -U postgres -d $DB -c "
SELECT 
    COUNT(*) AS total,
    COUNT(latitude) AS has_coords,
    COUNT(website_url) AS has_website,
    COUNT(city) AS has_city
FROM breweries;
"

# 5. Cleanup
docker exec -i $CONTAINER psql -U postgres -d $DB -c "DROP TABLE tmp_obdb;"

echo "Done!"
