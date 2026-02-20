-- ============================================================
-- Admin & Referral Tracking Migration
-- Idempotent — safe to run multiple times
-- ============================================================

-- 2A: Referral click tracking table
CREATE TABLE IF NOT EXISTS referral_clicks (
    id TEXT PRIMARY KEY DEFAULT extensions.uuid_generate_v4()::text,
    user_id TEXT,
    target_type TEXT NOT NULL,
    target_id TEXT,
    target_name TEXT,
    destination_url TEXT NOT NULL,
    source_page TEXT,
    source_beer_id TEXT,
    source_brewery_id TEXT,
    referrer_path TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_target_type ON referral_clicks(target_type);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_target_id ON referral_clicks(target_id);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_user_id ON referral_clicks(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_created_at ON referral_clicks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_destination ON referral_clicks(destination_url);

-- 2B: Page view / session tracking (lightweight)
CREATE TABLE IF NOT EXISTS page_views (
    id TEXT PRIMARY KEY DEFAULT extensions.uuid_generate_v4()::text,
    user_id TEXT,
    page_path TEXT NOT NULL,
    session_id TEXT,
    referrer_url TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_user_id ON page_views(user_id);
CREATE INDEX IF NOT EXISTS idx_page_views_page_path ON page_views(page_path);
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON page_views(session_id);

-- 2C: Grants
GRANT ALL ON referral_clicks TO anon, authenticated, service_role;
GRANT ALL ON page_views TO anon, authenticated, service_role;
