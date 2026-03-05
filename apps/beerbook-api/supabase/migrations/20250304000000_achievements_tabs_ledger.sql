-- ============================================
-- BeerBook Backend: Achievements + Tabs Ledger
-- Keycloak-backed: user_id = Keycloak sub (text). No auth.users.
-- ============================================

-- 1) Achievement categories
CREATE TABLE IF NOT EXISTS achievement_categories (
  key text PRIMARY KEY,
  name text NOT NULL,
  icon text,
  sort_order int NOT NULL DEFAULT 0
);

-- 2) Achievements
CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  category_key text NOT NULL REFERENCES achievement_categories(key),
  subtype text NOT NULL,
  trigger_type text NOT NULL,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_hidden boolean NOT NULL DEFAULT false,
  difficulty text NOT NULL DEFAULT 'easy',
  reward_tabs int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) User achievement unlocks (server-only writes). user_id = Keycloak sub (text).
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id text NOT NULL,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);

-- 4) Tabs ledger: id = PK; event_id = idempotency key (unique). One row per award event.
DROP TABLE IF EXISTS tabs_ledger;
CREATE TABLE tabs_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  user_id text NOT NULL,
  event_type text NOT NULL,
  amount int NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_achievements_trigger_type ON achievements(trigger_type);
CREATE INDEX idx_tabs_ledger_user_created ON tabs_ledger(user_id, created_at DESC);
CREATE INDEX idx_tabs_ledger_event_type ON tabs_ledger(event_type);
CREATE INDEX idx_tabs_ledger_user_event_created ON tabs_ledger(user_id, event_type, created_at DESC);

-- 5) profiles: only add tabs_balance (do not add current_tier / is_seeder here)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tabs_balance int NOT NULL DEFAULT 0;

-- Trigger: update-only. Increment profiles.tabs_balance where row exists; do not insert.
CREATE OR REPLACE FUNCTION tabs_ledger_after_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles SET tabs_balance = tabs_balance + NEW.amount WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_tabs_ledger_after_insert ON tabs_ledger;
CREATE TRIGGER tr_tabs_ledger_after_insert
  AFTER INSERT ON tabs_ledger
  FOR EACH ROW EXECUTE FUNCTION tabs_ledger_after_insert();

-- 6) RLS (Keycloak: no auth.uid(); server/service_role only for user_achievements + tabs_ledger)
ALTER TABLE achievement_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabs_ledger ENABLE ROW LEVEL SECURITY;

-- achievement_categories + achievements: read for anon + authenticated
DROP POLICY IF EXISTS "achievement_categories_select_anon" ON achievement_categories;
CREATE POLICY "achievement_categories_select_anon" ON achievement_categories FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "achievement_categories_select_authenticated" ON achievement_categories;
CREATE POLICY "achievement_categories_select_authenticated" ON achievement_categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "achievements_select_anon" ON achievements;
CREATE POLICY "achievements_select_anon" ON achievements FOR SELECT TO anon USING (active = true);
DROP POLICY IF EXISTS "achievements_select_authenticated" ON achievements;
CREATE POLICY "achievements_select_authenticated" ON achievements FOR SELECT TO authenticated USING (active = true);

-- user_achievements + tabs_ledger: no client policies (Keycloak JWT not in auth.uid()).
-- Clients get their data via BFF or process-event; service_role used by Edge Function/BFF.
-- No INSERT/UPDATE/DELETE for anon or authenticated.

COMMENT ON TABLE achievement_categories IS 'BeerBook achievement category metadata; read-only for clients.';
COMMENT ON TABLE achievements IS 'BeerBook achievement definitions; only active achievements visible.';
COMMENT ON TABLE user_achievements IS 'Unlocks written only by process-event (Keycloak user_id = sub).';
COMMENT ON TABLE tabs_ledger IS 'Append-only Tabs log; one row per award event; event_id = idempotency key (BFF-generated).';
