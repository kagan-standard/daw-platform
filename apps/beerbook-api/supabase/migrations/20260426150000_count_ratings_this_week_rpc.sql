-- Live RPC for ratings_this_week, replacing the stale stored counter.
-- Mirrors the pattern of count_distinct_venues and count_cheers_received.
CREATE OR REPLACE FUNCTION public.count_ratings_this_week(p_user_id text, p_week_start timestamptz)
  RETURNS integer
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::int
  FROM ratings
  WHERE user_id = p_user_id
    AND created_at >= p_week_start;
$$;
