-- Phase 2.3: Atomic Achievement Unlock with Rewards
-- Resolves: BE-E-01 (High)
-- Wraps user_achievements insert + cosmetic grants + tabs_ledger reward
-- in a single transaction. If any step fails, the entire unlock rolls back.

--------------------------------------------------------------------------------
-- RPC: unlock_achievement_with_rewards
-- Atomically: (1) insert user_achievements, (2) grant linked cosmetics,
-- (3) insert tabs_ledger reward. All-or-nothing.
-- Returns JSONB: { already_unlocked, reward_tabs_granted, cosmetic_ids_granted }
-- On PK conflict (user_id, achievement_id) returns already_unlocked = true
-- without error (idempotent for re-evaluation).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_achievement_with_rewards(
  p_user_id text,
  p_achievement_id uuid,
  p_achievement_key text,
  p_reward_tabs int DEFAULT 0,
  p_progress jsonb DEFAULT '{}'::jsonb,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cosmetic_ids uuid[] := ARRAY[]::uuid[];
  v_cosmetic record;
  v_rows_inserted int;
BEGIN
  -- Step 1: Insert user_achievements. ON CONFLICT = already unlocked.
  INSERT INTO user_achievements (user_id, achievement_id, progress, context)
  VALUES (p_user_id, p_achievement_id, p_progress, p_context)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  IF v_rows_inserted = 0 THEN
    RETURN jsonb_build_object(
      'already_unlocked', true,
      'reward_tabs_granted', 0,
      'cosmetic_ids_granted', '[]'::jsonb
    );
  END IF;

  -- Step 2: Grant all cosmetics linked to this achievement.
  FOR v_cosmetic IN
    SELECT id FROM cosmetics WHERE achievement_key = p_achievement_key
  LOOP
    INSERT INTO user_cosmetics (user_id, cosmetic_id, acquired_via)
    VALUES (p_user_id, v_cosmetic.id, 'achievement')
    ON CONFLICT (user_id, cosmetic_id) DO NOTHING;
    v_cosmetic_ids := v_cosmetic_ids || v_cosmetic.id;
  END LOOP;

  -- Step 3: Insert tabs_ledger reward (hard failure rolls back everything).
  IF COALESCE(p_reward_tabs, 0) > 0 THEN
    INSERT INTO tabs_ledger (event_id, user_id, event_type, amount, breakdown, context)
    VALUES (
      gen_random_uuid(),
      p_user_id,
      'achievement_unlock',
      p_reward_tabs,
      '{}'::jsonb,
      jsonb_build_object('achievement_key', p_achievement_key) || COALESCE(p_context, '{}'::jsonb)
    );
  END IF;

  RETURN jsonb_build_object(
    'already_unlocked', false,
    'reward_tabs_granted', COALESCE(p_reward_tabs, 0),
    'cosmetic_ids_granted', to_jsonb(v_cosmetic_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.unlock_achievement_with_rewards IS
  'Phase 2.3: Atomic achievement unlock. All-or-nothing: user_achievements + cosmetics + tabs_ledger reward.';

--------------------------------------------------------------------------------
-- Reconciliation query (not a function; run ad-hoc to find orphaned unlocks).
-- Identifies user_achievements rows for reward-bearing achievements that have
-- no corresponding tabs_ledger entry with event_type = ''achievement_unlock''
-- and matching achievement_key in context.
--------------------------------------------------------------------------------
-- Usage:
--   SELECT * FROM reconcile_orphaned_achievement_rewards();
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_orphaned_achievement_rewards()
RETURNS TABLE (
  user_id text,
  achievement_id uuid,
  achievement_key text,
  reward_tabs int,
  unlocked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ua.user_id,
    ua.achievement_id,
    a.key AS achievement_key,
    a.reward_tabs,
    ua.unlocked_at
  FROM user_achievements ua
  JOIN achievements a ON ua.achievement_id = a.id
  WHERE a.reward_tabs > 0
    AND NOT EXISTS (
      SELECT 1 FROM tabs_ledger tl
      WHERE tl.user_id = ua.user_id
        AND tl.event_type = 'achievement_unlock'
        AND tl.context ->> 'achievement_key' = a.key
    )
  ORDER BY ua.unlocked_at;
$$;

COMMENT ON FUNCTION public.reconcile_orphaned_achievement_rewards IS
  'Phase 2.3: Data healing query. Returns user_achievements rows missing their tabs_ledger reward.';
