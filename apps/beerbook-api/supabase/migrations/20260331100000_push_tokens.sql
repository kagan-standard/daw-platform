-- Push token persistence for mobile notifications (Milestone 1).
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  device_id text NULL,
  app_version text NULL,
  is_active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz NULL,
  deactivation_reason text NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_tokens_expo_push_token
  ON public.push_tokens (expo_push_token);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_active
  ON public.push_tokens (user_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_tokens_user_device_active
  ON public.push_tokens (user_id, device_id)
  WHERE device_id IS NOT NULL AND is_active = true;
