-- Head-to-head comparison (Phase 1): prompts and results. No Elo yet.
-- Prompts: one row per "which would you rather drink again?" offer after a rating.
-- Results: one row per completed comparison (complete endpoint); skip does not insert a result.

-- Prompts: created when we decide to offer head-to-head after POST /api/ratings (authenticated user only).
CREATE TABLE IF NOT EXISTS public.head_to_head_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  current_rating_id text NOT NULL REFERENCES public.ratings(id) ON DELETE CASCADE,
  challenger_rating_id text NOT NULL REFERENCES public.ratings(id) ON DELETE CASCADE,
  reward_tabs integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_head_to_head_prompts_user_id ON public.head_to_head_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_head_to_head_prompts_status ON public.head_to_head_prompts(status);
CREATE INDEX IF NOT EXISTS idx_head_to_head_prompts_created_at ON public.head_to_head_prompts(created_at DESC);

COMMENT ON TABLE public.head_to_head_prompts IS 'One row per head-to-head prompt offered after a rating. complete/skip endpoints update status.';

-- Results: written when user completes a comparison (winner/loser from the two ratings).
CREATE TABLE IF NOT EXISTS public.head_to_head_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  winner_beer_id text,
  loser_beer_id text,
  winner_rating_id text NOT NULL,
  loser_rating_id text NOT NULL,
  comparison_type text NOT NULL DEFAULT 'post_rating',
  prompt_id uuid NOT NULL REFERENCES public.head_to_head_prompts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_head_to_head_results_user_id ON public.head_to_head_results(user_id);
CREATE INDEX IF NOT EXISTS idx_head_to_head_results_prompt_id ON public.head_to_head_results(prompt_id);

COMMENT ON TABLE public.head_to_head_results IS 'One row per completed head-to-head comparison. Phase 3 Elo will consume this.';

-- RLS: users can only read/update their own prompts (BFF uses service_role; this protects direct PostgREST if ever exposed).
ALTER TABLE public.head_to_head_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.head_to_head_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY head_to_head_prompts_select_own ON public.head_to_head_prompts
  FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY head_to_head_prompts_update_own ON public.head_to_head_prompts
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY head_to_head_results_select_own ON public.head_to_head_results
  FOR SELECT USING (auth.uid()::text = user_id);

-- Service role can do everything via BFF (bypasses RLS when using service_role key).
GRANT ALL ON public.head_to_head_prompts TO service_role;
GRANT ALL ON public.head_to_head_results TO service_role;
