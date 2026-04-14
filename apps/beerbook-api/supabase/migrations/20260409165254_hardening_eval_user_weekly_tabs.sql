BEGIN;

CREATE OR REPLACE FUNCTION eval_user_weekly_tabs(
  p_user_id   text,
  p_window_start timestamptz,
  p_window_end   timestamptz
)
RETURNS TABLE (
  user_id                text,
  prev_tier              user_tier,
  new_tier               user_tier,
  prev_streak            integer,
  new_streak             integer,
  prev_weeks_inactive    integer,
  new_weeks_inactive     integer,
  prior_week_ratings_count integer,
  promoted               boolean,
  demoted                boolean,
  prev_tier_promoted_at  timestamptz,
  new_tier_promoted_at   timestamptz
)
LANGUAGE plpgsql
AS $$
/*
 * eval_user_weekly_tabs — PL/pgSQL port of the per-user block from
 * scripts/weekly-tabs-eval.js (Phase B, Day 4 hardening).
 *
 * INVARIANT — Promotion vs. Demotion asymmetry:
 *   - PROMOTION reads the *cached* current_streak_weeks from user_tabs_profile.
 *     The streak is maintained by refresh_rating_award_profile_cache at rating-time.
 *   - DEMOTION reads the *raw* prior-week ratings count via a live COUNT(*) on
 *     the ratings table within the supplied window.
 *   This asymmetry is intentional and must be preserved. Changing one side to
 *   match the other would break the evaluation semantics.
 *
 * Known latent behaviors preserved from the JS port (backlog items #8-#10):
 *   #8  — tier_promoted_at is updated on ANY tier change (including demotion).
 *   #9  — Demote-then-promote in the same cycle is possible (demotion runs first,
 *          then promotion checks against the post-demotion tier).
 *   #10 — current_streak_weeks is NOT reset on demotion; it carries forward.
 */
DECLARE
  v_profile              user_tabs_profile%ROWTYPE;
  v_prior_count          integer;
  v_current_tier         user_tier;
  v_current_streak       integer;
  v_weeks_inactive       integer;
  v_maintenance_min      integer;
  v_current_display_order integer;
  v_prev_tier            user_tier;
  v_prev_streak          integer;
  v_prev_weeks_inactive  integer;
  v_promoted             boolean := false;
  v_demoted              boolean := false;
  v_prev_display_order   integer;
  v_prev_tier_val        user_tier;
  v_next_display_order   integer;
  v_next_tier            user_tier;
  v_next_req_weeks       integer;
  v_new_tier_promoted_at timestamptz;
  v_now                  timestamptz := now();
  v_week_start           timestamptz;
BEGIN
  -- ================================================================
  -- 1. Lock the profile row to prevent concurrent mutation (race fix)
  -- ================================================================
  SELECT * INTO v_profile
    FROM user_tabs_profile utp
   WHERE utp.user_id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;  -- no profile, nothing to evaluate
  END IF;

  -- Snapshot "before" values
  v_prev_tier           := v_profile.current_tier;
  v_prev_streak         := v_profile.current_streak_weeks;
  v_prev_weeks_inactive := v_profile.weeks_inactive;

  -- Working copies
  v_current_tier   := v_profile.current_tier;
  v_current_streak := v_profile.current_streak_weeks;
  v_weeks_inactive := v_profile.weeks_inactive;

  -- ================================================================
  -- 2. Count prior-week ratings (raw — the demotion signal)
  -- ================================================================
  SELECT count(*)::integer INTO v_prior_count
    FROM ratings r
   WHERE r.user_id = p_user_id
     AND r.created_at >= p_window_start
     AND r.created_at <= p_window_end;

  -- ================================================================
  -- 3. Look up maintenance threshold for the current tier
  -- ================================================================
  SELECT tr.maintenance_ratings_per_week, tr.display_order
    INTO v_maintenance_min, v_current_display_order
    FROM tier_requirements tr
   WHERE tr.tier = v_current_tier;

  -- Fallback (should not happen if tier_requirements is populated)
  IF v_maintenance_min IS NULL THEN
    v_maintenance_min := 2;
  END IF;

  -- ================================================================
  -- 4. DEMOTION CHECK (runs first — matches JS order of operations)
  -- ================================================================
  IF v_prior_count >= v_maintenance_min THEN
    -- Met maintenance: reset inactivity
    v_weeks_inactive := 0;
  ELSE
    -- Below maintenance: increment inactivity
    v_weeks_inactive := v_weeks_inactive + 1;

    IF v_weeks_inactive >= 4 THEN
      -- Find the previous tier (one step down by display_order)
      SELECT tr.tier INTO v_prev_tier_val
        FROM tier_requirements tr
       WHERE tr.display_order = v_current_display_order - 1;

      IF v_prev_tier_val IS NOT NULL THEN
        -- Demote one tier
        v_current_tier := v_prev_tier_val;
        v_demoted := true;
      END IF;

      -- Reset weeks_inactive on threshold hit regardless of whether
      -- demotion actually occurred (matches JS behavior)
      v_weeks_inactive := 0;
    END IF;
  END IF;

  -- ================================================================
  -- 5. PROMOTION CHECK (runs after demotion — uses post-demotion tier)
  -- ================================================================
  -- Re-fetch display_order for current tier (may have changed after demotion)
  SELECT tr.display_order INTO v_current_display_order
    FROM tier_requirements tr
   WHERE tr.tier = v_current_tier;

  -- Find next tier
  SELECT tr.tier, tr.required_consecutive_weeks
    INTO v_next_tier, v_next_req_weeks
    FROM tier_requirements tr
   WHERE tr.display_order = v_current_display_order + 1;

  IF v_next_tier IS NOT NULL
     AND v_current_streak >= COALESCE(v_next_req_weeks, 0) THEN
    -- Promote
    v_current_tier   := v_next_tier;
    v_current_streak := 0;  -- reset streak on promotion
    v_promoted       := true;
  END IF;

  -- ================================================================
  -- 6. Compute tier_promoted_at
  --    (fires on ANY tier change — matches JS bug, backlog #8)
  -- ================================================================
  IF v_current_tier <> v_prev_tier THEN
    v_new_tier_promoted_at := v_now;
  ELSE
    v_new_tier_promoted_at := v_profile.tier_promoted_at;
  END IF;

  -- Compute week_start (same as JS: currentMonday = start of current week)
  -- We receive p_window_end which is prevSundayEnd; week_start = p_window_end + 1ms
  -- But it's cleaner to compute from p_window_start + 7 days
  v_week_start := p_window_start + interval '7 days';

  -- ================================================================
  -- 7. UPDATE — all 9 fields, unconditionally (matches Before Snapshot)
  -- ================================================================
  UPDATE user_tabs_profile utp
     SET current_tier            = v_current_tier,
         current_streak_weeks    = v_current_streak,
         weeks_inactive          = v_weeks_inactive,
         ratings_this_week       = 0,
         reviews_this_week       = 0,
         contributions_this_week = 0,
         week_start              = v_week_start,
         tier_promoted_at        = v_new_tier_promoted_at,
         updated_at              = v_now
   WHERE utp.user_id = p_user_id;

  -- ================================================================
  -- 8. Return observability row
  -- ================================================================
  RETURN QUERY SELECT
    p_user_id,
    v_prev_tier,
    v_current_tier,
    v_prev_streak,
    v_current_streak,
    v_prev_weeks_inactive,
    v_weeks_inactive,
    v_prior_count,
    v_promoted,
    v_demoted,
    v_profile.tier_promoted_at,
    v_new_tier_promoted_at;
END;
$$;

COMMIT;
