-- Phase 2 (Backend Weekly Challenges plan): Weekly challenges definition + progress.
-- One active challenge per week (global); progress computed per crew from ratings.
-- Week boundary: ISO week Monday 00:00 UTC – Sunday 23:59.999 UTC (canonical).

-- Table: weekly_challenges (one row per week; same challenge for all crews)
CREATE TABLE IF NOT EXISTS public.weekly_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start timestamptz NOT NULL,
  week_end timestamptz NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  target_style text NULL,
  target_count int NOT NULL CHECK (target_count > 0),
  reward_label text NOT NULL,
  reward_badge_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_challenges_week_range CHECK (week_end > week_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_challenges_week
  ON public.weekly_challenges (week_start);

CREATE INDEX IF NOT EXISTS idx_weekly_challenges_week_end
  ON public.weekly_challenges (week_end);

COMMENT ON TABLE public.weekly_challenges IS
  'One challenge per week (UTC Monday–Sunday). Progress is computed per crew from ratings.';

-- RPC: get current week's challenge + progress for a crew.
-- Invariants (plan §3):
--   Week: Monday 00:00 UTC – Sunday 23:59.999 UTC (ISO week); one canonical rule.
--   Rating inclusion: created_at in [week_start, week_end]; crew members only; edited ratings count (created_at unchanged on update); deleted excluded; distinct beers by beer_id or (beer_name|brewery).
-- Numerator: count of distinct beers (beer_id if set, else beer_name||brewery) of target_style in that window.
-- Contributing: count of distinct user_id who submitted at least one such rating.
CREATE OR REPLACE FUNCTION public.get_crew_weekly_challenge(p_crew_id uuid, p_week_start timestamptz DEFAULT NULL)
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
  v_result jsonb;
BEGIN
  -- Canonical week: Monday 00:00 UTC to Sunday 23:59.999 UTC (ISO week)
  v_week_start := (date_trunc('week', (coalesce(p_week_start, now()) at time zone 'UTC')) at time zone 'UTC');
  v_week_end := v_week_start + interval '7 days' - interval '1 millisecond';

  SELECT w.id, w.title, w.description, w.target_style, w.target_count, w.reward_label, w.reward_badge_id, w.week_start, w.week_end
  INTO v_challenge
  FROM public.weekly_challenges w
  WHERE w.week_start = v_week_start
  LIMIT 1;

  IF v_challenge.id IS NULL THEN
    RETURN jsonb_build_object('challenge', null, 'progress', null);
  END IF;

  -- Current count: distinct beers (by beer_id or beer_name|brewery) of target style, rated by crew in week
  SELECT count(DISTINCT coalesce(r.beer_id::text, r.beer_name || '|' || coalesce(r.brewery, '')))
  INTO v_current_count
  FROM public.ratings r
  JOIN public.crew_members cm ON cm.user_id = r.user_id AND cm.crew_id = p_crew_id
  WHERE r.created_at >= v_week_start AND r.created_at <= v_week_end
    AND (v_challenge.target_style IS NULL OR (r.style IS NOT NULL AND trim(r.style) = trim(v_challenge.target_style)));

  -- Contributing: distinct members who submitted at least one rating that counts
  SELECT count(DISTINCT r.user_id)
  INTO v_contributing_count
  FROM public.ratings r
  JOIN public.crew_members cm ON cm.user_id = r.user_id AND cm.crew_id = p_crew_id
  WHERE r.created_at >= v_week_start AND r.created_at <= v_week_end
    AND (v_challenge.target_style IS NULL OR (r.style IS NOT NULL AND trim(r.style) = trim(v_challenge.target_style)));

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
      'week_end', v_week_end
    ),
    'progress', jsonb_build_object(
      'current_count', coalesce(v_current_count, 0)::int,
      'target_count', v_challenge.target_count,
      'contributing_member_count', coalesce(v_contributing_count, 0)::int
    )
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crew_weekly_challenge(uuid, timestamptz) TO service_role;

COMMENT ON FUNCTION public.get_crew_weekly_challenge IS
  'Returns current week challenge + progress for a crew. Week = Monday 00:00 UTC to Sunday 23:59.999 UTC.';

-- RLS: API uses service_role; no anon/authenticated direct access to weekly_challenges
ALTER TABLE public.weekly_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY weekly_challenges_service_role ON public.weekly_challenges
  FOR ALL TO service_role USING (true) WITH CHECK (true);
