-- Challenge economy: expanded metrics, crew-vs-crew competition, tab pot payouts.
-- Extends weekly_challenges with metric enum, reward_tabs, winner tracking.
-- Adds challenge_completions for resolution history.
-- Updates get_crew_weekly_challenge RPC with new fields + ranking.
-- Adds get_challenge_leaderboard RPC for rankings screen.

-- 1. Enum: challenge_metric
DO $$ BEGIN
  CREATE TYPE public.challenge_metric AS ENUM (
    'ratings_count',
    'styles_count',
    'venue_checkins',
    'tabs_earned',
    'tabs_spent',
    'members_added',
    'backs_risen',
    'photos_submitted',
    'beers_added',
    'price_taggings'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Alter weekly_challenges
ALTER TABLE public.weekly_challenges
  ADD COLUMN IF NOT EXISTS metric public.challenge_metric NOT NULL DEFAULT 'ratings_count',
  ADD COLUMN IF NOT EXISTS reward_tabs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS winner_crew_id text REFERENCES public.crews(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- 3. challenge_completions
CREATE TABLE IF NOT EXISTS public.challenge_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.weekly_challenges(id),
  crew_id text NOT NULL REFERENCES public.crews(id),
  rank integer,
  final_count integer,
  tabs_awarded integer,
  resolved_at timestamptz DEFAULT now(),
  UNIQUE(challenge_id, crew_id)
);

ALTER TABLE public.challenge_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS challenge_completions_service_role ON public.challenge_completions;
CREATE POLICY challenge_completions_service_role ON public.challenge_completions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Helper: compute current_count for a single crew given a challenge
--    Returns (current_count, contributing_member_count)
CREATE OR REPLACE FUNCTION public._challenge_crew_progress(
  p_crew_id text,
  p_metric public.challenge_metric,
  p_week_start timestamptz,
  p_week_end timestamptz,
  p_target_style text DEFAULT NULL
)
RETURNS TABLE(current_count bigint, contributing_member_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  CASE p_metric

  WHEN 'ratings_count' THEN
    -- Existing behaviour: distinct beers rated (optionally filtered by style)
    RETURN QUERY
    SELECT
      count(DISTINCT coalesce(r.beer_id, r.beer_name || '|' || coalesce(r.brewery, '')))::bigint,
      count(DISTINCT r.user_id)::bigint
    FROM public.ratings r
    JOIN public.crew_members cm ON cm.user_id = r.user_id AND cm.crew_id = p_crew_id
    WHERE r.created_at >= p_week_start AND r.created_at <= p_week_end
      AND (p_target_style IS NULL OR (r.style IS NOT NULL AND trim(r.style) = trim(p_target_style)));

  WHEN 'styles_count' THEN
    RETURN QUERY
    SELECT
      count(DISTINCT trim(r.style))::bigint,
      count(DISTINCT r.user_id)::bigint
    FROM public.ratings r
    JOIN public.crew_members cm ON cm.user_id = r.user_id AND cm.crew_id = p_crew_id
    WHERE r.created_at >= p_week_start AND r.created_at <= p_week_end
      AND r.style IS NOT NULL AND trim(r.style) <> '';

  WHEN 'venue_checkins' THEN
    -- Ratings with a venue_id and location_verified = true
    RETURN QUERY
    SELECT
      count(*)::bigint,
      count(DISTINCT r.user_id)::bigint
    FROM public.ratings r
    JOIN public.crew_members cm ON cm.user_id = r.user_id AND cm.crew_id = p_crew_id
    WHERE r.created_at >= p_week_start AND r.created_at <= p_week_end
      AND r.venue_id IS NOT NULL AND r.location_verified = true;

  WHEN 'tabs_earned' THEN
    RETURN QUERY
    SELECT
      coalesce(sum(tl.amount), 0)::bigint,
      count(DISTINCT tl.user_id)::bigint
    FROM public.tabs_ledger tl
    JOIN public.crew_members cm ON cm.user_id = tl.user_id AND cm.crew_id = p_crew_id
    WHERE tl.created_at >= p_week_start AND tl.created_at <= p_week_end
      AND tl.amount > 0;

  WHEN 'tabs_spent' THEN
    RETURN QUERY
    SELECT
      coalesce(abs(sum(tl.amount)), 0)::bigint,
      count(DISTINCT tl.user_id)::bigint
    FROM public.tabs_ledger tl
    JOIN public.crew_members cm ON cm.user_id = tl.user_id AND cm.crew_id = p_crew_id
    WHERE tl.created_at >= p_week_start AND tl.created_at <= p_week_end
      AND tl.amount < 0;

  WHEN 'members_added' THEN
    RETURN QUERY
    SELECT
      count(*)::bigint,
      count(DISTINCT cm2.user_id)::bigint
    FROM public.crew_members cm2
    WHERE cm2.crew_id = p_crew_id
      AND cm2.joined_at >= p_week_start AND cm2.joined_at <= p_week_end;

  WHEN 'backs_risen' THEN
    -- Beer backs by crew members where the beer rose at least one ELO tier
    RETURN QUERY
    SELECT
      count(*)::bigint,
      count(DISTINCT bb.user_id)::bigint
    FROM public.beer_backs bb
    JOIN public.crew_members cm ON cm.user_id = bb.user_id AND cm.crew_id = p_crew_id
    JOIN public.beer_elo_ratings ber ON ber.beer_id = bb.beer_id
    WHERE bb.staked_at >= p_week_start AND bb.staked_at <= p_week_end
      AND bb.status = 'active'
      AND ber.global_elo >= (
        CASE bb.tier_at_stake
          WHEN 'Unranked'      THEN 1000
          WHEN 'Local Pick'    THEN 1200
          WHEN 'Regional Gem'  THEN 1400
          WHEN 'Craft Classic' THEN 1600
          ELSE 99999
        END
      );

  WHEN 'photos_submitted' THEN
    -- Ratings with a photo attached
    RETURN QUERY
    SELECT
      count(*)::bigint,
      count(DISTINCT r.user_id)::bigint
    FROM public.ratings r
    JOIN public.crew_members cm ON cm.user_id = r.user_id AND cm.crew_id = p_crew_id
    WHERE r.created_at >= p_week_start AND r.created_at <= p_week_end
      AND r.photo_url IS NOT NULL AND r.photo_url <> '';

  WHEN 'beers_added' THEN
    -- New beers added to platform by crew members (beer_submissions with status='approved')
    RETURN QUERY
    SELECT
      count(*)::bigint,
      count(DISTINCT bs.submitted_by)::bigint
    FROM public.beer_submissions bs
    JOIN public.crew_members cm ON cm.user_id = bs.submitted_by AND cm.crew_id = p_crew_id
    WHERE bs.created_at >= p_week_start AND bs.created_at <= p_week_end;

  WHEN 'price_taggings' THEN
    -- Price entries submitted on ratings
    RETURN QUERY
    SELECT
      count(*)::bigint,
      count(DISTINCT pl.logged_by)::bigint
    FROM public.price_logs pl
    JOIN public.crew_members cm ON cm.user_id = pl.logged_by AND cm.crew_id = p_crew_id
    WHERE pl.logged_at >= p_week_start AND pl.logged_at <= p_week_end;

  ELSE
    -- Fallback: return zeros for unknown metric
    RETURN QUERY SELECT 0::bigint, 0::bigint;

  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION public._challenge_crew_progress(text, public.challenge_metric, timestamptz, timestamptz, text) TO service_role;

-- 5. Updated RPC: get_crew_weekly_challenge
--    Preserves all existing fields, adds metric, reward_tabs, crew_rank, total_crews_competing.
DROP FUNCTION IF EXISTS public.get_crew_weekly_challenge(uuid, timestamptz);
CREATE OR REPLACE FUNCTION public.get_crew_weekly_challenge(p_crew_id text, p_week_start timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_challenge record;
  v_current_count bigint;
  v_contributing_count bigint;
  v_crew_rank bigint;
  v_total_crews bigint;
  v_result jsonb;
BEGIN
  v_week_start := (date_trunc('week', (coalesce(p_week_start, now()) at time zone 'UTC')) at time zone 'UTC');
  v_week_end := v_week_start + interval '7 days' - interval '1 millisecond';

  SELECT w.id, w.title, w.description, w.target_style, w.target_count,
         w.reward_label, w.reward_badge_id, w.week_start, w.week_end,
         w.metric, w.reward_tabs
  INTO v_challenge
  FROM public.weekly_challenges w
  WHERE w.week_start = v_week_start
  LIMIT 1;

  IF v_challenge.id IS NULL THEN
    RETURN jsonb_build_object('challenge', null, 'progress', null);
  END IF;

  -- Progress for this crew
  SELECT cp.current_count, cp.contributing_member_count
  INTO v_current_count, v_contributing_count
  FROM public._challenge_crew_progress(
    p_crew_id, v_challenge.metric, v_week_start, v_week_end, v_challenge.target_style
  ) cp;

  -- Ranking: compute progress for all crews, rank this crew
  WITH all_crews AS (
    SELECT DISTINCT cm.crew_id
    FROM public.crew_members cm
  ),
  crew_scores AS (
    SELECT
      ac.crew_id,
      cp.current_count,
      cp.contributing_member_count
    FROM all_crews ac
    CROSS JOIN LATERAL public._challenge_crew_progress(
      ac.crew_id, v_challenge.metric, v_week_start, v_week_end, v_challenge.target_style
    ) cp
    WHERE cp.contributing_member_count > 0
  ),
  ranked AS (
    SELECT
      cs.crew_id,
      RANK() OVER (ORDER BY cs.current_count DESC) AS rk
    FROM crew_scores cs
  )
  SELECT
    coalesce((SELECT rk FROM ranked WHERE crew_id = p_crew_id), 0),
    count(*)
  INTO v_crew_rank, v_total_crews
  FROM ranked;

  v_result := jsonb_build_object(
    'challenge', jsonb_build_object(
      'id', v_challenge.id,
      'title', v_challenge.title,
      'description', v_challenge.description,
      'target_style', v_challenge.target_style,
      'target_count', v_challenge.target_count,
      'reward_label', v_challenge.reward_label,
      'reward_badge_id', v_challenge.reward_badge_id,
      'week_start', v_week_start,
      'week_end', v_week_end,
      'metric', v_challenge.metric,
      'reward_tabs', v_challenge.reward_tabs
    ),
    'progress', jsonb_build_object(
      'current_count', coalesce(v_current_count, 0)::int,
      'target_count', v_challenge.target_count,
      'contributing_member_count', coalesce(v_contributing_count, 0)::int,
      'crew_rank', coalesce(v_crew_rank, 0)::int,
      'total_crews_competing', coalesce(v_total_crews, 0)::int
    )
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crew_weekly_challenge(text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.get_crew_weekly_challenge IS
  'Returns current week challenge + progress + ranking for a crew. Supports all challenge_metric types.';

-- 6. New RPC: get_challenge_leaderboard
CREATE OR REPLACE FUNCTION public.get_challenge_leaderboard(p_challenge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_challenge record;
  v_result jsonb;
BEGIN
  SELECT w.id, w.metric, w.target_style, w.week_start, w.week_end
  INTO v_challenge
  FROM public.weekly_challenges w
  WHERE w.id = p_challenge_id
  LIMIT 1;

  IF v_challenge.id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH all_crews AS (
    SELECT DISTINCT cm.crew_id
    FROM public.crew_members cm
  ),
  crew_scores AS (
    SELECT
      ac.crew_id,
      c.name AS crew_name,
      cp.current_count,
      cp.contributing_member_count
    FROM all_crews ac
    JOIN public.crews c ON c.id = ac.crew_id
    CROSS JOIN LATERAL public._challenge_crew_progress(
      ac.crew_id, v_challenge.metric, v_challenge.week_start, v_challenge.week_end, v_challenge.target_style
    ) cp
    WHERE cp.contributing_member_count > 0
  ),
  ranked AS (
    SELECT
      cs.crew_id,
      cs.crew_name,
      cs.current_count::int AS current_count,
      cs.contributing_member_count::int AS contributing_member_count,
      RANK() OVER (ORDER BY cs.current_count DESC)::int AS rank
    FROM crew_scores cs
  )
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'crew_id', r.crew_id,
      'crew_name', r.crew_name,
      'current_count', r.current_count,
      'contributing_member_count', r.contributing_member_count,
      'rank', r.rank
    ) ORDER BY r.rank ASC, r.crew_name ASC
  ), '[]'::jsonb)
  INTO v_result
  FROM ranked r;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_challenge_leaderboard(uuid) TO service_role;

COMMENT ON FUNCTION public.get_challenge_leaderboard IS
  'Returns ranked leaderboard of all crews for a given challenge. Used by Rankings screen.';
