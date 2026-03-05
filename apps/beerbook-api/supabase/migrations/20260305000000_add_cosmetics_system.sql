-- ============================================
-- BeerBook Backend: Cosmetics system
-- Keycloak-backed: user_id = Keycloak sub (text)
-- ============================================

-- Cosmetics catalog
CREATE TABLE IF NOT EXISTS public.cosmetics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  type text NOT NULL CHECK (type IN ('border', 'title')),
  name text NOT NULL,
  description text NOT NULL,
  rarity text NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  asset_url text,
  preview_asset_url text,
  title_text text,
  unlock_type text NOT NULL CHECK (unlock_type IN ('achievement', 'purchase', 'both')),
  achievement_key text REFERENCES public.achievements(key),
  tab_price int,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Migration safety for environments where table already exists
ALTER TABLE public.cosmetics ADD COLUMN IF NOT EXISTS asset_url text;
ALTER TABLE public.cosmetics ADD COLUMN IF NOT EXISTS preview_asset_url text;
ALTER TABLE public.cosmetics ADD COLUMN IF NOT EXISTS title_text text;
ALTER TABLE public.cosmetics ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.cosmetics ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;
ALTER TABLE public.cosmetics ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cosmetics_type_check'
  ) THEN
    ALTER TABLE public.cosmetics
      ADD CONSTRAINT cosmetics_type_check CHECK (type IN ('border', 'title'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cosmetics_rarity_check'
  ) THEN
    ALTER TABLE public.cosmetics
      ADD CONSTRAINT cosmetics_rarity_check CHECK (rarity IN ('common', 'rare', 'epic', 'legendary'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cosmetics_unlock_type_check'
  ) THEN
    ALTER TABLE public.cosmetics
      ADD CONSTRAINT cosmetics_unlock_type_check CHECK (unlock_type IN ('achievement', 'purchase', 'both'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cosmetics_achievement_key_fkey'
  ) THEN
    ALTER TABLE public.cosmetics
      ADD CONSTRAINT cosmetics_achievement_key_fkey
      FOREIGN KEY (achievement_key) REFERENCES public.achievements(key);
  END IF;
END
$$;

-- User-owned cosmetics
CREATE TABLE IF NOT EXISTS public.user_cosmetics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  cosmetic_id uuid NOT NULL REFERENCES public.cosmetics(id) ON DELETE CASCADE,
  acquired_via text NOT NULL CHECK (acquired_via IN ('achievement', 'purchase')),
  acquired_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_cosmetics_user_cosmetic_unique
  ON public.user_cosmetics(user_id, cosmetic_id);
CREATE INDEX IF NOT EXISTS idx_user_cosmetics_user_acquired_at
  ON public.user_cosmetics(user_id, acquired_at DESC);

-- Profile equipped cosmetics
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_border_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS equipped_title_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_equipped_border_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_equipped_border_id_fkey
      FOREIGN KEY (equipped_border_id) REFERENCES public.cosmetics(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_equipped_title_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_equipped_title_id_fkey
      FOREIGN KEY (equipped_title_id) REFERENCES public.cosmetics(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_cosmetics_active_sort_order
  ON public.cosmetics(active, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_cosmetics_achievement_key
  ON public.cosmetics(achievement_key);

-- Atomic purchase RPC by cosmetic key
CREATE OR REPLACE FUNCTION public.purchase_cosmetic(p_user_id text, p_cosmetic_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cosmetic RECORD;
  v_tabs_balance int;
  v_user_cosmetic_id uuid;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_user_id',
      'message', 'p_user_id is required'
    );
  END IF;

  IF p_cosmetic_key IS NULL OR btrim(p_cosmetic_key) = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_cosmetic_key',
      'message', 'p_cosmetic_key is required'
    );
  END IF;

  SELECT
    id, key, type, unlock_type, tab_price, active
  INTO v_cosmetic
  FROM public.cosmetics
  WHERE key = p_cosmetic_key
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'cosmetic_not_found',
      'message', 'Cosmetic not found'
    );
  END IF;

  IF COALESCE(v_cosmetic.active, false) = false THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'cosmetic_inactive',
      'message', 'Cosmetic is not active'
    );
  END IF;

  IF v_cosmetic.unlock_type NOT IN ('purchase', 'both') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'not_purchasable',
      'message', 'Cosmetic is not purchasable'
    );
  END IF;

  IF v_cosmetic.tab_price IS NULL OR v_cosmetic.tab_price < 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_tab_price',
      'message', 'Cosmetic tab_price is invalid'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_cosmetics uc
    WHERE uc.user_id = p_user_id
      AND uc.cosmetic_id = v_cosmetic.id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'already_owned',
      'message', 'Cosmetic already owned'
    );
  END IF;

  SELECT tabs_balance
  INTO v_tabs_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'profile_not_found',
      'message', 'Profile not found'
    );
  END IF;

  IF COALESCE(v_tabs_balance, 0) < v_cosmetic.tab_price THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'insufficient_balance',
      'message', 'Insufficient tabs balance',
      'tabs_balance', COALESCE(v_tabs_balance, 0),
      'tab_price', v_cosmetic.tab_price
    );
  END IF;

  INSERT INTO public.tabs_ledger (
    event_id,
    user_id,
    event_type,
    amount,
    breakdown,
    context
  )
  VALUES (
    gen_random_uuid(),
    p_user_id,
    'spend',
    -v_cosmetic.tab_price,
    '{}'::jsonb,
    jsonb_build_object(
      'reason', 'cosmetic_purchase',
      'cosmetic_id', v_cosmetic.id,
      'cosmetic_key', v_cosmetic.key
    )
  );

  INSERT INTO public.user_cosmetics (
    user_id,
    cosmetic_id,
    acquired_via
  )
  VALUES (
    p_user_id,
    v_cosmetic.id,
    'purchase'
  )
  RETURNING id INTO v_user_cosmetic_id;

  SELECT tabs_balance
  INTO v_tabs_balance
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'user_cosmetic_id', v_user_cosmetic_id,
    'cosmetic_id', v_cosmetic.id,
    'cosmetic_key', v_cosmetic.key,
    'tabs_spent', v_cosmetic.tab_price,
    'tabs_balance', COALESCE(v_tabs_balance, 0),
    'acquired_via', 'purchase'
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'already_owned',
      'message', 'Cosmetic already owned'
    );
END;
$$;
