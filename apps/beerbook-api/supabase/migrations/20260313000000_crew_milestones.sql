-- Phase 2 (Backend Weekly Challenges plan): Crew Milestones
-- Table and idempotent emission for crew_total_ratings, first_venue_visit, member_streak, leaderboard_rank.

-- Table: crew_milestones
CREATE TABLE IF NOT EXISTS public.crew_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NULL,
  data jsonb NULL,
  message text NULL,
  CONSTRAINT crew_milestones_type_check CHECK (type IN (
    'crew_total_ratings', 'first_venue_visit', 'member_streak', 'leaderboard_rank'
  ))
);

CREATE INDEX IF NOT EXISTS idx_crew_milestones_crew_occurred
  ON public.crew_milestones (crew_id, occurred_at DESC);

-- Idempotency: one milestone per (crew, threshold) for crew_total_ratings
CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_milestones_crew_total_ratings
  ON public.crew_milestones (crew_id, ((data->>'threshold')))
  WHERE type = 'crew_total_ratings';

-- Idempotency: one first_venue_visit per (crew, user, venue)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_milestones_first_venue_visit
  ON public.crew_milestones (crew_id, user_id, ((data->>'venue_id')))
  WHERE type = 'first_venue_visit' AND user_id IS NOT NULL;

-- Idempotency: one member_streak per (crew, user, streak_weeks)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_milestones_member_streak
  ON public.crew_milestones (crew_id, user_id, ((data->>'streak_weeks')))
  WHERE type = 'member_streak' AND user_id IS NOT NULL;

-- Idempotency: one leaderboard_rank per (crew, user, leaderboard_type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_milestones_leaderboard_rank
  ON public.crew_milestones (crew_id, user_id, ((data->>'leaderboard_type')))
  WHERE type = 'leaderboard_rank' AND user_id IS NOT NULL;

COMMENT ON TABLE public.crew_milestones IS
  'Crew milestone events for timeline (crew total ratings, first venue visit, member streak, leaderboard rank). Append-only; idempotent per unique indexes.';

-- RPC: return crew ids and total rating counts for crews that contain p_user_id (for milestone emission)
CREATE OR REPLACE FUNCTION public.crew_rating_counts_for_user(p_user_id uuid)
RETURNS TABLE(crew_id uuid, total_ratings bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT cm.crew_id, count(r.id) AS total_ratings
  FROM crew_members cm
  JOIN ratings r ON r.user_id = cm.user_id
  WHERE cm.crew_id IN (SELECT c.crew_id FROM crew_members c WHERE c.user_id = p_user_id)
  GROUP BY cm.crew_id;
$$;

GRANT EXECUTE ON FUNCTION public.crew_rating_counts_for_user(uuid) TO service_role;

COMMENT ON FUNCTION public.crew_rating_counts_for_user IS
  'Returns (crew_id, total_ratings) for every crew the user belongs to. Used when emitting crew_total_ratings milestones.';

-- RLS: allow service_role full access; no anon/authenticated direct access (API uses service_role)
ALTER TABLE public.crew_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY crew_milestones_service_role ON public.crew_milestones
  FOR ALL TO service_role USING (true) WITH CHECK (true);
