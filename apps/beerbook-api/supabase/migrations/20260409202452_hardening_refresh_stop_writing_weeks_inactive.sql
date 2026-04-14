BEGIN;

-- `weeks_inactive` is owned by `eval_user_weekly_tabs` as an accumulating
-- counter of consecutive weeks below the maintenance threshold. It exists
-- solely to drive the demotion path of the weekly eval.
--
-- The prior version of this function unconditionally wrote `weeks_inactive = 0`
-- on every rating, stomping the eval's counter and rendering the demotion path
-- dead code (discovered during Day 4 V4.2 testing). Reader audit confirmed no
-- other function or trigger reads `weeks_inactive`, so removing the write is
-- safe.
--
-- After this migration, `eval_user_weekly_tabs` is the sole writer of
-- `weeks_inactive`. The rating flow no longer touches the field.

CREATE OR REPLACE FUNCTION public.refresh_rating_award_profile_cache(p_user_id text, p_tabs_delta integer DEFAULT 0)
 RETURNS TABLE(user_id text, ratings_this_week integer, reviews_this_week integer, contributions_this_week integer, current_streak_weeks integer, longest_streak_weeks integer, lifetime_tabs_earned integer, week_start timestamp with time zone, last_active_week timestamp with time zone, weeks_inactive integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_week_start_utc timestamptz;
  v_current_tier   user_tier;
  v_req_ratings    int;
  v_req_reviews    int;
  v_req_contribs   int;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  v_week_start_utc := (date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');

  -- Ensure profile row exists
  INSERT INTO public.user_tabs_profile (user_id, week_start)
  VALUES (p_user_id, v_week_start_utc)
  ON CONFLICT (user_id) DO NOTHING;

  -- Look up user's current tier
  SELECT utp.current_tier INTO v_current_tier
  FROM public.user_tabs_profile utp
  WHERE utp.user_id = p_user_id;

  -- Look up the NEXT tier's activity bar (or own bar if already max tier)
  SELECT
    COALESCE(nxt.required_ratings_per_week,  cur.required_ratings_per_week,  0),
    COALESCE(nxt.required_reviews_per_week,  cur.required_reviews_per_week,  0),
    COALESCE(nxt.required_contributions_per_week, cur.required_contributions_per_week, 0)
  INTO v_req_ratings, v_req_reviews, v_req_contribs
  FROM public.tier_requirements cur
  LEFT JOIN public.tier_requirements nxt
    ON nxt.display_order = cur.display_order + 1
  WHERE cur.tier = v_current_tier;

  -- Fallback if tier not found (shouldn't happen)
  IF v_req_ratings IS NULL THEN
    v_req_ratings  := 0;
    v_req_reviews  := 0;
    v_req_contribs := 0;
  END IF;

  RETURN QUERY
  WITH params AS (
    SELECT
      p_user_id          AS uid,
      COALESCE(p_tabs_delta, 0)::int AS tabs_delta,
      v_week_start_utc   AS week_start_utc,
      v_req_ratings      AS req_ratings,
      v_req_reviews      AS req_reviews,
      v_req_contribs     AS req_contribs
  ),

  -- Generate 52 weeks of buckets
  rating_weeks AS (
    SELECT
      gs AS week_offset,
      (p.week_start_utc - (gs || ' week')::interval) AS ws,
      (p.week_start_utc - (gs || ' week')::interval + interval '1 week') AS we
    FROM params p
    CROSS JOIN generate_series(0, 51) AS gs
  ),

  -- Per-week activity counts
  week_activity AS (
    SELECT
      rw.week_offset,
      COALESCE(r_agg.cnt, 0)::int AS rating_count,
      COALESCE(r_agg.review_cnt, 0)::int AS review_count,
      COALESCE(bs_agg.contrib_cnt, 0)::int AS contribution_count
    FROM rating_weeks rw
    CROSS JOIN params p
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS cnt,
        COUNT(*) FILTER (WHERE length(trim(COALESCE(r.notes, ''))) >= 10)::int AS review_cnt
      FROM public.ratings r
      WHERE r.user_id = p.uid
        AND r.created_at >= rw.ws
        AND r.created_at < rw.we
    ) r_agg ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS contrib_cnt
      FROM public.beer_submissions bs
      WHERE bs.submitted_by = p.uid
        AND bs.status = 'approved'
        AND bs.reviewed_at >= rw.ws
        AND bs.reviewed_at < rw.we
    ) bs_agg ON true
  ),

  -- A week qualifies for the streak only if it meets the full next-tier bar
  qualified_weeks AS (
    SELECT
      wa.week_offset,
      (wa.rating_count >= p.req_ratings
        AND wa.review_count >= p.req_reviews
        AND wa.contribution_count >= p.req_contribs) AS qualifies
    FROM week_activity wa
    CROSS JOIN params p
  ),

  -- Find first non-qualifying week (starting from week 0)
  first_gap AS (
    SELECT COALESCE(
      (SELECT MIN(qw.week_offset) FROM qualified_weeks qw WHERE qw.qualifies = false),
      52
    )::int AS gap_offset
  ),

  streak_calc AS (
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM qualified_weeks qw WHERE qw.week_offset = 0 AND qw.qualifies = true)
          THEN (SELECT fg.gap_offset FROM first_gap fg)
        ELSE 0
      END::int AS current_streak_wks
  ),

  -- Current-week counters
  current_week_stats AS (
    SELECT
      wa.rating_count      AS ratings_this_wk,
      wa.review_count      AS reviews_this_wk,
      wa.contribution_count AS contributions_this_wk
    FROM week_activity wa
    WHERE wa.week_offset = 0
  ),

  updated_profile AS (
    UPDATE public.user_tabs_profile utp
    SET
      ratings_this_week       = cws.ratings_this_wk,
      reviews_this_week       = cws.reviews_this_wk,
      contributions_this_week = cws.contributions_this_wk,
      current_streak_weeks    = sc.current_streak_wks,
      longest_streak_weeks    = GREATEST(COALESCE(utp.longest_streak_weeks, 0), sc.current_streak_wks),
      last_active_week        = p.week_start_utc,
      week_start              = p.week_start_utc,
      updated_at              = now()
    FROM params p
    CROSS JOIN current_week_stats cws
    CROSS JOIN streak_calc sc
    WHERE utp.user_id = p.uid
    RETURNING
      utp.user_id,
      utp.ratings_this_week,
      utp.reviews_this_week,
      utp.contributions_this_week,
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
    up.reviews_this_week,
    up.contributions_this_week,
    up.current_streak_weeks,
    up.longest_streak_weeks,
    up.lifetime_tabs_earned,
    up.week_start,
    up.last_active_week,
    up.weeks_inactive
  FROM updated_profile up;
END;
$function$;

COMMIT;
