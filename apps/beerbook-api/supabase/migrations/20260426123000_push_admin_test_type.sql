-- Add migration-owned admin test notification type for manual push verification.
-- This type is triggerable by admin API and rides the normal push dispatcher pipeline.

INSERT INTO public.push_notification_catalog (notification_type, label, sort_order, description)
VALUES ('admin_push_test', 'Admin push test', 9990, 'Manual test notification triggered from admin UI')
ON CONFLICT (notification_type) DO NOTHING;

INSERT INTO public.push_notification_push_toggle (notification_type, push_enabled, updated_at)
VALUES ('admin_push_test', true, now())
ON CONFLICT (notification_type) DO NOTHING;
