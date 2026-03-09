-- Backfill: Grant cosmetics to users who already have user_achievements but are missing
-- the corresponding user_cosmetics (e.g. achievements unlocked before cosmetics were
-- seeded or before unlock_achievement_with_rewards granted them).
--
-- Idempotent: uses ON CONFLICT (user_id, cosmetic_id) DO NOTHING.
-- Safe to run multiple times.

--------------------------------------------------------------------------------
-- One-time backfill: insert user_cosmetics for every (user, achievement) where
-- a cosmetic exists with achievement_key = achievement.key and the user doesn't
-- already have that cosmetic.
--------------------------------------------------------------------------------
INSERT INTO public.user_cosmetics (user_id, cosmetic_id, acquired_via)
SELECT ua.user_id, c.id, 'achievement'
FROM public.user_achievements ua
JOIN public.achievements a ON ua.achievement_id = a.id
JOIN public.cosmetics c ON c.achievement_key = a.key
ON CONFLICT (user_id, cosmetic_id) DO NOTHING;

--------------------------------------------------------------------------------
-- Optional: Reusable function to run the same backfill again later (e.g. after
-- seeding new cosmetics or fixing achievement_key alignment). Returns number
-- of rows inserted.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_achievement_cosmetics()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ins AS (
    INSERT INTO public.user_cosmetics (user_id, cosmetic_id, acquired_via)
    SELECT ua.user_id, c.id, 'achievement'
    FROM public.user_achievements ua
    JOIN public.achievements a ON ua.achievement_id = a.id
    JOIN public.cosmetics c ON c.achievement_key = a.key
    ON CONFLICT (user_id, cosmetic_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::bigint FROM ins;
$$;

COMMENT ON FUNCTION public.backfill_achievement_cosmetics IS
  'Idempotent backfill: grant all achievement-linked cosmetics to users who have the achievement but lack the cosmetic. Returns number of user_cosmetics rows inserted.';
