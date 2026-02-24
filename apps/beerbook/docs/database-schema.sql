-- ============================================
-- BeerBook — Canonical schema (post migration-2.1 + migration-3.1)
-- Keycloak-backed, no auth.users. RLS disabled Phase 1.
-- Catalog: breweries, beers, beer_styles, aliases, flavor_descriptors.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
GRANT USAGE ON SCHEMA public TO anon;

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT 'Beer Lover',
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL DEFAULT 'Anonymous',
    beer_name TEXT NOT NULL,
    brewery TEXT DEFAULT '',
    style TEXT NOT NULL,
    abv DECIMAL(4,1),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    flavor_hoppy INTEGER DEFAULT 0 CHECK (flavor_hoppy >= 0 AND flavor_hoppy <= 5),
    flavor_malty INTEGER DEFAULT 0 CHECK (flavor_malty >= 0 AND flavor_malty <= 5),
    flavor_bitter INTEGER DEFAULT 0 CHECK (flavor_bitter >= 0 AND flavor_bitter <= 5),
    flavor_sweet INTEGER DEFAULT 0 CHECK (flavor_sweet >= 0 AND flavor_sweet <= 5),
    flavor_fruity INTEGER DEFAULT 0 CHECK (flavor_fruity >= 0 AND flavor_fruity <= 5),
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    yg_value DECIMAL(3,1) CHECK (yg_value >= 0.1 AND yg_value <= 10.0),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    location_name VARCHAR(255),
    venue_id TEXT,
    photo_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_beer_name ON ratings(beer_name);
CREATE INDEX IF NOT EXISTS idx_ratings_style ON ratings(style);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON ratings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_rating ON ratings(rating);

