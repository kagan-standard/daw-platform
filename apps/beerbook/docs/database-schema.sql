-- ============================================
-- BeerBook — Canonical schema (post migration-2.1)
-- Keycloak-backed, no auth.users. RLS disabled Phase 1.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
