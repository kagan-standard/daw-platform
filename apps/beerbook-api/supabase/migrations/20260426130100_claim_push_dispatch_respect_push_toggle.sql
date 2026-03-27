-- Enqueue notification_token_push_state only when admin toggle allows push for that type.

CREATE OR REPLACE FUNCTION public.claim_push_dispatch_batch(
  p_batch_size integer DEFAULT 100
)
RETURNS TABLE (
  state_id uuid,
  notification_id text,
  token_id uuid,
  user_id uuid,
  notification_type text,
  title text,
  message text,
  target_type text,
  target_id text,
  expo_push_token text,
  delivery_status text,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_token_push_state (
    notification_id,
    token_id,
    claim_status,
    delivery_status,
    next_attempt_at,
    created_at,
    updated_at
  )
  SELECT
    n.id::text,
    t.id,
    'queued',
    'queued',
    now(),
    now(),
    now()
  FROM public.tab_notifications n
  JOIN public.push_tokens t
    ON t.user_id = n.user_id
   AND t.is_active = true
  INNER JOIN public.push_notification_push_toggle ppush
    ON ppush.notification_type = n.notification_type
   AND ppush.push_enabled = true
  LEFT JOIN public.notification_token_push_state s
    ON s.notification_id = n.id::text
   AND s.token_id = t.id
  WHERE s.id IS NULL;

  RETURN QUERY
  WITH claimable AS (
    SELECT
      s.id
    FROM public.notification_token_push_state s
    JOIN public.push_tokens t
      ON t.id = s.token_id
     AND t.is_active = true
    WHERE s.delivery_status IN ('queued', 'retryable_failure')
      AND s.next_attempt_at <= now()
    ORDER BY s.next_attempt_at ASC, s.updated_at ASC
    LIMIT GREATEST(1, p_batch_size)
    FOR UPDATE OF s SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.notification_token_push_state s
    SET
      claim_status = 'claimed',
      delivery_status = 'claimed',
      claimed_at = now(),
      updated_at = now()
    WHERE s.id IN (SELECT c.id FROM claimable c)
    RETURNING s.id, s.notification_id, s.token_id, s.delivery_status, s.attempt_count
  )
  SELECT
    c.id AS state_id,
    c.notification_id,
    c.token_id,
    n.user_id,
    n.notification_type,
    n.title,
    n.message,
    n.target_type,
    n.target_id,
    t.expo_push_token,
    c.delivery_status,
    c.attempt_count
  FROM claimed c
  JOIN public.tab_notifications n
    ON n.id::text = c.notification_id
  JOIN public.push_tokens t
    ON t.id = c.token_id
  ORDER BY c.id;
END;
$$;