CREATE TABLE IF NOT EXISTS venues (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL,
    address TEXT,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    venue_type TEXT CHECK (venue_type IN ('brewery', 'bar', 'restaurant') OR venue_type IS NULL),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_venues_geo ON venues(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_venues_name ON venues(name);

CREATE TABLE IF NOT EXISTS happy_hours (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    description TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_count INTEGER DEFAULT 1,
    last_confirmed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_happy_hours_venue ON happy_hours(venue_id);
CREATE INDEX IF NOT EXISTS idx_happy_hours_day ON happy_hours(day_of_week);

CREATE TABLE IF NOT EXISTS price_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    venue_id TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    beer_name TEXT NOT NULL,
    style TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    is_happy_hour BOOLEAN DEFAULT FALSE,
    rating_id TEXT REFERENCES ratings(id) ON DELETE SET NULL,
    logged_by TEXT NOT NULL,
    logged_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_count INTEGER DEFAULT 1,
    last_confirmed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_logs_venue ON price_logs(venue_id);
CREATE INDEX IF NOT EXISTS idx_price_logs_beer ON price_logs(beer_name);
CREATE INDEX IF NOT EXISTS idx_price_logs_logged_at ON price_logs(logged_at DESC);

CREATE TABLE IF NOT EXISTS reactions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    rating_id TEXT NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    reaction_type TEXT NOT NULL DEFAULT 'cheers' CHECK (reaction_type IN ('cheers')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(rating_id, user_id, reaction_type)
);
CREATE INDEX IF NOT EXISTS idx_reactions_rating ON reactions(rating_id);

GRANT SELECT ON profiles TO anon;
GRANT SELECT ON ratings TO anon;
GRANT SELECT ON venues TO anon;
GRANT SELECT ON happy_hours TO anon;
GRANT SELECT ON price_logs TO anon;
GRANT SELECT ON reactions TO anon;

CREATE SCHEMA IF NOT EXISTS _realtime;
DO $$ BEGIN EXECUTE 'CREATE PUBLICATION supabase_realtime'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE ratings; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE VIEW beer_averages AS
SELECT beer_name, brewery, style,
    COUNT(*) as review_count,
    ROUND(AVG(rating)::numeric, 2) as avg_rating,
    ROUND(AVG(yg_value)::numeric, 2) as avg_yg_value,
    ROUND(AVG(flavor_hoppy)::numeric, 1) as avg_hoppy,
    ROUND(AVG(flavor_malty)::numeric, 1) as avg_malty,
    ROUND(AVG(flavor_bitter)::numeric, 1) as avg_bitter,
    ROUND(AVG(flavor_sweet)::numeric, 1) as avg_sweet,
    ROUND(AVG(flavor_fruity)::numeric, 1) as avg_fruity,
    MAX(created_at) as last_reviewed
FROM ratings GROUP BY beer_name, brewery, style ORDER BY avg_rating DESC;

CREATE OR REPLACE VIEW yg_exchange AS
SELECT beer_name, brewery, style,
    COUNT(*) as rating_count,
    ROUND(AVG(yg_value)::numeric, 2) as yg_rate,
    ROUND(AVG(rating)::numeric, 2) as avg_stars,
    MIN(yg_value) as yg_low,
    MAX(yg_value) as yg_high
FROM ratings WHERE yg_value IS NOT NULL
GROUP BY beer_name, brewery, style ORDER BY yg_rate DESC;

CREATE OR REPLACE VIEW venue_menus AS
SELECT DISTINCT ON (venue_id, beer_name)
    venue_id, beer_name, style, price_cents,
    is_happy_hour, logged_by, logged_at,
    confirmed_count, last_confirmed_at
FROM price_logs ORDER BY venue_id, beer_name, logged_at DESC;

GRANT SELECT ON beer_averages TO anon;
GRANT SELECT ON yg_exchange TO anon;
GRANT SELECT ON venue_menus TO anon;

CREATE OR REPLACE FUNCTION venues_within_radius(lat DECIMAL, lng DECIMAL, radius_m INTEGER)
RETURNS SETOF venues AS $$
    SELECT * FROM venues
    WHERE (
        6371000 * acos(
            cos(radians(lat)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians(lng)) +
            sin(radians(lat)) * sin(radians(latitude))
        )
    ) <= radius_m;
$$ LANGUAGE sql STABLE;

-- ========== Catalog (migration-3.1) ==========
CREATE TABLE IF NOT EXISTS breweries (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    normalized_name TEXT,
    street TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'US',
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    phone TEXT,
    website_url TEXT,
    referral_url TEXT,
    brewery_type TEXT,
    logo_url TEXT,
    description TEXT,
    source TEXT NOT NULL DEFAULT 'user_submitted',
    source_id TEXT,
    import_batch_id TEXT,
    verified BOOLEAN DEFAULT FALSE,
    claimed BOOLEAN DEFAULT FALSE,
    crew_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_breweries_slug ON breweries(slug);
CREATE INDEX IF NOT EXISTS idx_breweries_normalized_name ON breweries(normalized_name);
CREATE INDEX IF NOT EXISTS idx_breweries_name_trgm ON breweries USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_breweries_city_state ON breweries(state, city);
CREATE INDEX IF NOT EXISTS idx_breweries_geo ON breweries(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_breweries_source ON breweries(source);
GRANT SELECT ON breweries TO anon;

CREATE TABLE IF NOT EXISTS beers (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL,
    slug TEXT,
    normalized_name TEXT,
    brewery_id TEXT REFERENCES breweries(id) ON DELETE SET NULL,
    brewery_name TEXT,
    style TEXT,
    style_category TEXT,
    style_source TEXT DEFAULT 'inferred',
    abv DECIMAL(4,2),
    ibu_min INTEGER,
    ibu_max INTEGER,
    srm INTEGER,
    flavor_astringency INTEGER,
    flavor_body INTEGER,
    flavor_alcohol INTEGER,
    flavor_bitter INTEGER,
    flavor_sweet INTEGER,
    flavor_sour INTEGER,
    flavor_salty INTEGER,
    flavor_fruity INTEGER,
    flavor_hoppy INTEGER,
    flavor_spicy INTEGER,
    flavor_malty INTEGER,
    review_aroma DECIMAL(4,2),
    review_appearance DECIMAL(4,2),
    review_palate DECIMAL(4,2),
    review_taste DECIMAL(4,2),
    review_overall DECIMAL(4,2),
    review_count INTEGER DEFAULT 0,
    description TEXT,
    flavor_notes TEXT[],
    ingredients JSONB,
    food_pairings TEXT[],
    image_url TEXT,
    label_url TEXT,
    source TEXT NOT NULL DEFAULT 'user_submitted',
    source_id TEXT,
    source_brewery_id TEXT,
    import_batch_id TEXT,
    verified BOOLEAN DEFAULT FALSE,
    submitted_by TEXT,
    crew_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brewery_id, normalized_name)
);
CREATE INDEX IF NOT EXISTS idx_beers_slug ON beers(slug);
CREATE INDEX IF NOT EXISTS idx_beers_normalized_name ON beers(normalized_name);
CREATE INDEX IF NOT EXISTS idx_beers_name_trgm ON beers USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_beers_brewery_id ON beers(brewery_id);
CREATE INDEX IF NOT EXISTS idx_beers_style ON beers(style);
CREATE INDEX IF NOT EXISTS idx_beers_style_category ON beers(style_category);
CREATE INDEX IF NOT EXISTS idx_beers_source ON beers(source);
CREATE INDEX IF NOT EXISTS idx_beers_review_overall ON beers(review_overall DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_beers_review_count ON beers(review_count DESC NULLS LAST);
GRANT SELECT ON beers TO anon;

CREATE TABLE IF NOT EXISTS beer_styles (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    description TEXT,
    abv_min DECIMAL(4,2),
    abv_max DECIMAL(4,2),
    ibu_min INTEGER,
    ibu_max INTEGER
);
GRANT SELECT ON beer_styles TO anon;

CREATE TABLE IF NOT EXISTS brewery_aliases (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    brewery_id TEXT NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    source TEXT DEFAULT 'import',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brewery_id, normalized_alias)
);
CREATE INDEX IF NOT EXISTS idx_brewery_aliases_normalized ON brewery_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_brewery_aliases_trgm ON brewery_aliases USING gin(alias_name gin_trgm_ops);
GRANT SELECT ON brewery_aliases TO anon;

CREATE TABLE IF NOT EXISTS beer_aliases (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    beer_id TEXT NOT NULL REFERENCES beers(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    source TEXT DEFAULT 'import',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(beer_id, normalized_alias)
);
CREATE INDEX IF NOT EXISTS idx_beer_aliases_normalized ON beer_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_beer_aliases_trgm ON beer_aliases USING gin(alias_name gin_trgm_ops);
GRANT SELECT ON beer_aliases TO anon;

CREATE TABLE IF NOT EXISTS flavor_descriptors (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    keyword TEXT NOT NULL,
    impact INTEGER DEFAULT 1,
    UNIQUE(category, keyword)
);
CREATE INDEX IF NOT EXISTS idx_descriptors_category ON flavor_descriptors(category);
GRANT SELECT ON flavor_descriptors TO anon;

ALTER TABLE ratings ADD COLUMN IF NOT EXISTS beer_id TEXT REFERENCES beers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ratings_beer_id ON ratings(beer_id);

CREATE OR REPLACE FUNCTION search_beer_catalog(search_term TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE (id TEXT, name TEXT, brewery_name TEXT, style TEXT, abv DECIMAL(4,2), review_overall DECIMAL(4,2), review_count INTEGER, source TEXT, similarity_score REAL) AS $$
BEGIN
    RETURN QUERY
    SELECT b.id::TEXT, b.name, b.brewery_name, b.style, b.abv, b.review_overall, b.review_count, b.source,
        greatest(similarity(b.name, search_term), similarity(b.brewery_name || ' ' || b.name, search_term))::REAL
    FROM beers b
    WHERE b.name ILIKE search_term || '%' OR (b.brewery_name || ' ' || b.name) ILIKE '%' || search_term || '%'
        OR b.brewery_name ILIKE search_term || '%' OR similarity(b.name, search_term) > 0.3
    ORDER BY CASE WHEN b.name ILIKE search_term || '%' THEN 0 ELSE 1 END,
        greatest(similarity(b.name, search_term), similarity(b.brewery_name || ' ' || b.name, search_term)) DESC,
        b.review_count DESC NULLS LAST
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;
GRANT EXECUTE ON FUNCTION search_beer_catalog(TEXT, INTEGER) TO anon;

CREATE OR REPLACE FUNCTION search_breweries(search_term TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  slug TEXT,
  city TEXT,
  state TEXT,
  brewery_type TEXT,
  logo_url TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  verified BOOLEAN,
  similarity_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT sub.id, sub.name, sub.slug, sub.city, sub.state, sub.brewery_type, sub.logo_url,
    sub.latitude, sub.longitude, sub.verified, sub.sim
  FROM (
    SELECT DISTINCT ON (b.id)
      b.id::TEXT AS id,
      b.name,
      b.slug,
      b.city,
      b.state,
      b.brewery_type,
      b.logo_url,
      b.latitude,
      b.longitude,
      b.verified,
      greatest(
        similarity(b.name, search_term),
        COALESCE((SELECT MAX(similarity(ba.alias_name, search_term)) FROM brewery_aliases ba WHERE ba.brewery_id = b.id), 0)
      )::REAL AS sim
    FROM breweries b
    WHERE b.name ILIKE search_term || '%'
      OR b.name ILIKE '%' || search_term || '%'
      OR (b.normalized_name IS NOT NULL AND b.normalized_name ILIKE '%' || lower(search_term) || '%')
      OR similarity(b.name, search_term) > 0.3
      OR b.id IN (
        SELECT ba.brewery_id FROM brewery_aliases ba
        WHERE ba.alias_name ILIKE search_term || '%' OR similarity(ba.alias_name, search_term) > 0.3
      )
    ORDER BY b.id,
      CASE WHEN b.name ILIKE search_term || '%' THEN 0 ELSE 1 END,
      greatest(
        similarity(b.name, search_term),
        COALESCE((SELECT MAX(similarity(ba.alias_name, search_term)) FROM brewery_aliases ba WHERE ba.brewery_id = b.id), 0)
      ) DESC,
      b.name ASC
  ) sub
  ORDER BY
    CASE WHEN sub.name ILIKE search_term || '%' THEN 0 ELSE 1 END,
    sub.sim DESC,
    sub.name ASC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;
GRANT EXECUTE ON FUNCTION search_breweries(TEXT, INTEGER) TO anon;

DROP TRIGGER IF EXISTS breweries_updated_at ON breweries;
CREATE TRIGGER breweries_updated_at BEFORE UPDATE ON breweries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS beers_updated_at ON beers;
CREATE TRIGGER beers_updated_at BEFORE UPDATE ON beers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========== Tabs System ==========
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
CREATE TRIGGER user_tabs_profile_updated_at BEFORE UPDATE ON user_tabs_profile FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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

-- ========== Crews & Follows (Phase 3.0) ==========
CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL,
    followed_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, followed_id),
    CHECK (follower_id != followed_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);
GRANT SELECT ON follows TO anon;

CREATE TABLE IF NOT EXISTS crews (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL CHECK (char_length(name) <= 50),
    created_by TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crews_invite_code ON crews(invite_code);
CREATE INDEX IF NOT EXISTS idx_crews_created_by ON crews(created_by);
GRANT SELECT ON crews TO anon;

CREATE TABLE IF NOT EXISTS crew_members (
    crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (crew_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_crew_members_user ON crew_members(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON crew_members(crew_id);
GRANT SELECT ON crew_members TO anon;

CREATE OR REPLACE VIEW crew_summary AS
SELECT
    c.id,
    c.name,
    c.created_by,
    c.invite_code,
    c.created_at,
    COUNT(cm.user_id) AS member_count
FROM crews c
LEFT JOIN crew_members cm ON cm.crew_id = c.id
GROUP BY c.id, c.name, c.created_by, c.invite_code, c.created_at;
GRANT SELECT ON crew_summary TO anon;

CREATE OR REPLACE VIEW follow_counts AS
SELECT
    p.id AS user_id,
    COALESCE(fr.follower_count, 0) AS follower_count,
    COALESCE(fg.following_count, 0) AS following_count
FROM profiles p
LEFT JOIN (
    SELECT followed_id, COUNT(*) AS follower_count
    FROM follows
    GROUP BY followed_id
) fr ON fr.followed_id = p.id
LEFT JOIN (
    SELECT follower_id, COUNT(*) AS following_count
    FROM follows
    GROUP BY follower_id
) fg ON fg.follower_id = p.id;
GRANT SELECT ON follow_counts TO anon;
