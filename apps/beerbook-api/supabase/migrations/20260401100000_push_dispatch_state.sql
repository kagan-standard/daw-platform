-- Milestone 2: Push dispatch state and idempotent claim/transition RPCs.

CREATE TABLE IF NOT EXISTS public.notification_token_push_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id text NOT NULL,
  token_id uuid NOT NULL REFERENCES public.push_tokens(id) ON DELETE CASCADE,
  claim_status text NOT NULL DEFAULT 'queued'
    CHECK (claim_status IN ('queued', 'claimed')),
  delivery_status text NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN ('queued', 'claimed', 'sent_to_expo', 'receipt_ok', 'retryable_failure', 'permanent_failure')),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz NULL,
  sent_to_expo_at timestamptz NULL,
  receipt_checked_at timestamptz NULL,
  receipt_ok_at timestamptz NULL,
  last_error_code text NULL,
  last_error_message text NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, token_id)
);

CREATE INDEX IF NOT EXISTS idx_ntps_claim_queue
  ON public.notification_token_push_state (delivery_status, claim_status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_ntps_notification
  ON public.notification_token_push_state (notification_id);

CREATE TABLE IF NOT EXISTS public.push_send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id text NOT NULL,
  token_id uuid NOT NULL REFERENCES public.push_tokens(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  status text NOT NULL
    CHECK (status IN ('sent_to_expo', 'retryable_failure', 'permanent_failure')),
  provider_ticket_id text NULL,
  error_code text NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, token_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_push_send_attempts_pair_created
  ON public.push_send_attempts (notification_id, token_id, created_at DESC);

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
BEGIN
  SELECT COALESCE(MAX(attempt_count), 0) + 1
    INTO v_attempt_no
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
    claim_status = CASE WHEN p_status = 'retryable_failure' THEN 'queued' ELSE 'claimed' END,
    delivery_status = v_delivery_status,
    attempt_count = v_attempt_no,
    sent_to_expo_at = CASE WHEN p_status = 'sent_to_expo' THEN now() ELSE sent_to_expo_at END,
    last_error_code = NULLIF(TRIM(COALESCE(p_error_code, '')), ''),
    last_error_message = NULLIF(TRIM(COALESCE(p_error_message, '')), ''),
    next_attempt_at = CASE
      WHEN p_status = 'retryable_failure' THEN COALESCE(p_next_attempt_at, now() + interval '5 minutes')
      ELSE now()
    END,
    updated_at = now()
  WHERE notification_id = p_notification_id
    AND token_id = p_token_id;

  RETURN QUERY
  SELECT v_attempt_no, v_delivery_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_push_pair_ineligible(
  p_notification_id text,
  p_token_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notification_token_push_state
  SET
    claim_status = 'claimed',
    delivery_status = 'permanent_failure',
    last_error_code = 'ineligible',
    last_error_message = LEFT(COALESCE(p_reason, 'ineligible'), 240),
    updated_at = now()
  WHERE notification_id = p_notification_id
    AND token_id = p_token_id;
END;
$$;
