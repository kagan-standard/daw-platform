-- Migration-owned catalog of notification types that may be sent as push, plus per-type admin toggles.
-- New types: INSERT into push_notification_catalog and push_notification_push_toggle in a new migration.

CREATE TABLE IF NOT EXISTS public.push_notification_catalog (
  notification_type text PRIMARY KEY,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  description text NULL
);

CREATE TABLE IF NOT EXISTS public.push_notification_push_toggle (
  notification_type text PRIMARY KEY REFERENCES public.push_notification_catalog (notification_type) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.push_notification_catalog (notification_type, label, sort_order, description) VALUES
  ('streak_at_risk', 'Streak at risk', 10, 'Mid-week streak risk (scheduler)'),
  ('approaching_demotion', 'Approaching demotion', 20, 'Tier demotion warning (scheduler)'),
  ('tier_promotion', 'Tier promotion', 30, 'Weekly tier promotion (scheduler)'),
  ('tabs_earned', 'Tabs earned', 40, 'Tabs earned notification'),
  ('beer_approved', 'Beer approved', 50, 'Submission approved by admin'),
  ('weekly_summary', 'Weekly summary', 60, 'Weekly summary (scheduler)')
ON CONFLICT (notification_type) DO NOTHING;

INSERT INTO public.push_notification_push_toggle (notification_type, push_enabled, updated_at)
SELECT
  notification_type,
  true,
  now()
FROM public.push_notification_catalog
ON CONFLICT (notification_type) DO NOTHING;

GRANT ALL ON public.push_notification_catalog TO service_role;
GRANT ALL ON public.push_notification_push_toggle TO service_role;
