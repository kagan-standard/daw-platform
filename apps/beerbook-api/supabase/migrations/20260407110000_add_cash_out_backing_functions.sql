-- cash_out_back: atomically cash out a single beer back.
-- Uses tabs_ledger insert (trigger auto-updates profiles.tabs_balance).
-- Calls calculate_backing_payout for multiplier math — single source of truth.

CREATE OR REPLACE FUNCTION cash_out_back(
  p_back_id uuid,
  p_user_id text
)
RETURNS TABLE(
  success boolean,
  error_code text,
  tabs_credited integer,
  new_balance integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_back RECORD;
  v_current_tier text;
  v_payout RECORD;
  v_new_balance integer;
BEGIN
  -- 1. Lock the back row; reject if not found or wrong user
  SELECT * INTO v_back
  FROM beer_backs
  WHERE id = p_back_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, 0, 0;
    RETURN;
  END IF;

  -- 2. Idempotency: already cashed out
  IF v_back.status <> 'active' THEN
    RETURN QUERY SELECT false, 'already_cashed_out'::text, 0, 0;
    RETURN;
  END IF;

  -- 3. Still locked
  IF now() < v_back.locked_until THEN
    RETURN QUERY SELECT false, 'still_locked'::text, 0, 0;
    RETURN;
  END IF;

  -- 4. Look up current tier from beer_elo_ratings
  SELECT elo_tier_name(ber.global_elo) INTO v_current_tier
  FROM beer_elo_ratings ber
  WHERE ber.beer_id = v_back.beer_id;

  -- 5. Compute payout via canonical function
  SELECT * INTO v_payout
  FROM calculate_backing_payout(
    v_back.tabs_staked,
    v_back.tier_at_stake,
    COALESCE(v_current_tier, v_back.tier_at_stake)
  );

  -- 6. Credit user via tabs_ledger (trigger updates profiles.tabs_balance)
  INSERT INTO tabs_ledger (event_id, user_id, event_type, amount, breakdown, context, created_at)
  VALUES (
    gen_random_uuid(),
    v_back.user_id,
    'beer_back_cashout',
    v_payout.estimated_payout,
    jsonb_build_object('multiplier', v_payout.multiplier, 'tiers_climbed', v_payout.tiers_climbed),
    jsonb_build_object('beer_id', v_back.beer_id, 'back_id', v_back.id),
    now()
  );

  -- Read back the updated balance
  SELECT tabs_balance INTO v_new_balance
  FROM profiles
  WHERE id = v_back.user_id;

  -- 7. Mark cashed out
  UPDATE beer_backs
  SET status = 'cashed_out',
      cashed_out_at = now(),
      tabs_returned = v_payout.estimated_payout
  WHERE id = p_back_id;

  -- 8. Return success
  RETURN QUERY SELECT true, NULL::text, v_payout.estimated_payout, COALESCE(v_new_balance, 0);
END;
$$;


-- auto_resolve_unlocked_backs: daily cron sweeps backs past lock with non-positive payout.
-- Uses tabs_ledger insert pattern. Skips backs with multiplier > 1.0 (those wait for manual cash-out).

CREATE OR REPLACE FUNCTION auto_resolve_unlocked_backs()
RETURNS TABLE(
  resolved_count integer,
  total_credited integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_back RECORD;
  v_current_tier text;
  v_payout RECORD;
  v_resolved integer := 0;
  v_credited integer := 0;
BEGIN
  FOR v_back IN
    SELECT bb.*
    FROM beer_backs bb
    WHERE bb.status = 'active'
      AND now() >= bb.locked_until
    ORDER BY bb.locked_until ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Look up current tier
    SELECT elo_tier_name(ber.global_elo) INTO v_current_tier
    FROM beer_elo_ratings ber
    WHERE ber.beer_id = v_back.beer_id;

    -- Compute payout
    SELECT * INTO v_payout
    FROM calculate_backing_payout(
      v_back.tabs_staked,
      v_back.tier_at_stake,
      COALESCE(v_current_tier, v_back.tier_at_stake)
    );

    -- Only auto-resolve if multiplier <= 1.0 (no positive payout)
    IF v_payout.multiplier > 1.0 THEN
      CONTINUE;
    END IF;

    -- Credit user via tabs_ledger
    INSERT INTO tabs_ledger (event_id, user_id, event_type, amount, breakdown, context, created_at)
    VALUES (
      gen_random_uuid(),
      v_back.user_id,
      'beer_back_auto_resolve',
      v_payout.estimated_payout,
      jsonb_build_object('multiplier', v_payout.multiplier, 'tiers_climbed', v_payout.tiers_climbed),
      jsonb_build_object('beer_id', v_back.beer_id, 'back_id', v_back.id),
      now()
    );

    -- Mark cashed out
    UPDATE beer_backs
    SET status = 'cashed_out',
        cashed_out_at = now(),
        tabs_returned = v_payout.estimated_payout
    WHERE id = v_back.id;

    v_resolved := v_resolved + 1;
    v_credited := v_credited + v_payout.estimated_payout;
  END LOOP;

  RETURN QUERY SELECT v_resolved, v_credited;
END;
$$;


-- Consistency constraint: cashed_out/early_exit rows must have cashed_out_at and tabs_returned set.
-- Active rows must NOT have them set.
-- Check existing data first, then add the constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'beer_backs_cashout_consistency'
  ) THEN
    -- Fix any existing rows that violate the constraint before adding it
    UPDATE beer_backs
    SET cashed_out_at = COALESCE(cashed_out_at, now()),
        tabs_returned = COALESCE(tabs_returned, 0)
    WHERE status IN ('cashed_out', 'early_exit')
      AND (cashed_out_at IS NULL OR tabs_returned IS NULL);

    ALTER TABLE beer_backs
      ADD CONSTRAINT beer_backs_cashout_consistency
      CHECK (
        (status = 'active' AND cashed_out_at IS NULL AND tabs_returned IS NULL)
        OR
        (status IN ('cashed_out', 'early_exit') AND cashed_out_at IS NOT NULL AND tabs_returned IS NOT NULL)
      );
  END IF;
END $$;
