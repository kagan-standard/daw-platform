-- Phase 3: Elo engine. One row per beer; global_elo updated on each head-to-head comparison.
-- Initial 1500; K-factor by maturity (handled in app). No RLS (service_role only).

CREATE TABLE IF NOT EXISTS public.beer_elo_ratings (
  beer_id text PRIMARY KEY REFERENCES public.beers(id) ON DELETE CASCADE,
  global_elo integer NOT NULL DEFAULT 1500 CHECK (global_elo >= 0 AND global_elo <= 10000),
  comparison_count integer NOT NULL DEFAULT 0 CHECK (comparison_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beer_elo_ratings_global_elo ON public.beer_elo_ratings(global_elo DESC);
CREATE INDEX IF NOT EXISTS idx_beer_elo_ratings_updated_at ON public.beer_elo_ratings(updated_at DESC);

COMMENT ON TABLE public.beer_elo_ratings IS 'Power Score / Elo per beer; updated on each head-to-head comparison (Phase 3).';

-- Optional: event log for audit and debugging (result_id, beer_id, old_elo, new_elo, k_used).
CREATE TABLE IF NOT EXISTS public.beer_elo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES public.head_to_head_results(id) ON DELETE CASCADE,
  beer_id text NOT NULL REFERENCES public.beers(id) ON DELETE CASCADE,
  old_elo integer NOT NULL,
  new_elo integer NOT NULL,
  k_used integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beer_elo_events_result_id ON public.beer_elo_events(result_id);
CREATE INDEX IF NOT EXISTS idx_beer_elo_events_beer_id ON public.beer_elo_events(beer_id);

COMMENT ON TABLE public.beer_elo_events IS 'Optional audit log of Elo updates per comparison (Phase 3).';

GRANT ALL ON public.beer_elo_ratings TO service_role;
GRANT ALL ON public.beer_elo_events TO service_role;
