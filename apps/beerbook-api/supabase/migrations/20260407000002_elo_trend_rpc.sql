-- RPC: get_beer_elo_trend — returns 30-day ELO delta for trend chips.
-- Used by catalog detail, browse, and rankings endpoints.

CREATE OR REPLACE FUNCTION public.get_beer_elo_trend(p_beer_id text)
RETURNS TABLE(
  current_elo integer,
  elo_30d_ago integer,
  delta integer,
  trend text,
  current_tier text,
  previous_tier text,
  tier_changed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_current_elo integer;
  v_elo_30d_ago integer;
  v_delta integer;
  v_trend text;
  v_current_tier text;
  v_previous_tier text;
  v_tier_changed boolean;
BEGIN
  -- Current ELO from live table
  SELECT ber.global_elo INTO v_current_elo
  FROM public.beer_elo_ratings ber
  WHERE ber.beer_id = p_beer_id;

  IF v_current_elo IS NULL THEN
    v_current_elo := 1500;
  END IF;

  -- Closest snapshot to 30 days ago (look in 28-32 day window, take earliest)
  SELECT h.elo_score INTO v_elo_30d_ago
  FROM public.beer_elo_history h
  WHERE h.beer_id = p_beer_id
    AND h.recorded_at >= now() - interval '32 days'
  ORDER BY h.recorded_at ASC
  LIMIT 1;

  IF v_elo_30d_ago IS NULL THEN
    v_trend := 'new';
    v_delta := NULL;
    v_current_tier := (
      SELECT CASE
        WHEN v_current_elo >= 1600 THEN 'Legend'
        WHEN v_current_elo >= 1400 THEN 'Craft Classic'
        WHEN v_current_elo >= 1200 THEN 'Regional Gem'
        WHEN v_current_elo >= 1000 THEN 'Local Pick'
        ELSE 'Unranked'
      END
    );
    v_previous_tier := NULL;
    v_tier_changed := false;
  ELSE
    v_delta := v_current_elo - v_elo_30d_ago;
    IF abs(v_delta) <= 10 THEN
      v_trend := 'flat';
    ELSIF v_delta > 10 THEN
      v_trend := 'up';
    ELSE
      v_trend := 'down';
    END IF;

    v_current_tier := (
      SELECT CASE
        WHEN v_current_elo >= 1600 THEN 'Legend'
        WHEN v_current_elo >= 1400 THEN 'Craft Classic'
        WHEN v_current_elo >= 1200 THEN 'Regional Gem'
        WHEN v_current_elo >= 1000 THEN 'Local Pick'
        ELSE 'Unranked'
      END
    );
    v_previous_tier := (
      SELECT CASE
        WHEN v_elo_30d_ago >= 1600 THEN 'Legend'
        WHEN v_elo_30d_ago >= 1400 THEN 'Craft Classic'
        WHEN v_elo_30d_ago >= 1200 THEN 'Regional Gem'
        WHEN v_elo_30d_ago >= 1000 THEN 'Local Pick'
        ELSE 'Unranked'
      END
    );
    v_tier_changed := v_current_tier <> v_previous_tier;
  END IF;

  RETURN QUERY SELECT v_current_elo, v_elo_30d_ago, v_delta, v_trend,
                      v_current_tier, v_previous_tier, v_tier_changed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_beer_elo_trend(text) TO service_role;

COMMENT ON FUNCTION public.get_beer_elo_trend IS
  'Returns 30-day ELO delta, trend direction, and tier change info for a single beer.';
