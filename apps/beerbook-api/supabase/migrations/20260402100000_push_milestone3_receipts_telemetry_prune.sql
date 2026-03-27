-- Milestone 3: Expo receipt polling helpers, attempt status for final delivery,
-- token retention prune, read-only telemetry views.

ALTER TABLE public.notification_token_push_state
  ADD COLUMN IF NOT EXISTS last_receipt_poll_at timestamptz NULL;

ALTER TABLE public.push_send_attempts DROP CONSTRAINT IF EXISTS push_send_attempts_status_check;
ALTER TABLE public.push_send_attempts ADD CONSTRAINT push_send_attempts_status_check
  CHECK (status IN ('sent_to_expo', 'retryable_failure', 'permanent_failure', 'receipt_ok'));

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
DECLARE
  v_attempt_no integer;
  v_delivery_status text;
  v_prev_delivery text;
BEGIN
  SELECT COALESCE(attempt_count, 0) + 1, delivery_status
    INTO v_attempt_no, v_prev_delivery
  FROM public.notification_token_push_state
  WHERE notification_id = p_notification_id
    AND token_id = p_token_id
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

CREATE OR REPLACE FUNCTION public.claim_push_receipt_batch(
  p_batch_size integer DEFAULT 100,
  p_min_age_seconds integer DEFAULT 15,
  p_poll_cooldown_seconds integer DEFAULT 20
)
RETURNS TABLE (
  notification_id text,
  token_id uuid,
  provider_ticket_id text,
  attempt_count integer,
  notification_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT
      s.id,
      s.notification_id,
      s.token_id,
      s.attempt_count,
      lt.provider_ticket_id,
      n.notification_type AS notification_type
    FROM public.notification_token_push_state s
    INNER JOIN public.tab_notifications n ON n.id::text = s.notification_id
    INNER JOIN LATERAL (
      SELECT psa.provider_ticket_id
      FROM public.push_send_attempts psa
      WHERE psa.notification_id = s.notification_id
        AND psa.token_id = s.token_id
        AND psa.status = 'sent_to_expo'
        AND psa.provider_ticket_id IS NOT NULL
        AND TRIM(psa.provider_ticket_id) <> ''
      ORDER BY psa.attempt_no DESC
      LIMIT 1
    ) lt ON true
    INNER JOIN public.push_tokens pt ON pt.id = s.token_id AND pt.is_active = true
    WHERE s.delivery_status = 'sent_to_expo'
      AND s.receipt_ok_at IS NULL
      AND s.sent_to_expo_at IS NOT NULL
      AND s.sent_to_expo_at <= now() - (GREATEST(1, p_min_age_seconds) || ' seconds')::interval
      AND s.next_attempt_at <= now()
      AND (
        s.last_receipt_poll_at IS NULL
        OR s.last_receipt_poll_at < now() - (GREATEST(1, p_poll_cooldown_seconds) || ' seconds')::interval
      )
    ORDER BY s.sent_to_expo_at ASC
    LIMIT GREATEST(1, p_batch_size)
    FOR UPDATE OF s SKIP LOCKED
  ),
  upd AS (
    UPDATE public.notification_token_push_state s
    SET
      last_receipt_poll_at = now(),
      updated_at = now()
    FROM picked p
    WHERE s.id = p.id
    RETURNING s.notification_id, s.token_id, s.attempt_count, p.provider_ticket_id, p.notification_type
  )
  SELECT
    u.notification_id,
    u.token_id,
    u.provider_ticket_id,
    u.attempt_count,
    u.notification_type
  FROM upd u;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_push_receipt_pending(
  p_notification_id text,
  p_token_id uuid,
  p_next_poll_after_seconds integer DEFAULT 45
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wait integer;
BEGIN
  v_wait := GREATEST(5, COALESCE(p_next_poll_after_seconds, 45));
  UPDATE public.notification_token_push_state
  SET
    last_receipt_poll_at = now(),
    next_attempt_at = now() + (v_wait || ' seconds')::interval,
    updated_at = now()
  WHERE notification_id = p_notification_id
    AND token_id = p_token_id
    AND delivery_status = 'sent_to_expo'
    AND receipt_ok_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_inactive_push_tokens(p_retention_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
  v_days integer;
BEGIN
  v_days := GREATEST(1, COALESCE(p_retention_days, 90));
  DELETE FROM public.push_tokens
  WHERE is_active = false
    AND deactivated_at IS NOT NULL
    AND deactivated_at < now() - (v_days || ' days')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE VIEW public.push_telemetry_token_summary AS
SELECT
  COUNT(*)::bigint AS total_rows,
  COUNT(*) FILTER (WHERE is_active)::bigint AS active_tokens,
  COUNT(*) FILTER (WHERE NOT is_active)::bigint AS inactive_tokens,
  COUNT(DISTINCT user_id) FILTER (WHERE is_active)::bigint AS users_with_active_token
FROM public.push_tokens;

CREATE OR REPLACE VIEW public.push_telemetry_delivery_by_status AS
SELECT
  delivery_status,
  COUNT(*)::bigint AS pair_count
FROM public.notification_token_push_state
GROUP BY delivery_status;

CREATE OR REPLACE VIEW public.push_telemetry_attempts_24h AS
SELECT
  status,
  COUNT(*)::bigint AS attempt_count
FROM public.push_send_attempts
WHERE created_at > now() - interval '24 hours'
GROUP BY status;

CREATE OR REPLACE VIEW public.push_telemetry_deactivations_30d AS
SELECT
  COALESCE(deactivation_reason, 'unknown') AS deactivation_reason,
  COUNT(*)::bigint AS token_count
FROM public.push_tokens
WHERE is_active = false
  AND deactivated_at IS NOT NULL
  AND deactivated_at > now() - interval '30 days'
GROUP BY COALESCE(deactivation_reason, 'unknown');

GRANT EXECUTE ON FUNCTION public.claim_push_receipt_batch(integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_push_receipt_pending(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_inactive_push_tokens(integer) TO service_role;

GRANT SELECT ON public.push_telemetry_token_summary TO service_role;
GRANT SELECT ON public.push_telemetry_delivery_by_status TO service_role;
GRANT SELECT ON public.push_telemetry_attempts_24h TO service_role;
GRANT SELECT ON public.push_telemetry_deactivations_30d TO service_role;
