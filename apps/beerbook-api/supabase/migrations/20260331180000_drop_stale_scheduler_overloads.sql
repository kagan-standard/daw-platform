-- 20260331180000_drop_stale_scheduler_overloads.sql
-- Keep only the 7-arg text overload (the one both callers resolve to).

-- Stale: no callers use 5 args anymore
DROP FUNCTION IF EXISTS public.insert_scheduler_notification(text, text, text, text, timestamptz);

-- Dead: phase_3_notif_fix.sql assumed user_id was uuid; no caller sends uuid
DROP FUNCTION IF EXISTS public.insert_scheduler_notification(uuid, text, text, text, timestamptz, text, text);
