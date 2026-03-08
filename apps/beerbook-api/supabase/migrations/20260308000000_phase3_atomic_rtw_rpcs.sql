-- Phase 3.1: Atomicize Read-Then-Write Patterns (ARCH-05)
-- Resolves: BE-F-02, BE-C-04, BE-D-05, BE-E-03, BE-E-04
-- Replaces non-atomic read-compute-write in venues, activity, follows, tabs, processEventEngine.

--------------------------------------------------------------------------------
-- RPC: confirm_venue_price
-- Atomically increment confirmed_count for a price log, scoped to venue.
-- Returns: single row with confirmed_count; no row = 404 (not found or venue mismatch).
-- Schema: price_logs.id and venue_id are text.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_venue_price(p_price_id text, p_venue_id text)
RETURNS TABLE (confirmed_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE price_logs
  SET
    confirmed_count = COALESCE(confirmed_count, 0) + 1,
    last_confirmed_at = now()
  WHERE id = p_price_id AND venue_id = p_venue_id
  RETURNING price_logs.confirmed_count;
END;
$$;

COMMENT ON FUNCTION public.confirm_venue_price IS
  'Phase 3.1: Atomic venue price confirm. WHERE id AND venue_id prevents cross-venue updates.';

--------------------------------------------------------------------------------
-- RPC: confirm_happy_hour
-- Atomically increment confirmed_count for a happy hour, scoped to venue.
-- Schema: happy_hours.id and venue_id are text.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_happy_hour(p_hh_id text, p_venue_id text)
RETURNS TABLE (confirmed_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE happy_hours
  SET
    confirmed_count = COALESCE(confirmed_count, 0) + 1,
    last_confirmed_at = now()
  WHERE id = p_hh_id AND venue_id = p_venue_id
  RETURNING happy_hours.confirmed_count;
END;
$$;

COMMENT ON FUNCTION public.confirm_happy_hour IS
  'Phase 3.1: Atomic happy hour confirm. WHERE id AND venue_id prevents cross-venue updates.';

--------------------------------------------------------------------------------
-- RPC: toggle_cheers
-- Atomically insert or delete one cheers reaction; returns cheered and cheers_count.
-- rating_id and user_id are text (Keycloak sub / rating id format).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_cheers(p_rating_id text, p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_cheered boolean;
  v_count int;
BEGIN
  IF btrim(COALESCE(p_rating_id, '')) = '' OR btrim(COALESCE(p_user_id, '')) = '' THEN
    RAISE EXCEPTION 'rating_id and user_id are required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM reactions
    WHERE rating_id = p_rating_id AND user_id = p_user_id AND reaction_type = 'cheers'
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM reactions
    WHERE rating_id = p_rating_id AND user_id = p_user_id AND reaction_type = 'cheers';
    v_cheered := false;
  ELSE
    INSERT INTO reactions (rating_id, user_id, reaction_type)
    VALUES (p_rating_id, p_user_id, 'cheers');
    v_cheered := true;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM reactions
  WHERE rating_id = p_rating_id AND reaction_type = 'cheers';

  RETURN jsonb_build_object('cheered', v_cheered, 'cheers_count', v_count);
END;
$$;

COMMENT ON FUNCTION public.toggle_cheers IS
  'Phase 3.1: Atomic cheers toggle. Returns { cheered: bool, cheers_count: int }.';

--------------------------------------------------------------------------------
-- RPC: toggle_follow
-- Atomically insert or delete one follow; returns following.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_follow(p_follower_id text, p_following_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_following boolean;
BEGIN
  IF btrim(COALESCE(p_follower_id, '')) = '' OR btrim(COALESCE(p_following_id, '')) = '' THEN
    RAISE EXCEPTION 'follower_id and following_id are required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_follower_id = p_following_id THEN
    RAISE EXCEPTION 'Cannot follow yourself'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM follows
    WHERE follower_id = p_follower_id AND followed_id = p_following_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM follows
    WHERE follower_id = p_follower_id AND followed_id = p_following_id;
    v_following := false;
  ELSE
    INSERT INTO follows (follower_id, followed_id)
    VALUES (p_follower_id, p_following_id);
    v_following := true;
  END IF;

  RETURN jsonb_build_object('following', v_following);
END;
$$;

COMMENT ON FUNCTION public.toggle_follow IS
  'Phase 3.1: Atomic follow toggle. Returns { following: bool }.';

--------------------------------------------------------------------------------
-- RPC: award_tabs
-- Atomically insert tabs_ledger row (admin_grant) and increment user_tabs_profile.lifetime_tabs_earned.
-- Idempotent by p_event_id; on conflict (event_id) no ledger insert and no profile update.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_tabs(
  p_user_id text,
  p_amount int,
  p_reason text,
  p_admin_user_id text,
  p_event_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_inserted boolean := false;
  v_row_count int;
BEGIN
  IF btrim(COALESCE(p_user_id, '')) = '' THEN
    RAISE EXCEPTION 'user_id is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'amount must be a non-zero integer' USING ERRCODE = 'check_violation';
  END IF;

  v_event_id := COALESCE(p_event_id, gen_random_uuid());

  INSERT INTO tabs_ledger (event_id, user_id, event_type, amount, breakdown, context)
  VALUES (
    v_event_id,
    p_user_id,
    'admin_grant',
    p_amount,
    jsonb_build_object('base_amount', abs(p_amount), 'tier_multiplier', 1.0, 'seeder_multiplier', 1.0),
    jsonb_build_object('admin_user_id', p_admin_user_id, 'reason', COALESCE(btrim(p_reason), ''))
  )
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_inserted := v_row_count > 0;

  IF v_inserted AND p_amount > 0 THEN
    INSERT INTO user_tabs_profile (user_id, week_start, lifetime_tabs_earned)
    VALUES (
      p_user_id,
      (date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
      p_amount
    )
    ON CONFLICT (user_id) DO UPDATE
    SET lifetime_tabs_earned = user_tabs_profile.lifetime_tabs_earned + p_amount,
        updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'amount', CASE WHEN v_inserted THEN p_amount ELSE 0 END
  );
END;
$$;

COMMENT ON FUNCTION public.award_tabs IS
  'Phase 3.1: Atomic admin tab award. tabs_ledger + user_tabs_profile.lifetime_tabs_earned. Idempotent by event_id.';

--------------------------------------------------------------------------------
-- RPC: award_rating_tabs_with_cap
-- Enforces weekly cap (rating_award count this week) then conditionally inserts one ledger row.
-- Uses advisory lock per user to serialize cap check + insert. Idempotent by p_event_id.
-- Returns awarded amount (0 if at cap or duplicate event_id).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_rating_tabs_with_cap(
  p_user_id text,
  p_amount int,
  p_weekly_cap int,
  p_event_id uuid,
  p_breakdown jsonb DEFAULT '{}'::jsonb,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start timestamptz;
  v_count int;
  v_inserted int;
BEGIN
  IF btrim(COALESCE(p_user_id, '')) = '' OR p_event_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_amount IS NULL OR p_amount < 0 OR p_weekly_cap IS NULL OR p_weekly_cap < 0 THEN
    RETURN 0;
  END IF;

  v_week_start := (date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id));

  SELECT count(*)::int INTO v_count
  FROM tabs_ledger
  WHERE user_id = p_user_id
    AND event_type = 'rating_award'
    AND created_at >= v_week_start;

  IF v_count >= p_weekly_cap THEN
    RETURN 0;
  END IF;

  INSERT INTO tabs_ledger (event_id, user_id, event_type, amount, breakdown, context)
  VALUES (p_event_id, p_user_id, 'rating_award', p_amount, COALESCE(p_breakdown, '{}'::jsonb), COALESCE(p_context, '{}'::jsonb))
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted > 0 THEN
    RETURN p_amount;
  END IF;
  RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.award_rating_tabs_with_cap IS
  'Phase 3.1: Atomic rating tabs award with weekly cap. SELECT FOR UPDATE + conditional insert. Idempotent by event_id.';
