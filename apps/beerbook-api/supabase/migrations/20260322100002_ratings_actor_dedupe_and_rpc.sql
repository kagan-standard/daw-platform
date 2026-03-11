-- Guest ratings (v1): actor-based dedupe (one rating per actor per beer/venue) and find_existing_actor_rating RPC.
-- Run third, after 20260322100001_ratings_user_id_nullable.

-- 1) Drop old user-only unique index
DROP INDEX IF EXISTS idx_ratings_one_per_user_beer_venue;

-- 2) Actor-based unique index: one rating per (actor, beer, venue). Actor = COALESCE(user_id, guest_id).
CREATE UNIQUE INDEX idx_ratings_one_per_actor_beer_venue
  ON ratings (COALESCE(user_id, guest_id), beer_id, COALESCE(venue_id, ''))
  WHERE beer_id IS NOT NULL;

-- 3) find_existing_actor_rating: same semantics as find_existing_user_rating but by user_id OR guest_id
CREATE OR REPLACE FUNCTION public.find_existing_actor_rating(
  p_actor_id TEXT,
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
  WHERE (r.user_id = p_actor_id OR r.guest_id = p_actor_id)
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

GRANT EXECUTE ON FUNCTION public.find_existing_actor_rating(TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.find_existing_actor_rating IS 'Find existing rating by actor (user_id or guest_id) + beer + venue. Used for user and guest dedupe.';
