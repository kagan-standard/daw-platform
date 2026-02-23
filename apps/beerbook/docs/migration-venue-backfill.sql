-- Backfill: create venues from orphaned geotagged ratings.
-- Run once after deploying venue auto-link/upsert logic.

-- Step 1: Insert distinct venues from orphaned ratings with coordinates + location_name.
INSERT INTO venues (name, latitude, longitude, created_by, created_at)
SELECT DISTINCT ON (location_name, ROUND(latitude::numeric, 3), ROUND(longitude::numeric, 3))
  location_name,
  latitude,
  longitude,
  user_id,
  MIN(created_at)
FROM ratings
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND location_name IS NOT NULL
  AND location_name <> ''
  AND venue_id IS NULL
GROUP BY location_name, ROUND(latitude::numeric, 3), ROUND(longitude::numeric, 3), latitude, longitude, user_id
ON CONFLICT DO NOTHING;

-- Step 2: Link orphaned ratings to venues by name + approximate position.
UPDATE ratings r
SET venue_id = v.id
FROM venues v
WHERE r.venue_id IS NULL
  AND r.latitude IS NOT NULL
  AND r.longitude IS NOT NULL
  AND r.location_name IS NOT NULL
  AND r.location_name = v.name
  AND ABS(r.latitude - v.latitude) < 0.001
  AND ABS(r.longitude - v.longitude) < 0.001;
