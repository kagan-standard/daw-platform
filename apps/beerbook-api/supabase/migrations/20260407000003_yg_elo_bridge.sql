-- YG-ELO Bridge: ratings feed ELO directly (capped at 1500).
-- Head-to-head is the only path above 1500 (Legend territory).
-- Starting ELO for new beers changes from 1500 to 0.

-- 1. Change default starting ELO from 1500 to 0
-- NOTE: If table is owned by supabase_admin, run as superuser:
--   psql -h 127.0.0.1 -U supabase_admin -d postgres -c "ALTER TABLE ..."
ALTER TABLE public.beer_elo_ratings ALTER COLUMN global_elo SET DEFAULT 0;

-- 2. Reset beers that have never had a head-to-head comparison to 0.
--    Leave beers with comparison_count > 0 untouched.
UPDATE public.beer_elo_ratings
SET global_elo = 0
WHERE comparison_count = 0;

-- 3. compute_yg_elo: Bayesian-weighted YG average → ELO score (0–1500 range)
--    YG scale: -1 (reject, excluded), 1–10 in 0.5 steps.
--    Neutral prior: 5.5 (midpoint of 1–10).
--    Confidence: 10 ratings before YG fully dominates.
CREATE OR REPLACE FUNCTION public.compute_yg_elo(p_beer_id text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_avg_yg numeric;
  v_rating_count integer;
  v_global_avg numeric := 5.5;   -- midpoint of 1–10 YG scale
  v_confidence integer := 10;    -- minimum ratings before YG fully dominates
  v_weighted_avg numeric;
  v_yg_elo integer;
BEGIN
  -- Exclude yg_value = -1 ("wouldn't drink again") and NULLs
  SELECT AVG(r.yg_value), COUNT(*)
  INTO v_avg_yg, v_rating_count
  FROM public.ratings r
  WHERE r.beer_id = p_beer_id
    AND r.yg_value IS NOT NULL
    AND r.yg_value > 0;

  IF v_rating_count = 0 THEN
    RETURN 0;
  END IF;

  -- Bayesian weighted average pulled toward global mean
  v_weighted_avg := (
    (v_avg_yg * v_rating_count) + (v_global_avg * v_confidence)
  ) / (v_rating_count + v_confidence);

  -- Scale: avg of 1 → ~0 ELO, avg of 10 → ~1500 ELO
  -- (weighted_avg - 1) / (10 - 1) * 1500, clamped 0–1500
  v_yg_elo := GREATEST(0, LEAST(1500,
    ROUND(((v_weighted_avg - 1.0) / 9.0) * 1500)
  ));

  RETURN v_yg_elo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_yg_elo(text) TO service_role;

COMMENT ON FUNCTION public.compute_yg_elo IS
  'Computes ELO score (0–1500) from Bayesian-weighted YG average for a beer. Excludes yg_value = -1.';

-- 4. update_beer_elo_from_yg: recalculates YG-driven ELO, respects H2H Legend territory
CREATE OR REPLACE FUNCTION public.update_beer_elo_from_yg(p_beer_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_yg_elo integer;
  v_current_elo integer;
  v_new_elo integer;
  v_old_tier text;
  v_new_tier text;
BEGIN
  SELECT global_elo INTO v_current_elo
  FROM public.beer_elo_ratings
  WHERE beer_id = p_beer_id;

  -- If no ELO row exists yet, create one
  IF NOT FOUND THEN
    INSERT INTO public.beer_elo_ratings (beer_id, global_elo, comparison_count)
    VALUES (p_beer_id, 0, 0);
    v_current_elo := 0;
  END IF;

  v_yg_elo := public.compute_yg_elo(p_beer_id);

  -- Only apply YG component if beer has not exceeded 1500 via H2H.
  -- If current ELO > 1500 (earned via H2H), YG cannot pull it down.
  IF v_current_elo > 1500 THEN
    RETURN;
  END IF;

  v_new_elo := v_yg_elo;

  -- Get previous tier from history (if any)
  SELECT tier INTO v_old_tier
  FROM public.beer_elo_history
  WHERE beer_id = p_beer_id
  ORDER BY recorded_at DESC
  LIMIT 1;

  UPDATE public.beer_elo_ratings
  SET global_elo = v_new_elo, updated_at = now()
  WHERE beer_id = p_beer_id;

  -- Compute new tier
  v_new_tier := CASE
    WHEN v_new_elo >= 1600 THEN 'Legend'
    WHEN v_new_elo >= 1400 THEN 'Craft Classic'
    WHEN v_new_elo >= 1200 THEN 'Regional Gem'
    WHEN v_new_elo >= 1000 THEN 'Local Pick'
    ELSE 'Unranked'
  END;

  -- Insert history row on tier change
  IF v_old_tier IS DISTINCT FROM v_new_tier THEN
    INSERT INTO public.beer_elo_history (beer_id, elo_score, tier, recorded_at)
    VALUES (p_beer_id, v_new_elo, v_new_tier, now());
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_beer_elo_from_yg(text) TO service_role;

COMMENT ON FUNCTION public.update_beer_elo_from_yg IS
  'Recalculates YG-driven ELO for a beer. Respects H2H scores above 1500.';

-- 5. Trigger: update ELO on every rating INSERT or UPDATE
CREATE OR REPLACE FUNCTION public.trigger_update_elo_on_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.beer_id IS NOT NULL THEN
    PERFORM public.update_beer_elo_from_yg(NEW.beer_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS elo_update_on_rating ON public.ratings;
CREATE TRIGGER elo_update_on_rating
  AFTER INSERT OR UPDATE ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_elo_on_rating();

-- 6. Backfill: recalculate YG-driven ELO for all beers with ratings
DO $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT beer_id
    FROM public.ratings
    WHERE beer_id IS NOT NULL
      AND yg_value IS NOT NULL
      AND yg_value > 0
  LOOP
    PERFORM public.update_beer_elo_from_yg(r.beer_id);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'YG-ELO backfill complete: % beers updated', v_count;
END $$;
