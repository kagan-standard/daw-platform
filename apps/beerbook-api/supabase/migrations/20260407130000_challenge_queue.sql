-- Challenge queue: admin-managed FIFO queue of upcoming challenges.
-- The Monday promoter worker pops the lowest-sort_order entry and creates
-- a weekly_challenges row for the current week.

--------------------------------------------------------------------------------
-- 1. Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenge_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key    text NOT NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  target_count    integer NOT NULL CHECK (target_count > 0),
  target_style    text NULL,
  reward_label    text NOT NULL CHECK (char_length(reward_label) BETWEEN 1 AND 200),
  reward_tabs     integer NOT NULL DEFAULT 0 CHECK (reward_tabs >= 0),
  reward_badge_id uuid NULL,
  notes           text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text NULL
);

CREATE INDEX idx_challenge_queue_sort_order
  ON public.challenge_queue (sort_order ASC, created_at ASC);

--------------------------------------------------------------------------------
-- 2. RLS — service_role only (same pattern as weekly_challenges)
--------------------------------------------------------------------------------
ALTER TABLE public.challenge_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS challenge_queue_service_role ON public.challenge_queue;
CREATE POLICY challenge_queue_service_role ON public.challenge_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 3. Push notification catalog entry for empty-queue admin alert
--------------------------------------------------------------------------------
INSERT INTO public.push_notification_catalog
  (notification_type, label, sort_order, description)
VALUES
  ('challenge_queue_empty', 'Challenge queue empty', 9991,
   'Sent to admins when the Monday promotion worker finds the challenge queue empty')
ON CONFLICT (notification_type) DO NOTHING;

INSERT INTO public.push_notification_push_toggle
  (notification_type, push_enabled, updated_at)
VALUES
  ('challenge_queue_empty', true, now())
ON CONFLICT (notification_type) DO NOTHING;

--------------------------------------------------------------------------------
-- 4. Update tab_notifications CHECK constraint to include the new type
--------------------------------------------------------------------------------
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
        'admin_push_test',
        'challenge_queue_empty'
      ]::text[]
    )
  );
