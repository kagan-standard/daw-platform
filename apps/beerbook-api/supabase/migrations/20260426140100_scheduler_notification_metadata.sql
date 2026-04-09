-- Add optional p_metadata jsonb param to insert_scheduler_notification
-- so scheduler scripts can attach structured payloads for the frontend.

DROP FUNCTION IF EXISTS insert_scheduler_notification(uuid, text, text, text, timestamptz, text, text);

CREATE OR REPLACE FUNCTION insert_scheduler_notification(
    p_user_id           uuid,
    p_notification_type text,
    p_title             text,
    p_message           text,
    p_week_start        timestamptz,
    p_target_type       text DEFAULT NULL,
    p_target_id         text DEFAULT NULL,
    p_metadata          jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO tab_notifications
        (user_id, notification_type, title, message, week_start, target_type, target_id, metadata)
    VALUES
        (p_user_id, p_notification_type, p_title, p_message, p_week_start,
         NULLIF(TRIM(p_target_type), ''), NULLIF(TRIM(p_target_id), ''), p_metadata)
    ON CONFLICT (user_id, notification_type, week_start)
        WHERE week_start IS NOT NULL
    DO NOTHING;
END;
$$;
