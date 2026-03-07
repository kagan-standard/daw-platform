-- Real-time user_tabs_profile cache refresh after rating submissions.
-- Uses ratings as streak source-of-truth, bounded to a 52-week lookback.

CREATE OR REPLACE FUNCTION public.refresh_rating_award_profile_cache(
  p_user_id text,
  p_tabs_delta int DEFAULT 0
)
RETURNS TABLE (
  user_id text,
  ratings_this_week int,
  current_streak_weeks int,
  longest_streak_weeks int,
  lifetime_tabs_earned int,
  week_start timestamptz,
  last_active_week timestamptz,
  weeks_inactive int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start_utc timestamptz;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  v_week_start_utc := (date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');

  INSERT INTO public.user_tabs_profile (user_id, week_start)
  VALUES (p_user_id, v_week_start_utc)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  WITH params AS (
    SELECT
      p_user_id AS user_id,
      COALESCE(p_tabs_delta, 0)::int AS tabs_delta,
      v_week_start_utc AS week_start_utc
  ),
  rating_weeks AS (
    SELECT
      gs AS week_offset,
      (p.week_start_utc - (gs || ' week')::interval) AS week_start,
      (p.week_start_utc - (gs || ' week')::interval + interval '1 week') AS week_end
    FROM params p
    CROSS JOIN generate_series(0, 51) AS gs
  ),
  week_activity AS (
    SELECT
      rw.week_offset,
      EXISTS (
        SELECT 1
        FROM public.ratings r
        JOIN params p ON true
        WHERE r.user_id = p.user_id
          AND r.created_at >= rw.week_start
          AND r.created_at < rw.week_end
      ) AS has_rating
    FROM rating_weeks rw
  ),
  current_week_counts AS (
    SELECT COUNT(*)::int AS ratings_this_week
    FROM public.ratings r
    JOIN params p ON true
    WHERE r.user_id = p.user_id
      AND r.created_at >= p.week_start_utc
  ),
  first_gap AS (
    SELECT COALESCE(
      (SELECT MIN(wa.week_offset) FROM week_activity wa WHERE wa.has_rating = false),
      52
    )::int AS gap_offset
  ),
  streak_calc AS (
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM week_activity wa WHERE wa.week_offset = 0 AND wa.has_rating = true)
          THEN (SELECT fg.gap_offset FROM first_gap fg)
        ELSE 0
      END::int AS current_streak_weeks
  ),
  updated_profile AS (
    UPDATE public.user_tabs_profile utp
    SET
      ratings_this_week = cwc.ratings_this_week,
      current_streak_weeks = sc.current_streak_weeks,
      longest_streak_weeks = GREATEST(COALESCE(utp.longest_streak_weeks, 0), sc.current_streak_weeks),
      last_active_week = p.week_start_utc,
      weeks_inactive = 0,
      week_start = p.week_start_utc,
      lifetime_tabs_earned = COALESCE(utp.lifetime_tabs_earned, 0) + CASE WHEN p.tabs_delta > 0 THEN p.tabs_delta ELSE 0 END,
      updated_at = now()
    FROM params p
    CROSS JOIN current_week_counts cwc
    CROSS JOIN streak_calc sc
    WHERE utp.user_id = p.user_id
    RETURNING
      utp.user_id,
      utp.ratings_this_week,
      utp.current_streak_weeks,
      utp.longest_streak_weeks,
      utp.lifetime_tabs_earned,
      utp.week_start,
      utp.last_active_week,
      utp.weeks_inactive
  )
  SELECT
    up.user_id,
    up.ratings_this_week,
    up.current_streak_weeks,
    up.longest_streak_weeks,
    up.lifetime_tabs_earned,
    up.week_start,
    up.last_active_week,
    up.weeks_inactive
  FROM updated_profile up;
END;
$$;
