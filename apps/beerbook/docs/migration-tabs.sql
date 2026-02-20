-- ============================================
-- Tabs System - Migration (idempotent)
-- Run: docker exec -i supabase-db psql -U postgres -d postgres < apps/beerbook/docs/migration-tabs.sql
-- ============================================

DO $$ BEGIN
  CREATE TYPE user_tier AS ENUM ('taster', 'regular', 'local', 'patron', 'house_account', 'cellar_reserve');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tab_transaction_type AS ENUM ('earn', 'spend', 'admin_adjust', 'reward_redeem');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tab_earn_source AS ENUM (
    'rating_base',
    'rating_location',
    'rating_photo',
    'rating_price',
    'rating_review',
    'new_beer_approved',
    'cheers_given',
    'cheers_received',
    'admin_grant',
    'bonus'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_tabs_profile (
    user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    current_tier user_tier NOT NULL DEFAULT 'taster',
    tier_promoted_at TIMESTAMPTZ,
    is_seeder BOOLEAN NOT NULL DEFAULT FALSE,
    seeder_granted_at TIMESTAMPTZ,
    seeder_granted_by TEXT,
    tab_balance INTEGER NOT NULL DEFAULT 0,
    lifetime_tabs_earned INTEGER NOT NULL DEFAULT 0,
    ratings_this_week INTEGER NOT NULL DEFAULT 0,
    week_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('week', NOW()),
    current_streak_weeks INTEGER NOT NULL DEFAULT 0,
    longest_streak_weeks INTEGER NOT NULL DEFAULT 0,
    last_active_week TIMESTAMPTZ,
    weeks_inactive INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_tabs_tier ON user_tabs_profile(current_tier);
CREATE INDEX IF NOT EXISTS idx_user_tabs_seeder ON user_tabs_profile(is_seeder) WHERE is_seeder = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_tabs_balance ON user_tabs_profile(tab_balance DESC);

CREATE TABLE IF NOT EXISTS tab_transactions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    transaction_type tab_transaction_type NOT NULL,
    amount INTEGER NOT NULL,
    earn_source tab_earn_source,
    base_amount INTEGER,
    tier_multiplier DECIMAL(3,2),
    seeder_multiplier DECIMAL(3,2),
    rating_id TEXT REFERENCES ratings(id) ON DELETE SET NULL,
    related_entity_id TEXT,
    admin_user_id TEXT,
    admin_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tab_tx_user ON tab_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tab_tx_created ON tab_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tab_tx_type ON tab_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_tab_tx_rating ON tab_transactions(rating_id) WHERE rating_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tab_tx_user_week ON tab_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tier_requirements (
    tier user_tier PRIMARY KEY,
    display_name TEXT NOT NULL,
    display_order INTEGER NOT NULL,
    multiplier DECIMAL(3,2) NOT NULL,
    required_ratings_per_week INTEGER NOT NULL DEFAULT 0,
    required_reviews_per_week INTEGER NOT NULL DEFAULT 0,
    required_contributions_per_week INTEGER NOT NULL DEFAULT 0,
    required_consecutive_weeks INTEGER NOT NULL DEFAULT 0,
    maintenance_ratings_per_week INTEGER NOT NULL DEFAULT 2
);

INSERT INTO tier_requirements (tier, display_name, display_order, multiplier, required_ratings_per_week, required_reviews_per_week, required_contributions_per_week, required_consecutive_weeks)
VALUES
    ('taster',        'Taster',         1, 1.00, 0, 0, 0, 0),
    ('regular',       'Regular',        2, 1.10, 4, 0, 0, 3),
    ('local',         'Local',          3, 1.25, 4, 1, 0, 6),
    ('patron',        'Patron',         4, 1.40, 5, 2, 0, 8),
    ('house_account', 'House Account',  5, 1.60, 6, 2, 1, 12),
    ('cellar_reserve','Cellar Reserve', 6, 1.80, 6, 3, 1, 26)
ON CONFLICT (tier) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    display_order = EXCLUDED.display_order,
    multiplier = EXCLUDED.multiplier,
    required_ratings_per_week = EXCLUDED.required_ratings_per_week,
    required_reviews_per_week = EXCLUDED.required_reviews_per_week,
    required_contributions_per_week = EXCLUDED.required_contributions_per_week,
    required_consecutive_weeks = EXCLUDED.required_consecutive_weeks;

CREATE TABLE IF NOT EXISTS beer_submissions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    submitted_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    beer_name TEXT NOT NULL,
    brewery TEXT,
    style TEXT,
    abv DECIMAL(4,1),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_beer_id TEXT,
    tabs_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beer_sub_status ON beer_submissions(status);
CREATE INDEX IF NOT EXISTS idx_beer_sub_user ON beer_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_beer_sub_created ON beer_submissions(created_at DESC);

CREATE TABLE IF NOT EXISTS tab_notifications (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'tier_promotion',
        'tier_demotion',
        'streak_at_risk',
        'approaching_demotion',
        'tabs_earned',
        'beer_approved',
        'beer_rejected',
        'seeder_granted',
        'reward_eligible',
        'weekly_summary'
    )),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tab_notif_user ON tab_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tab_notif_unread ON tab_notifications(user_id) WHERE is_read = FALSE;

GRANT SELECT ON user_tabs_profile TO anon;
GRANT SELECT ON tab_transactions TO anon;
GRANT SELECT ON tier_requirements TO anon;
GRANT SELECT ON beer_submissions TO anon;
GRANT SELECT ON tab_notifications TO anon;

DROP TRIGGER IF EXISTS user_tabs_profile_updated_at ON user_tabs_profile;
CREATE TRIGGER user_tabs_profile_updated_at
    BEFORE UPDATE ON user_tabs_profile
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE VIEW tabs_leaderboard AS
SELECT
    utp.user_id,
    p.display_name,
    p.avatar_url,
    utp.current_tier,
    utp.is_seeder,
    utp.tab_balance,
    utp.lifetime_tabs_earned,
    utp.current_streak_weeks,
    tr.display_name as tier_display_name,
    tr.multiplier as tier_multiplier
FROM user_tabs_profile utp
JOIN profiles p ON p.id = utp.user_id
JOIN tier_requirements tr ON tr.tier = utp.current_tier
ORDER BY utp.lifetime_tabs_earned DESC;

GRANT SELECT ON tabs_leaderboard TO anon;

CREATE OR REPLACE VIEW weekly_tab_activity AS
SELECT
    utp.user_id,
    p.display_name,
    utp.ratings_this_week,
    utp.current_tier,
    utp.is_seeder,
    utp.current_streak_weeks,
    tr.required_ratings_per_week as target_ratings,
    tr.required_reviews_per_week as target_reviews,
    CASE
        WHEN utp.ratings_this_week >= 10 THEN TRUE
        ELSE FALSE
    END as weekly_cap_reached
FROM user_tabs_profile utp
JOIN profiles p ON p.id = utp.user_id
JOIN tier_requirements tr ON tr.tier = utp.current_tier;

GRANT SELECT ON weekly_tab_activity TO anon;

ALTER TABLE ratings ADD COLUMN IF NOT EXISTS price_cents INTEGER CHECK (price_cents > 0);
