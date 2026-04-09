-- calculate_backing_payout: single source of truth for backing payout math.
-- Called by GET /api/users/me/backs and GET /api/catalog/beer/:id user_back enrichment.

CREATE OR REPLACE FUNCTION calculate_backing_payout(
  p_tabs_staked integer,
  p_tier_at_stake text,
  p_current_tier text
)
RETURNS TABLE(
  tiers_climbed integer,
  multiplier numeric,
  estimated_payout integer,
  payout_available boolean
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_stake_idx integer;
  v_current_idx integer;
  v_tiers_climbed integer;
  v_multiplier numeric;
BEGIN
  -- Tier ordering: 0=Unranked, 1=Local Pick, 2=Regional Gem, 3=Craft Classic, 4=Legend
  v_stake_idx := CASE p_tier_at_stake
    WHEN 'Unranked'      THEN 0
    WHEN 'Local Pick'    THEN 1
    WHEN 'Regional Gem'  THEN 2
    WHEN 'Craft Classic' THEN 3
    WHEN 'Legend'        THEN 4
    ELSE -1
  END;

  v_current_idx := CASE p_current_tier
    WHEN 'Unranked'      THEN 0
    WHEN 'Local Pick'    THEN 1
    WHEN 'Regional Gem'  THEN 2
    WHEN 'Craft Classic' THEN 3
    WHEN 'Legend'        THEN 4
    ELSE -1
  END;

  -- Unrecognized tier: defensive default
  IF v_stake_idx = -1 OR v_current_idx = -1 THEN
    tiers_climbed := 0;
    multiplier := 1.0;
    estimated_payout := p_tabs_staked;
    payout_available := false;
    RETURN NEXT;
    RETURN;
  END IF;

  v_tiers_climbed := v_current_idx - v_stake_idx;

  -- Multiplier lookup
  IF v_tiers_climbed >= 4 THEN
    -- Only possible from Unranked
    v_multiplier := CASE v_stake_idx
      WHEN 0 THEN 12.0
      ELSE NULL
    END;
  ELSIF v_tiers_climbed = 3 THEN
    v_multiplier := CASE v_stake_idx
      WHEN 0 THEN 8.0
      WHEN 1 THEN 6.0
      ELSE NULL
    END;
  ELSIF v_tiers_climbed = 2 THEN
    v_multiplier := CASE v_stake_idx
      WHEN 0 THEN 4.0
      WHEN 1 THEN 3.0
      WHEN 2 THEN 2.5
      ELSE NULL
    END;
  ELSIF v_tiers_climbed = 1 THEN
    v_multiplier := CASE v_stake_idx
      WHEN 0 THEN 2.0
      WHEN 1 THEN 1.75
      WHEN 2 THEN 1.5
      WHEN 3 THEN 1.25
      ELSE NULL
    END;
  ELSIF v_tiers_climbed = 0 THEN
    v_multiplier := 1.0;
  ELSIF v_tiers_climbed = -1 THEN
    v_multiplier := 0.9;
  ELSE
    -- -2 or worse
    v_multiplier := 0.5;
  END IF;

  -- If multiplier is NULL (impossible tier combo), treat as defensive default
  IF v_multiplier IS NULL THEN
    tiers_climbed := v_tiers_climbed;
    multiplier := 1.0;
    estimated_payout := p_tabs_staked;
    payout_available := false;
    RETURN NEXT;
    RETURN;
  END IF;

  tiers_climbed := v_tiers_climbed;
  multiplier := v_multiplier;
  estimated_payout := floor(p_tabs_staked * v_multiplier)::integer;
  payout_available := (v_multiplier > 1.0);
  RETURN NEXT;
  RETURN;
END;
$$;

-- Helper: derive tier name from ELO score (mirrors lib/eloTiers.js getTierName)
CREATE OR REPLACE FUNCTION elo_tier_name(p_elo integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_elo >= 1600 THEN 'Legend'
    WHEN p_elo >= 1400 THEN 'Craft Classic'
    WHEN p_elo >= 1200 THEN 'Regional Gem'
    WHEN p_elo >= 1000 THEN 'Local Pick'
    ELSE 'Unranked'
  END;
$$;

-- RPC: fetch user's backs with payout info in a single query
CREATE OR REPLACE FUNCTION get_user_backs(
  p_user_id text,
  p_status text DEFAULT 'active',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_rows json;
  v_total bigint;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM beer_backs bb
  WHERE bb.user_id = p_user_id
    AND (p_status = 'all' OR bb.status = p_status);

  SELECT json_agg(row_to_json(t)) INTO v_rows
  FROM (
    SELECT
      bb.id,
      bb.beer_id,
      b.name AS beer_name,
      b.brewery_name,
      bb.tabs_staked,
      bb.tier_at_stake,
      bb.elo_at_stake,
      bb.staked_at,
      bb.locked_until,
      bb.status,
      elo_tier_name(COALESCE(ber.global_elo, bb.elo_at_stake)) AS current_tier,
      COALESCE(ber.global_elo, bb.elo_at_stake) AS current_elo,
      payout.tiers_climbed,
      payout.estimated_payout,
      (payout.payout_available AND now() >= bb.locked_until AND bb.status = 'active') AS payout_available
    FROM beer_backs bb
    JOIN beers b ON b.id = bb.beer_id
    LEFT JOIN beer_elo_ratings ber ON ber.beer_id = bb.beer_id
    CROSS JOIN LATERAL calculate_backing_payout(
      bb.tabs_staked,
      bb.tier_at_stake,
      elo_tier_name(COALESCE(ber.global_elo, bb.elo_at_stake))
    ) AS payout
    WHERE bb.user_id = p_user_id
      AND (p_status = 'all' OR bb.status = p_status)
    ORDER BY bb.staked_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN json_build_object(
    'data', COALESCE(v_rows, '[]'::json),
    'pagination', json_build_object('limit', p_limit, 'offset', p_offset, 'total', v_total)
  );
END;
$$;
