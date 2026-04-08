-- 20260331183000_add_photo_removed_to_push_catalog.sql
-- Enable push notifications for the photo_removed notification type.

INSERT INTO public.push_notification_catalog (notification_type, label, sort_order, description)
VALUES ('photo_removed', 'Photo removed', 70, 'A photo was removed by a moderator')
ON CONFLICT (notification_type) DO NOTHING;

INSERT INTO public.push_notification_push_toggle (notification_type, push_enabled, updated_at)
VALUES ('photo_removed', true, now())
ON CONFLICT (notification_type) DO NOTHING;
