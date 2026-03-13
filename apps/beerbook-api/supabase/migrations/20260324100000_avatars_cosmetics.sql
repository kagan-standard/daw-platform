-- Avatars rollout: allow cosmetic type 'avatar' and profile equipped_avatar_id.
-- No changes to user_cosmetics or tabs_ledger; purchase flow is type-agnostic.

-- Allow cosmetic type 'avatar'
ALTER TABLE public.cosmetics DROP CONSTRAINT IF EXISTS cosmetics_type_check;
ALTER TABLE public.cosmetics ADD CONSTRAINT cosmetics_type_check CHECK (type IN ('border', 'title', 'avatar'));

-- Profile equipped avatar
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_avatar_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_equipped_avatar_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_equipped_avatar_id_fkey
      FOREIGN KEY (equipped_avatar_id) REFERENCES public.cosmetics(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_equipped_avatar_id ON public.profiles(equipped_avatar_id);
