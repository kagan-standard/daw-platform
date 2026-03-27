-- Fix ambiguous column reference in record_push_send_attempt caused by
-- RETURNS TABLE output column name (delivery_status) colliding with table column.

CREATE OR REPLACE FUNCTION public.record_push_send_attempt(
  p_notification_id text,
  p_token_id uuid,
  p_status text,
  p_provider_ticket_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_next_attempt_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  attempt_no integer,
  delivery_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_attempt_no integer;
  v_delivery_status text;
  v_prev_delivery text;
BEGIN
  SELECT
    COALESCE(s.attempt_count, 0) + 1,
    s.delivery_status
  INTO v_attempt_no, v_prev_delivery
  FROM public.notification_token_push_state s
  WHERE s.notification_id = p_notification_id
    AND s.token_id = p_token_id
  FOR UPDATE;

  INSERT INTO public.push_send_attempts (
    notification_id,
    token_id,
    attempt_no,
    status,
    provider_ticket_id,
    error_code,
    error_message,
    created_at
  )
  VALUES (
    p_notification_id,
    p_token_id,
    v_attempt_no,
    p_status,
    NULLIF(TRIM(COALESCE(p_provider_ticket_id, '')), ''),
    NULLIF(TRIM(COALESCE(p_error_code, '')), ''),
    NULLIF(TRIM(COALESCE(p_error_message, '')), ''),
    now()
  );

  v_delivery_status := p_status;
  IF p_status = 'retryable_failure' AND p_next_attempt_at IS NULL THEN
    p_next_attempt_at := now() + interval '5 minutes';
  END IF;

  UPDATE public.notification_token_push_state
  SET
    claim_status = CASE
      WHEN p_status = 'retryable_failure' THEN 'queued'
      ELSE 'claimed'
    END,
    delivery_status = v_delivery_status,
    attempt_count = v_attempt_no,
    sent_to_expo_at = CASE WHEN p_status = 'sent_to_expo' THEN now() ELSE sent_to_expo_at END,
    receipt_ok_at = CASE WHEN p_status = 'receipt_ok' THEN now() ELSE receipt_ok_at END,
    receipt_checked_at = CASE
      WHEN p_status = 'receipt_ok' THEN now()
      WHEN p_status = 'permanent_failure' AND v_prev_delivery = 'sent_to_expo' THEN now()
      ELSE receipt_checked_at
    END,
    last_error_code = CASE
      WHEN p_status = 'receipt_ok' THEN NULL
      ELSE COALESCE(NULLIF(TRIM(COALESCE(p_error_code, '')), ''), last_error_code)
    END,
    last_error_message = CASE
      WHEN p_status = 'receipt_ok' THEN NULL
      ELSE COALESCE(NULLIF(TRIM(COALESCE(p_error_message, '')), ''), last_error_message)
    END,
    next_attempt_at = CASE
      WHEN p_status = 'retryable_failure' THEN COALESCE(p_next_attempt_at, now() + interval '5 minutes')
      WHEN p_status = 'receipt_ok' THEN now()
      WHEN p_status = 'permanent_failure' THEN now()
      ELSE now()
    END,
    updated_at = now()
  WHERE notification_id = p_notification_id
    AND token_id = p_token_id;

  RETURN QUERY
  SELECT v_attempt_no, v_delivery_status;
END;
$$;
