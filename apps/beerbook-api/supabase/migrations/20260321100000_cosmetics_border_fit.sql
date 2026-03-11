-- Add border_fit JSONB to cosmetics for Admin Border Fit Editor.
-- Per-border scale, rotation, offset (and optional avatarScale); only meaningful when type = 'border'.
-- Validated in API; no DB constraint.
ALTER TABLE public.cosmetics ADD COLUMN IF NOT EXISTS border_fit jsonb NULL;
