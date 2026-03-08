-- Phase 3.4: Notification UX — Action contract (target_type, target_id)
-- Resolves: FE-I-03, FE-I-04, INT-09
-- Adds destination metadata so frontend can navigate on notification press.
-- Existing notifications keep NULL target fields (backward compatible).
-- NOTE: Use p_user_id uuid to match Phase 2.10 signature so REPLACE works.

--------------------------------------------------------------------------------
-- 1. Add target_type and target_id to tab_notifications
--------------------------------------------------------------------------------
ALTER TABLE tab_notifications
    ADD COLUMN IF NOT EXISTS target_type TEXT,
    ADD COLUMN IF NOT EXISTS target_id   TEXT;

ALTER TABLE tab_notifications
    DROP CONSTRAINT IF EXISTS tab_notifications_target_type_check;

ALTER TABLE tab_notifications
    ADD CONSTRAINT tab_notifications_target_type_check
    CHECK (target_type IS NULL OR target_type IN (
        'beer', 'user', 'crew', 'achievement', 'tabs_profile'
    ));

COMMENT ON COLUMN tab_notifications.target_type IS
  'Phase 3.4: Destination type for navigation on press (beer, user, crew, achievement, tabs_profile). NULL = mark-read only.';
COMMENT ON COLUMN tab_notifications.target_id IS
  'Phase 3.4: Destination entity id for navigation (e.g. submission id for beer, user id for tabs_profile).';

--------------------------------------------------------------------------------
-- 2. Replace insert_scheduler_notification (same arg types as Phase 2.10 + optional target_type/target_id)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION insert_scheduler_notification(
    p_user_id           uuid,
    p_notification_type text,
    p_title             text,
    p_message           text,
    p_week_start        timestamptz,
    p_target_type       text DEFAULT NULL,
    p_target_id         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO tab_notifications
        (user_id, notification_type, title, message, week_start, target_type, target_id)
    VALUES
        (p_user_id, p_notification_type, p_title, p_message, p_week_start,
         NULLIF(TRIM(p_target_type), ''), NULLIF(TRIM(p_target_id), ''))
    ON CONFLICT (user_id, notification_type, week_start)
        WHERE week_start IS NOT NULL
    DO NOTHING;
END;
$$;

COMMENT ON FUNCTION insert_scheduler_notification(uuid, text, text, text, timestamptz, text, text) IS
  'Phase 2.10 + 3.4: Scheduler notification insert with dedupe. Optional target_type/target_id for notification action contract.';