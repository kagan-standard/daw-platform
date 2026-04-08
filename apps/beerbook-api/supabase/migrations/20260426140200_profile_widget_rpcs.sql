-- Lightweight RPCs for the profile widget card.

-- Count distinct venues a user has rated at.
CREATE OR REPLACE FUNCTION public.count_distinct_venues(p_user_id text)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT venue_id)::int
  FROM ratings
  WHERE user_id = p_user_id
    AND venue_id IS NOT NULL;
$$;

-- Count total cheers (reactions) received on a user's ratings.
CREATE OR REPLACE FUNCTION public.count_cheers_received(p_user_id text)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM reactions rx
  JOIN ratings r ON r.id = rx.rating_id
  WHERE r.user_id = p_user_id
    AND rx.reaction_type = 'cheers';
$$;
