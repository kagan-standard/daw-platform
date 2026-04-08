-- Beer backing (staking) system: users stake tabs on beers they believe will rise in ELO.
-- beer_elo_history for trend chips (30-day delta).

-- 1. beer_backs
CREATE TABLE IF NOT EXISTS public.beer_backs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  beer_id text NOT NULL REFERENCES public.beers(id),
  tabs_staked integer NOT NULL CHECK (tabs_staked BETWEEN 1 AND 50),
  elo_at_stake integer NOT NULL,
  tier_at_stake text NOT NULL,
  staked_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz NOT NULL,
  cashed_out_at timestamptz,
  tabs_returned integer,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cashed_out', 'early_exit'))
);

-- One active back per user per beer (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_beer_backs_active_unique
  ON public.beer_backs (user_id, beer_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_beer_backs_user_active
  ON public.beer_backs (user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_beer_backs_beer
  ON public.beer_backs (beer_id);

ALTER TABLE public.beer_backs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS beer_backs_service_role ON public.beer_backs;
CREATE POLICY beer_backs_service_role ON public.beer_backs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. beer_elo_history (daily snapshots for trend chips)
CREATE TABLE IF NOT EXISTS public.beer_elo_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beer_id text NOT NULL REFERENCES public.beers(id),
  elo_score integer NOT NULL,
  tier text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beer_elo_history_beer_date
  ON public.beer_elo_history (beer_id, recorded_at DESC);

ALTER TABLE public.beer_elo_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS beer_elo_history_service_role ON public.beer_elo_history;
CREATE POLICY beer_elo_history_service_role ON public.beer_elo_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);
