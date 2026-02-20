-- ============================================
-- Community + Venue Multi-Rating Migration
-- Add duplicate-detection RPC for beer+venue update behavior
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION find_existing_user_rating(
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

GRANT EXECUTE ON FUNCTION find_existing_user_rating(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
