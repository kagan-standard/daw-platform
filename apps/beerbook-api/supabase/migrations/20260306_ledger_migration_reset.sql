-- One-time data reset for BeerBook tabs ledger migration.
-- Purpose: clean-launch user-generated state while keeping definition tables intact,
-- with tabs_ledger as the sole source of truth and user_tabs_profile as runtime cache.

-- 1) Truncate user-generated data (definition tables and profiles are preserved).
DO $$
DECLARE
  t text;
  tables_to_truncate text[] := ARRAY[
    'ratings',
    'tabs_ledger',
    'tab_transactions',
    'user_achievements',
    'user_cosmetics',
    'tab_notifications',
    'beer_submissions',
    'rating_comments',
    'reactions',
    'price_logs',
    'referral_clicks',
    'page_views'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_truncate
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- 2) Reset user_tabs_profile cache rows for all users.
WITH reset_values AS (
  SELECT (date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS week_start_utc
)
UPDATE public.user_tabs_profile utp
SET
  current_tier = 'taster',
  current_streak_weeks = 0,
  longest_streak_weeks = 0,
  ratings_this_week = 0,
  weeks_inactive = 0,
  tab_balance = 0,
  lifetime_tabs_earned = 0,
  is_seeder = false,
  seeder_granted_at = NULL,
  seeder_granted_by = NULL,
  week_start = rv.week_start_utc,
  last_active_week = NULL,
  updated_at = now()
FROM reset_values rv;

-- 3) Reset profiles tabs balance only (leave all other profile fields as-is).
UPDATE public.profiles
SET tabs_balance = 0
WHERE COALESCE(tabs_balance, 0) <> 0;
