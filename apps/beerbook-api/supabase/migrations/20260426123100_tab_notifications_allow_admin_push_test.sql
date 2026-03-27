-- tab_notifications had a CHECK that did not include admin_push_test, so the admin
-- test-send endpoint could not persist rows despite push_notification_catalog entries.

ALTER TABLE public.tab_notifications
  DROP CONSTRAINT IF EXISTS tab_notifications_notification_type_check;

ALTER TABLE public.tab_notifications
  ADD CONSTRAINT tab_notifications_notification_type_check
  CHECK (
    notification_type = ANY (
      ARRAY[
        'tier_promotion',
        'tier_demotion',
        'streak_at_risk',
        'approaching_demotion',
        'tabs_earned',
        'beer_approved',
        'beer_rejected',
        'seeder_granted',
        'reward_eligible',
        'weekly_summary',
        'admin_push_test'
      ]::text[]
    )
  );
