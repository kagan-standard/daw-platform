-- Enforce: one rating per user per beer per venue at the database level.
-- NULL venue_id (generic / no-venue rating) is its own slot via COALESCE.
-- Only constrains rows where beer_id IS NOT NULL; name-only ratings still
-- rely on the application-level find_existing_user_rating RPC.

-- 0) Ensure the duplicate-detection RPC is in the migration chain.
--    Previously lived only in beerbook/docs/migration-community-venue-rating.sql.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.find_existing_user_rating(
  p_user_id TEXT,
  p_beer_id TEXT,
  p_beer_name TEXT,
  p_venue_id TEXT DEFAULT NULL
) RETURNS TABLE(
  id TEXT,
  beer_name TEXT,
  rating INTEGER,
  venue_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT r.id, r.beer_name, r.rating, r.venue_id, r.created_at
  FROM ratings r
  WHERE r.user_id = p_user_id
    AND (
      (p_beer_id IS NOT NULL AND r.beer_id = p_beer_id)
      OR (LOWER(TRIM(r.beer_name)) = LOWER(TRIM(p_beer_name)))
      OR (similarity(r.beer_name, p_beer_name) > 0.6)
    )
    AND (
      (p_venue_id IS NULL AND r.venue_id IS NULL)
      OR (p_venue_id IS NOT NULL AND r.venue_id = p_venue_id)
    )
  ORDER BY
    CASE
      WHEN p_beer_id IS NOT NULL AND r.beer_id = p_beer_id THEN 0
      WHEN LOWER(TRIM(r.beer_name)) = LOWER(TRIM(p_beer_name)) THEN 1
      ELSE 2
    END,
    r.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_existing_user_rating(TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- 1) Deduplicate: keep the newest rating per (user, beer, venue) bucket.
DELETE FROM ratings
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, beer_id, COALESCE(venue_id, '')
             ORDER BY created_at DESC
           ) AS rn
    FROM ratings
    WHERE beer_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- 2) Partial unique index — one generic + N venue-tagged ratings allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_one_per_user_beer_venue
  ON ratings (user_id, beer_id, COALESCE(venue_id, ''))
  WHERE beer_id IS NOT NULL;
